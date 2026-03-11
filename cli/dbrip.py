"""
dbrip — Command-line tool for querying the dbRIP API.

This is a thin wrapper around the dbRIP REST API. Every command builds query
parameters and sends an HTTP request to the running API server. It does NOT
access the database directly — the API handles all query logic.

WHY A THIN WRAPPER?
    - The API is the single source of truth for query logic
    - The CLI works against remote servers too (not just localhost)
    - No SQLAlchemy or database dependencies needed here
    - Adding a new API endpoint? Just add a new CLI command that calls it.

COMMANDS:
    dbrip search     Search insertions (list or region query)
    dbrip get        Get a single insertion by ID
    dbrip export     Download insertions as BED, VCF, or CSV
    dbrip stats      Summary counts grouped by a field
    dbrip datasets   List loaded datasets

CONFIGURATION:
    Set DBRIP_API_URL to point at a running API server:
        export DBRIP_API_URL=http://localhost:8000    (default)
        export DBRIP_API_URL=https://dbrip.example.com

USAGE EXAMPLES:
    dbrip search --region chr1:1M-5M --me-type ALU
    dbrip get A0000001
    dbrip export --format bed --me-type LINE1 -o line1.bed
    dbrip stats --by population
    dbrip search --region chr7:1M-50M --format bed | bedtools intersect -a - -b peaks.bed

HOW THIS FILE CONNECTS TO THE REST OF THE PROJECT:
    - Talks to app/ via HTTP (never imports app/ directly)
    - Registered as a console script in pyproject.toml:
        [project.scripts]
        dbrip = "cli.dbrip:app"
    - After `pip install -e .`, the `dbrip` command is available in your terminal
"""

import json
import os
import re
import sys
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.table import Table

# ── App setup ────────────────────────────────────────────────────────────
#
# Typer creates a CLI app object. Each @app.command() decorator registers
# a subcommand (like `dbrip search`, `dbrip get`, etc.).
# rich_markup_mode="rich" lets us use [bold], [green], etc. in help text.

app = typer.Typer(
    name="dbrip",
    help="Query the dbRIP database of retrotransposon insertion polymorphisms.",
    rich_markup_mode="rich",
    no_args_is_help=True,
)

# Rich console for pretty-printing tables.
# When stdout is piped (not a TTY), rich automatically disables colors
# and decorations, so output stays clean for awk/grep/bedtools.
console = Console()

# ── Helpers ──────────────────────────────────────────────────────────────


def _base_url() -> str:
    """Get the API base URL from the environment, or fall back to localhost.

    Researchers can point the CLI at any running API instance:
        export DBRIP_API_URL=https://dbrip.example.com
    """
    return os.environ.get("DBRIP_API_URL", "http://localhost:8000").rstrip("/")


def _get(path: str, params: dict | None = None) -> dict:
    """Send a GET request to the API and return the JSON response.

    This is the single point of contact with the API. Every command calls
    this instead of constructing httpx calls directly. If the API returns
    an error, we print a helpful message and exit.

    Args:
        path:   API path like "/v1/insertions" (will be joined with base URL)
        params: Optional query parameters dict (None values are stripped)
    """
    url = f"{_base_url()}{path}"

    # Strip None values so httpx doesn't send "?me_type=None"
    if params:
        params = {k: v for k, v in params.items() if v is not None}

    try:
        response = httpx.get(url, params=params, timeout=30.0)
    except httpx.ConnectError:
        console.print(
            f"[red]Error:[/red] Could not connect to API at {_base_url()}\n"
            "Is the server running? Start it with: uvicorn app.main:app --reload\n"
            "Or set DBRIP_API_URL to point at a different server.",
            style="red",
        )
        raise typer.Exit(code=1)

    # If the API returned an error (4xx or 5xx), show the detail message
    if response.status_code >= 400:
        detail = response.json().get("detail", response.text)
        console.print(f"[red]API error ({response.status_code}):[/red] {detail}")
        raise typer.Exit(code=1)

    return response.json()


