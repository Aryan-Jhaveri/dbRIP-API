/**
 * BatchSearch — filter insertions by category, ME family, annotation, strand, chromosome (Tab 3).
 *
 * WHAT THIS PAGE DOES:
 *   Replicates the Shiny app's "Batch Search" tab. Users select combinations
 *   of checkboxes and dropdowns to filter insertions, then download the results.
 *   This is designed for quickly obtaining a large number of entries by criteria,
 *   which is much faster than scrolling through the Interactive Search table.
 *
 * HOW IT WORKS:
 *   1. User checks boxes / selects from dropdowns
 *   2. We build query parameters from the selected values
 *   3. useInsertions fetches matching rows from the API
 *   4. A count is shown ("X entries match your filters")
 *   5. User clicks Download to get a CSV via the export endpoint
 *
 * HOW FILTERS MAP TO THE API:
 *   The FastAPI endpoint GET /v1/insertions already supports:
 *     - me_category (Reference | Non-reference)
 *     - me_type (ALU | LINE1 | SVA | HERVK | PP)
 *     - annotation (PROMOTER | INTRONIC | etc.)
 *     - population (1000 Genomes pop code) + min_freq (allele frequency threshold)
 *   But it only takes ONE value per parameter for category/family/annotation.
 *   For multi-select (e.g. user checks both ALU and SVA), we'd need the API to
 *   support comma-separated values or repeated params. For now, we use the first
 *   selected value and note this as a TODO for API enhancement.
 *
 * FILTER OPTIONS:
 *   All values match exactly what the Shiny app offers. The values (not labels)
 *   are what gets sent to the API — e.g. "+" not "Positive" for strand.
 *
 * HOW THIS FILE CONNECTS TO THE REST:
 *   - useInsertions (hooks/useInsertions.ts) → fetches from FastAPI
 *   - buildExportUrl (api/client.ts) → builds the download link
 *   - ListInsertionsParams (api/client.ts) → type for query params
 */

import { useState, useMemo } from "react";
import { useInsertions } from "../hooks/useInsertions";
import { buildExportUrl, type ListInsertionsParams } from "../api/client";

// ── Filter option definitions ────────────────────────────────────────────
// Each group has a label (shown in the UI) and a list of options.
// option.value is sent to the API, option.label is shown to the user.

interface FilterOption {
  value: string;
  label: string;
}

const CATEGORIES: FilterOption[] = [
  { value: "Reference", label: "Reference" },
  { value: "Non-reference", label: "Non-reference" },
];

const ME_FAMILIES: FilterOption[] = [
  { value: "ALU", label: "Alu" },
  { value: "LINE1", label: "LINE1" },
  { value: "SVA", label: "SVA" },
  { value: "HERVK", label: "HERVK" },
  { value: "PP", label: "Processed Pseudogene" },
];

const ANNOTATIONS: FilterOption[] = [
  { value: "PROMOTER", label: "Promoter" },
  { value: "5_UTR", label: "5_UTR" },
  { value: "EXON", label: "Exon" },
  { value: "INTRONIC", label: "Intronic" },
  { value: "3_UTR", label: "3_UTR" },
  { value: "TERMINATOR", label: "Terminator" },
  { value: "INTERGENIC", label: "Intergenic" },
  { value: "null", label: "Undetermined" },
];

const STRANDS: FilterOption[] = [
  { value: "+", label: "Positive" },
  { value: "-", label: "Negative" },
  { value: "null", label: "Undetermined" },
];

// ── Population frequency options ─────────────────────────────────────────
// 5 super-populations + 26 sub-populations from the 1000 Genomes Project.
// Values match the population codes stored in the pop_frequencies table.
// "" means "no population filter" (show all insertions regardless of freq).

