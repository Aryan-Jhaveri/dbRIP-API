"""
dbRIP-specific loader — implements BaseLoader for the dbRIP CSV format.

This is the only file that knows what the dbRIP CSV looks like. It reads the
CSV, renames columns to match the database schema, and reshapes the 33
population frequency columns into long format.

NO DATA IS REMOVED OR MODIFIED. Nulls, empty strings, and unexpected values
are preserved exactly as they appear in the CSV.

HOW IT WORKS:
    1. load_raw()           → pd.read_csv with index_col=0 to skip the unnamed
                               row-number column that R adds when exporting.
    2. normalize(df)        → Renames columns using the manifest's column_map
                               (e.g. "Chromosome" → "chrom"). Casts start/end
                               to integers and me_length to nullable int.
    3. to_insertions(df)    → Picks the 13 insertion columns, adds dataset_id
                               and assembly, returns list of dicts.
    4. to_pop_frequencies(df) → Uses pd.melt to reshape the 33 population
                               columns into long format (one row per
                               insertion × population).

CALLED BY:
    scripts/ingest.py — which reads the manifest YAML, instantiates this loader,
    calls loader.run(), and writes the results to the database.
"""

import pandas as pd

from ingest.base import BaseLoader


class DbRIPLoader(BaseLoader):
    """Loader for the dbRIP CSV (44,984 rows, 47 columns)."""

    def load_raw(self) -> pd.DataFrame:
        """Read the CSV as-is.

        index_col=0 skips the first unnamed column — this is a row number
        that R's write.csv() adds automatically. It's not part of the data.
        """
        return pd.read_csv(self.csv_path, index_col=0)

    def normalize(self, df: pd.DataFrame) -> pd.DataFrame:
        """Rename columns to match the DB schema. Cast numeric types.

        Only structural changes — no rows dropped, no values modified.
        """
        # Rename the 13 mapped columns (e.g. "Chromosome" → "chrom")
        df = df.rename(columns=self.column_map)

        # Cast coordinate columns to int (they come in as strings from the CSV)
        df["start"] = pd.to_numeric(df["start"], errors="coerce").astype("Int64")
        df["end"] = pd.to_numeric(df["end"], errors="coerce").astype("Int64")
        df["me_length"] = pd.to_numeric(df["me_length"], errors="coerce").astype("Int64")

        # Cast all population frequency columns to float
        all_pop_cols = self._all_pop_columns()
        for col in all_pop_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        return df

    def to_insertions(self, df: pd.DataFrame) -> list[dict]:
        """Extract rows for the `insertions` table.

        Each dict has the 13 columns from column_map plus dataset_id and assembly.
        """
        # The DB column names (values of the column_map)
        insertion_cols = list(self.column_map.values())

        # Only keep columns that exist in the dataframe
        available_cols = [c for c in insertion_cols if c in df.columns]
        records = df[available_cols].to_dict(orient="records")

        # Tag every row with which dataset and assembly it came from
        for row in records:
            row["dataset_id"] = self.dataset_id
            row["assembly"] = self.assembly

        return records

    def to_pop_frequencies(self, df: pd.DataFrame) -> list[dict]:
        """Melt the 33 population columns into long format.

        Input (wide — one column per population):
            id         All    EUR    AFR    ACB  ...
            A0000001   0.12   0.08   0.21   0.0  ...

        Output (long — one row per insertion × population):
            [{"insertion_id": "A0000001", "population": "All",  "af": 0.12},
             {"insertion_id": "A0000001", "population": "EUR",  "af": 0.08},
             {"insertion_id": "A0000001", "population": "AFR",  "af": 0.21},
             {"insertion_id": "A0000001", "population": "ACB",  "af": 0.0}, ...]

        WHY LONG FORMAT?
            Wide format (33 columns) is hard to query — you'd need to know the
            exact column name for each population. Long format lets you write:
                SELECT * FROM pop_frequencies WHERE population = 'EUR' AND af > 0.1
            instead of:
                SELECT * FROM insertions WHERE EUR > 0.1
        """
        all_pop_cols = self._all_pop_columns()

        # Only melt columns that actually exist in the dataframe
        pop_cols_present = [c for c in all_pop_cols if c in df.columns]

        if not pop_cols_present:
            return []

        melted = pd.melt(
            df,
            id_vars=["id"],
            value_vars=pop_cols_present,
            var_name="population",
            value_name="af",
        )

        melted = melted.rename(columns={"id": "insertion_id"})

        # Tag with dataset_id so we can cascade-delete by dataset
        melted["dataset_id"] = self.dataset_id

        return melted.to_dict(orient="records")

    # ── Helpers ──────────────────────────────────────────────────────────

    def _all_pop_columns(self) -> list[str]:
        """Return all population column names (individual + super) from the manifest."""
        individual = self.pop_columns.get("individual", [])
        super_pops = self.pop_columns.get("super", [])
        return individual + super_pops