def _get_raw(path: str, params: dict | None = None) -> httpx.Response:
    """Send a GET request and return the raw response (for file downloads).

    Used by the export command where we need the response body as text,
    not parsed JSON.
    """
    url = f"{_base_url()}{path}"
    if params:
        params = {k: v for k, v in params.items() if v is not None}

    try:
        response = httpx.get(url, params=params, timeout=60.0)
    except httpx.ConnectError:
        console.print(
            f"[red]Error:[/red] Could not connect to API at {_base_url()}\n"
            "Is the server running? Start it with: uvicorn app.main:app --reload",
            style="red",
        )
        raise typer.Exit(code=1)

    if response.status_code >= 400:
        detail = response.json().get("detail", response.text)
        console.print(f"[red]API error ({response.status_code}):[/red] {detail}")
        raise typer.Exit(code=1)

    return response


def _parse_region_shorthand(value: str) -> str:
    """Convert region shorthands like chr1:1M-5M → chr1:1000000-5000000.

    Bioinformaticians commonly use M (mega) and K (kilo) suffixes when
    talking about genomic positions. This converts them to plain integers
    so the API can parse them.

    Examples:
        chr1:1M-5M     → chr1:1000000-5000000
        chr7:500K-1M   → chr7:500000-1000000
        chr1:100-200   → chr1:100-200  (no change)
    """
    def _expand(m: re.Match) -> str:
        """Replace a number+suffix with the expanded integer."""
        num = float(m.group(1))
        suffix = m.group(2).upper()
        multiplier = {"K": 1_000, "M": 1_000_000}[suffix]
        return str(int(num * multiplier))

    # Match numbers followed by K or M (case-insensitive)
    return re.sub(r"(\d+(?:\.\d+)?)\s*([KkMm])", _expand, value)


def _build_filters(
    me_type: str | None = None,
    me_subtype: str | None = None,
    me_category: str | None = None,
    variant_class: str | None = None,
    annotation: str | None = None,
    dataset_id: str | None = None,
    population: str | None = None,
    min_freq: float | None = None,
    max_freq: float | None = None,
) -> dict:
    """Build a query params dict from filter arguments, skipping None values.

    These filters are shared across search, export, and stats commands.
    Rather than repeating the dict construction in each command, this helper
    does it once.
    """
    return {
        "me_type": me_type,
        "me_subtype": me_subtype,
        "me_category": me_category,
        "variant_class": variant_class,
        "annotation": annotation,
        "dataset_id": dataset_id,
        "population": population,
        "min_freq": min_freq,
        "max_freq": max_freq,
    }


# ── Commands ─────────────────────────────────────────────────────────────