const POPULATIONS: FilterOption[] = [
  // Super-populations
  { value: "AFR", label: "AFR — African" },
  { value: "AMR", label: "AMR — Ad Mixed American" },
  { value: "EAS", label: "EAS — East Asian" },
  { value: "EUR", label: "EUR — European" },
  { value: "SAS", label: "SAS — South Asian" },
  // Sub-populations
  { value: "ACB", label: "ACB" },
  { value: "ASW", label: "ASW" },
  { value: "BEB", label: "BEB" },
  { value: "CDX", label: "CDX" },
  { value: "CEU", label: "CEU" },
  { value: "CHB", label: "CHB" },
  { value: "CHS", label: "CHS" },
  { value: "CLM", label: "CLM" },
  { value: "ESN", label: "ESN" },
  { value: "FIN", label: "FIN" },
  { value: "GBR", label: "GBR" },
  { value: "GIH", label: "GIH" },
  { value: "GWD", label: "GWD" },
  { value: "IBS", label: "IBS" },
  { value: "ITU", label: "ITU" },
  { value: "JPT", label: "JPT" },
  { value: "KHV", label: "KHV" },
  { value: "LWK", label: "LWK" },
  { value: "MSL", label: "MSL" },
  { value: "MXL", label: "MXL" },
  { value: "PEL", label: "PEL" },
  { value: "PJL", label: "PJL" },
  { value: "PUR", label: "PUR" },
  { value: "STU", label: "STU" },
  { value: "TSI", label: "TSI" },
  { value: "YRI", label: "YRI" },
];

// Preset allele frequency thresholds for the min_freq dropdown.
// "" maps to no filter; numeric strings are parsed to floats before sending.
const MIN_FREQ_OPTIONS: FilterOption[] = [
  { value: "", label: "Any frequency" },
  { value: "0.01", label: "≥ 1%" },
  { value: "0.05", label: "≥ 5%" },
  { value: "0.10", label: "≥ 10%" },
  { value: "0.50", label: "≥ 50%" },
];

const CHROMOSOMES: FilterOption[] = [
  ...Array.from({ length: 22 }, (_, i) => ({
    value: `chr${i + 1}`,
    label: `Chr${i + 1}`,
  })),
  { value: "chrX", label: "ChrX" },
  { value: "chrY", label: "ChrY" },
];

// ── Checkbox group sub-component ─────────────────────────────────────────

/**
 * CheckboxGroup — renders a labeled group of checkboxes.
 * Manages its own selected state via the parent's setter function.
 *
 * @param label     - Group heading (e.g. "By Category:")
 * @param options   - Available options with value/label pairs
 * @param selected  - Currently selected values (Set for O(1) lookup)
 * @param onChange  - Called with updated Set when a checkbox is toggled
 */