@app.command()
def search(
    # ── Region filter ──
    region: Optional[str] = typer.Option(
        None, "--region", "-r",
        help="Genomic region, e.g. chr1:1M-5M. Supports K/M suffixes.",
    ),
    assembly: str = typer.Option(
        "hg38", "--assembly", "-a",
        help="Genome assembly (used with --region).",
    ),
    # ── Insertion filters ──
    me_type: Optional[str] = typer.Option(None, "--me-type", help="TE family (ALU, LINE1, SVA, HERVK)."),
    me_subtype: Optional[str] = typer.Option(None, "--me-subtype", help="TE subfamily (e.g. AluYa5)."),
    me_category: Optional[str] = typer.Option(None, "--me-category", help="Reference or Non-reference."),
    variant_class: Optional[str] = typer.Option(None, "--variant-class", help="Frequency class (Common, Rare, etc.)."),
    annotation: Optional[str] = typer.Option(None, "--annotation", help="Genomic context (INTRONIC, etc.)."),
    dataset_id: Optional[str] = typer.Option(None, "--dataset-id", help="Filter by dataset."),
    # ── Population filters ──
    population: Optional[str] = typer.Option(None, "--population", "-p", help="Population code (EUR, AFR, etc.)."),
    min_freq: Optional[float] = typer.Option(None, "--min-freq", help="Minimum allele frequency."),
    max_freq: Optional[float] = typer.Option(None, "--max-freq", help="Maximum allele frequency."),
    # ── Pagination ──
    limit: int = typer.Option(50, "--limit", "-l", help="Number of results (max 1000)."),
    offset: int = typer.Option(0, "--offset", help="Pagination offset."),
    # ── Output ──
    output: str = typer.Option("table", "--output", "-o", help="Output format: table or json."),
):
    """Search insertions with optional filters.

    Without --region, searches the entire database.
    With --region, searches a specific genomic region.

    [bold]Examples:[/bold]

        dbrip search --me-type ALU --limit 10

        dbrip search --region chr1:1M-5M --me-type ALU

        dbrip search --population EUR --min-freq 0.1 --output json
    """
    filters = _build_filters(
        me_type=me_type, me_subtype=me_subtype, me_category=me_category,
        variant_class=variant_class, annotation=annotation, dataset_id=dataset_id,
        population=population, min_freq=min_freq, max_freq=max_freq,
    )

    if region:
        # Region query — use the region endpoint
        parsed = _parse_region_shorthand(region)
        path = f"/v1/insertions/region/{assembly}/{parsed}"
        params = {**filters, "limit": limit, "offset": offset}
    else:
        # Full database search
        path = "/v1/insertions"
        params = {**filters, "limit": limit, "offset": offset}

    data = _get(path, params)

    if output == "json":
        # Machine-readable: dump raw JSON to stdout
        typer.echo(json.dumps(data, indent=2))
        return

    # Human-readable table
    results = data["results"]
    total = data["total"]

    if not results:
        console.print("[yellow]No results found.[/yellow]")
        return

    table = Table(
        title=f"Insertions ({total} total, showing {len(results)})",
        show_lines=False,
    )
    table.add_column("ID", style="cyan")
    table.add_column("Chrom")
    table.add_column("Start", justify="right")
    table.add_column("End", justify="right")
    table.add_column("ME Type", style="green")
    table.add_column("Subtype")
    table.add_column("Variant Class")
    table.add_column("Annotation")

    for r in results:
        table.add_row(
            r["id"],
            r["chrom"],
            str(r["start"]),
            str(r["end"]),
            r["me_type"],
            r.get("me_subtype") or "",
            r.get("variant_class") or "",
            r.get("annotation") or "",
        )

    console.print(table)

    # Show pagination hint if there are more results
    shown = offset + len(results)
    if shown < total:
        console.print(
            f"\n[dim]Showing {offset + 1}–{shown} of {total}. "
            f"Use --offset {shown} to see the next page.[/dim]"
        )


@app.command()
def get(
    insertion_id: str = typer.Argument(help="Insertion ID, e.g. A0000001."),
    output: str = typer.Option("table", "--output", "-o", help="Output format: table or json."),
):
    """Get full details for a single insertion, including population frequencies.

    [bold]Examples:[/bold]

        dbrip get A0000001

        dbrip get A0000001 --output json
    """
    data = _get(f"/v1/insertions/{insertion_id}")

    if output == "json":
        typer.echo(json.dumps(data, indent=2))
        return

    # ── Insertion details ──
    console.print(f"\n[bold cyan]{data['id']}[/bold cyan]")
    console.print(f"  Assembly:       {data['assembly']}")
    console.print(f"  Location:       {data['chrom']}:{data['start']}-{data['end']}")
    console.print(f"  Strand:         {data.get('strand') or '.'}")
    console.print(f"  ME Type:        {data['me_type']}")
    console.print(f"  ME Subtype:     {data.get('me_subtype') or ''}")
    console.print(f"  ME Category:    {data.get('me_category') or ''}")
    console.print(f"  RIP Type:       {data.get('rip_type') or ''}")
    console.print(f"  ME Length:      {data.get('me_length') or ''}")
    console.print(f"  TSD:            {data.get('tsd') or ''}")
    console.print(f"  Annotation:     {data.get('annotation') or ''}")
    console.print(f"  Variant Class:  {data.get('variant_class') or ''}")
    console.print(f"  Dataset:        {data.get('dataset_id') or ''}")

    # ── Population frequencies table ──
    populations = data.get("populations", [])
    if populations:
        console.print()
        freq_table = Table(title="Population Frequencies", show_lines=False)
        freq_table.add_column("Population", style="cyan")
        freq_table.add_column("Allele Frequency", justify="right")

        for pop in populations:
            af = pop["af"]
            af_str = f"{af:.4f}" if af is not None else ""
            freq_table.add_row(pop["population"], af_str)

        console.print(freq_table)


@app.command()
def export(
    # ── Format ──
    format: str = typer.Option("bed", "--format", "-f", help="Export format: bed, vcf, or csv."),
    # ── Output file ──
    out: Optional[str] = typer.Option(None, "--out", "-o", help="Output file path. Defaults to stdout."),
    # ── Insertion filters ──
    me_type: Optional[str] = typer.Option(None, "--me-type", help="TE family (ALU, LINE1, SVA, HERVK)."),
    me_subtype: Optional[str] = typer.Option(None, "--me-subtype", help="TE subfamily."),
    me_category: Optional[str] = typer.Option(None, "--me-category", help="Reference or Non-reference."),
    variant_class: Optional[str] = typer.Option(None, "--variant-class", help="Frequency class."),
    annotation: Optional[str] = typer.Option(None, "--annotation", help="Genomic context."),
    dataset_id: Optional[str] = typer.Option(None, "--dataset-id", help="Filter by dataset."),
    # ── Population filters ──
    population: Optional[str] = typer.Option(None, "--population", "-p", help="Population code."),
    min_freq: Optional[float] = typer.Option(None, "--min-freq", help="Minimum allele frequency."),
    max_freq: Optional[float] = typer.Option(None, "--max-freq", help="Maximum allele frequency."),
):
    """Export insertions as BED, VCF, or CSV.

    Writes to stdout by default (pipe-friendly), or to a file with --out.

    [bold]Examples:[/bold]

        dbrip export --format bed --me-type ALU -o alu.bed

        dbrip export --format vcf --population EUR --min-freq 0.1

        dbrip export --format bed | bedtools intersect -a - -b peaks.bed
    """
    filters = _build_filters(
        me_type=me_type, me_subtype=me_subtype, me_category=me_category,
        variant_class=variant_class, annotation=annotation, dataset_id=dataset_id,
        population=population, min_freq=min_freq, max_freq=max_freq,
    )
    params = {**filters, "format": format}

    response = _get_raw("/v1/export", params)
    content = response.text

    if out:
        # Write to file
        with open(out, "w") as f:
            f.write(content)
        console.print(f"[green]Exported to {out}[/green]")
    else:
        # Write to stdout (no rich formatting — keeps output clean for pipes)
        sys.stdout.write(content)


@app.command()
def stats(
    by: str = typer.Option("me_type", "--by", "-b", help="Field to group by: me_type, chrom, variant_class, annotation, me_category, dataset_id."),
    output: str = typer.Option("table", "--output", "-o", help="Output format: table or json."),
):
    """Show summary counts grouped by a field.

    [bold]Examples:[/bold]

        dbrip stats

        dbrip stats --by chrom

        dbrip stats --by variant_class --output json
    """
    data = _get("/v1/stats", {"by": by})

    if output == "json":
        typer.echo(json.dumps(data, indent=2))
        return

    entries = data["entries"]
    table = Table(title=f"Stats by {data['group_by']}", show_lines=False)
    table.add_column("Label", style="cyan")
    table.add_column("Count", justify="right")

    for entry in entries:
        table.add_row(entry["label"], str(entry["count"]))

    console.print(table)


@app.command()
def datasets(
    output: str = typer.Option("table", "--output", "-o", help="Output format: table or json."),
):
    """List all loaded datasets.

    Shows what datasets are in the database, when they were loaded,
    and how many rows each has.

    [bold]Examples:[/bold]

        dbrip datasets

        dbrip datasets --output json
    """
    data = _get("/v1/datasets")

    if output == "json":
        typer.echo(json.dumps(data, indent=2))
        return

    if not data:
        console.print("[yellow]No datasets loaded.[/yellow]")
        return

    table = Table(title="Loaded Datasets", show_lines=False)
    table.add_column("ID", style="cyan")
    table.add_column("Version")
    table.add_column("Label")
    table.add_column("Assembly")
    table.add_column("Rows", justify="right")
    table.add_column("Loaded At")

    for ds in data:
        table.add_row(
            ds["id"],
            ds.get("version") or "",
            ds.get("label") or "",
            ds.get("assembly") or "",
            str(ds.get("row_count") or ""),
            ds.get("loaded_at") or "",
        )

    console.print(table)


# ── Entry point ──────────────────────────────────────────────────────────
#
# This lets you run the CLI directly with `python cli/dbrip.py` during
# development, or as `dbrip` after installing with `pip install -e .`.

if __name__ == "__main__":
    app()