function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="text-sm font-semibold mb-1">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(opt.value)}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(opt.value)) {
                  next.delete(opt.value);
                } else {
                  next.add(opt.value);
                }
                onChange(next);
              }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function BatchSearch() {
  // ── Filter state ─────────────────────────────────────────────────────
  // Each filter group tracks its selected values as a Set of strings.
  // population and minFreq use plain strings ("" = no filter).
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [meFamilies, setMeFamilies] = useState<Set<string>>(new Set());
  const [annotations, setAnnotations] = useState<Set<string>>(new Set());
  const [strands, setStrands] = useState<Set<string>>(new Set());
  const [chromosomes, setChromosomes] = useState<Set<string>>(new Set());
  const [population, setPopulation] = useState("");
  const [minFreq, setMinFreq] = useState("");

  // ── Build API params from selected filters ───────────────────────────
  // Category/family/annotation: the API takes single values, so we only
  // apply them when exactly one option is checked. Strand and chrom support
  // comma-separated multi-values (e.g. strand="+,-", chrom="chr1,chr2").
  //
  // WHY limit=1? We only need the total count, not the actual rows. The API
  // always returns the total regardless of limit. Fetching 1 row is cheaper
  // than fetching 50 just to read the count field.
  const params: ListInsertionsParams = useMemo(() => {
    const p: ListInsertionsParams = { limit: 1, offset: 0 };
    if (categories.size === 1) p.me_category = [...categories][0];
    if (meFamilies.size === 1) p.me_type = [...meFamilies][0];
    if (annotations.size === 1) p.annotation = [...annotations][0];
    if (strands.size > 0) p.strand = [...strands].join(",");
    if (chromosomes.size > 0) p.chrom = [...chromosomes].join(",");
    if (population) p.population = population;
    if (population && minFreq) p.min_freq = parseFloat(minFreq);
    return p;
  }, [categories, meFamilies, annotations, strands, chromosomes, population, minFreq]);

  // ── Check if any filter is selected ──────────────────────────────────
  const hasFilters =
    categories.size > 0 ||
    meFamilies.size > 0 ||
    annotations.size > 0 ||
    strands.size > 0 ||
    chromosomes.size > 0 ||
    !!population;

  // ── Fetch count of matching results ──────────────────────────────────
  // We only fetch with limit=1 to get the total count — we don't need
  // the actual rows (the user downloads them via the export endpoint).
  const { data, isLoading } = useInsertions(hasFilters ? params : { limit: 1, offset: 0 });

  // ── Build export URL with current filters ────────────────────────────
  // The export URL must include all active filters so the downloaded CSV
  // matches what the count display shows. Strand and chrom are passed as
  // comma-separated strings — the API's export endpoint accepts the same
  // multi-value format as the list endpoint.
  const exportParams: ListInsertionsParams = {};
  if (categories.size === 1) exportParams.me_category = [...categories][0];
  if (meFamilies.size === 1) exportParams.me_type = [...meFamilies][0];
  if (annotations.size === 1) exportParams.annotation = [...annotations][0];
  if (strands.size > 0) exportParams.strand = [...strands].join(",");
  if (chromosomes.size > 0) exportParams.chrom = [...chromosomes].join(",");
  if (population) exportParams.population = population;
  if (population && minFreq) exportParams.min_freq = parseFloat(minFreq);
  const exportUrl = buildExportUrl("csv", exportParams);

  return (
    <div className="flex gap-8">
      {/* ── Left column: Category, ME Family, Annotation ───────────────── */}
      <div className="flex-1">
        <CheckboxGroup
          label="By Category:"
          options={CATEGORIES}
          selected={categories}
          onChange={setCategories}
        />
        <CheckboxGroup
          label="By ME Family:"
          options={ME_FAMILIES}
          selected={meFamilies}
          onChange={setMeFamilies}
        />
        <CheckboxGroup
          label="By Annotation:"
          options={ANNOTATIONS}
          selected={annotations}
          onChange={setAnnotations}
        />

        {/* Population Frequency filters */}
        {/* Two dropdowns: population selector + minimum allele frequency.
            Min freq is disabled until a population is chosen, because the
            API only applies the freq filter when population is provided. */}
        <fieldset className="mb-4">
          <legend className="text-sm font-semibold mb-1">By Population Frequency:</legend>
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm">
              Population:{" "}
              <select
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
                className="border border-black px-2 py-1 text-sm"
              >
                <option value="">Any population</option>
                {POPULATIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Min frequency:{" "}
              <select
                value={minFreq}
                onChange={(e) => setMinFreq(e.target.value)}
                disabled={!population}
                className="border border-black px-2 py-1 text-sm disabled:opacity-40"
              >
                {MIN_FREQ_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* Download + count */}
        <div className="mt-4 flex items-center gap-4">
          <a
            href={exportUrl}
            download
            className="border border-black px-3 py-1 text-sm no-underline hover:bg-gray-100 inline-block"
          >
            Download
          </a>
          <span className="text-sm">
            {isLoading
              ? "Counting..."
              : data
                ? `${data.total.toLocaleString()} entries match your filters`
                : "Select filters to search"}
          </span>
        </div>
      </div>

      {/* ── Right column: Genome, Organism, Chromosomes, Strand ─────────── */}
      <div className="flex-1">
        {/* Genome version — locked to GRCh38 for now */}
        <div className="mb-4">
          <label className="text-sm font-semibold block mb-1">By Genome Version:</label>
          <select className="border border-black px-2 py-1 text-sm" disabled>
            <option>GRCh38</option>
          </select>
        </div>

        {/* Organism — locked to Human for now */}
        <div className="mb-4">
          <label className="text-sm font-semibold block mb-1">By Organism:</label>
          <select className="border border-black px-2 py-1 text-sm" disabled>
            <option>Human</option>
          </select>
        </div>

        {/* Chromosomes — multi-select */}
        <div className="mb-4">
          <label className="text-sm font-semibold block mb-1">By Chromosomes:</label>
          <select
            multiple
            value={[...chromosomes]}
            onChange={(e) => {
              const selected = new Set(
                Array.from(e.target.selectedOptions, (opt) => opt.value)
              );
              setChromosomes(selected);
            }}
            className="border border-black px-2 py-1 text-sm w-full h-32"
          >
            {CHROMOSOMES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs mt-1">Hold Ctrl/Cmd to select multiple</p>
        </div>

        <CheckboxGroup
          label="By Strand:"
          options={STRANDS}
          selected={strands}
          onChange={setStrands}
        />
      </div>
    </div>
  );
}
