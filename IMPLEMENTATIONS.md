# Next Steps — What to Build on Top of the API

The core API is working: ingest pipeline, database, 7 endpoints, 60 tests (13+ ingest + 26+ API + 21+ CLI). 
Below are the next things to build, roughly in priority order.


## To-Do

- [ ] Front end has no filters for the pop_freq table, for RIP filtered by pop samples. Need to add filters for that in Interactive Search, and Batch Search.

- ~~Fix interactive search and filtering not working~~ — DONE. Search is fully server-side (LIKE across 8 columns with debounce). Fixed-value filters (ME Type, Category, Annotation) use `<select multiple>` → SQL `IN` clause. Population + min_freq filters wire directly to API. No empty-page bug.

- ~~The row count description~~ — DONE. "Showing X to Y of Z entries" is dynamically computed from API `total`.

- ~~Add row selection~~ — DONE. Row-click highlights blue (`bg-blue-200`); shift+click for range; drag-to-select (hold and sweep) with auto select/deselect mode. Selected rows feed the "Copy N selected rows" button which fetches full detail (inc. pop freqs) and writes TSV to clipboard.

- [ ] Allow filter buttons on column headers → Column header filter dropdowns (e.g., filter by ALU, SVA) + sort

- ~~Add the ability to jump to specific pages~~ — DONE. "Go to:" input on the pagination bar.

- ~~Add mkdocs (docs/*md's) to the frontend~~ — DONE. Docs tab in the frontend renders the four MkDocs pages (index, api-reference, cli, biology).

- ~~File search page is empty~~ — DONE. FileSearch.tsx has file upload (BED/CSV/TSV), window input, and results table.

- ~~Population frequency popup~~ — REPLACED. Popup removed. Pop freqs are now shown inline as a nested row below each data row when the user checks the row's checkbox. Header checkbox expands/collapses all rows on the page. TanStack Query caches fetched detail by ID.

- [ ] Add Predefined values to exports (`FastAPI Enum` / `Literal`) so vcf, bed calls are restricted to certain output types. Also look into predefined values for other dropdowns in the API.

- [ ] Look into enums for plus/minus strand:

        class Strand(str, Enum):
            plus = "+"
            minus = "-"

        raw_strand = Strand.plus.value  # Returns "+"

    if necessary

- [ ] For error handling in query parameters, need fallbacks or docs for:

  Question: if the user doesn't enter `?` or doesn't enter relevant parameters after `?`, how do different calls handle this gracefully? Do the calls tell what the default fallbacks are?
           
---

## 1. MCP Server — Let Claude Query the Database

**What:** An [MCP server](https://modelcontextprotocol.io/) that wraps the API so Claude can query
the database in natural language during a conversation.

**Why:** A researcher could ask Claude "Are there common Alu insertions near
BRCA2 in Africans?" and Claude would automatically call the API, get real data,
and answer with actual numbers.

**Where:** `mcp/server.py`

**How it would work:**
```python
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("dbRIP")
BASE = "http://localhost:8000/v1"

@mcp.tool()
def search_insertions(chrom: str, start: int, end: int,
                      me_type: str | None = None,
                      population: str | None = None,
                      min_freq: float | None = None) -> list[dict]:
    """Search TE insertions in a genomic region with optional filters."""
    params = {k: v for k, v in locals().items() if v is not None}
    r = httpx.get(f"{BASE}/insertions/region/hg38/{chrom}:{start}-{end}", params=params)
    return r.json()["results"]

@mcp.tool()
def get_insertion(id: str) -> dict:
    """Get full details for a single insertion by ID."""
    return httpx.get(f"{BASE}/insertions/{id}").json()

@mcp.tool()
def get_stats(by: str = "me_type") -> dict:
    """Summary stats grouped by me_type, population, chrom, or variant_class."""
    return httpx.get(f"{BASE}/stats", params={"by": by}).json()
```

**Dependencies:** `pip install mcp httpx`

**To register with Claude Desktop:** Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "dbrip": {
      "command": "python",
      "args": ["mcp/server.py"],
      "cwd": "/path/to/dbRIP-API"
    }
  }
}
```

**Effort:** Small — the API already does the heavy lifting, the MCP server just wraps it.

---

## 2. CLI Tool — `dbrip` Command — DONE

**Status:** Complete. 5 commands (`search`, `get`, `export`, `stats`, `datasets`), 21 tests.

**Files:** `cli/__init__.py`, `cli/dbrip.py`, `tests/test_cli.py`

**Stack:** Typer + httpx. Thin HTTP wrapper — talks to the running API, no direct DB access.

**Features:**
- Region shorthand: `chr1:1M-5M` → `chr1:1000000-5000000`
- Output modes: `--output table` (rich tables) or `--output json` (pipe-friendly)
- Export to stdout or file: `dbrip export --format bed -o out.bed`
- Config via `DBRIP_API_URL` env var (default: `http://localhost:8000`)

**Usage:**
```bash
dbrip search --region chr1:1M-5M --me-type ALU
dbrip get A0000001
dbrip export --format vcf --me-type LINE1 -o l1.vcf
dbrip stats --by me_type
dbrip export --format bed | bedtools intersect -a - -b peaks.bed
```

---

## 3. Documentation Site — DONE

**Status:** Complete. MkDocs Material site with 4 pages.

**Files:** `mkdocs.yml`, `docs/index.md`, `docs/api-reference.md`, `docs/cli.md`, `docs/biology.md`

**What's covered:**
- `index.md` — landing page, links to README for setup
- `api-reference.md` — all endpoints with curl examples and sample JSON responses
- `cli.md` — full CLI usage with piping/scripting examples
- `biology.md` — TE families, populations, variant classes, coordinates (for new lab members)

**Built-in docs also available:**
- `/docs` — Swagger UI (interactive)
- `/redoc` — ReDoc (read-only)

**To serve locally:** `pip install mkdocs-material && mkdocs serve`

---

## 4. Web Frontend — DONE (core)

**Status:** Core complete. Vite + React + TypeScript + TanStack Table/Query + Tailwind.

**Files:** `frontend/src/`

**Features shipped:**
- Interactive Search: server-side search + 6 filter types + pagination + "Go to page" + Download CSV + Copy selected rows (TSV with pop freqs) + drag-to-select rows + inline pop freq expand via checkbox
- File Search: BED/CSV/TSV upload + window overlap + results table + download
- Batch Search: checkbox filters (ME type, category, annotation, strand, chrom) + download
- Docs tab: renders the four MkDocs pages (index, api-reference, cli, biology)
- `DataTable` component: generic, reusable, two independent interaction systems (row-click = copy selection; checkbox = inline expand)

**Stack:** `frontend/` — `npm run dev` for local, `npx tsc --noEmit` to type-check.

**Remaining frontend work:**
- Column header sort + filter dropdowns
- IGV.js genome browser (stretch goal)
- Docker + FastAPI `StaticFiles` mount for single-process deployment

---

## 5. Docker Deployment

**What:** Containerize the API for deployment on a server, cloud, or shared lab machine.

**Files:** `Dockerfile` + `docker-compose.yml` (already skeleton files in the repo)

**Architecture:**
```
docker-compose.yml
├── db         (postgres:16-alpine)     ← production database
├── api        (FastAPI + uvicorn)      ← the API server
└── migrate    (alembic upgrade head)   ← runs once on startup
```

**For SQLite-only deployment** (simpler, no PostgreSQL):
```dockerfile
FROM python:3.13-slim
COPY . /app
WORKDIR /app
RUN pip install .
# Pre-load the data
RUN python scripts/ingest.py --manifest data/manifests/dbrip_v1.yaml
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Effort:** Small for SQLite-only, medium for full PostgreSQL + Alembic setup.

---

## 6. Additional Datasets

**What:** Load other TE databases alongside dbRIP.

**How:** The manifest + loader pattern makes this straightforward:
1. Drop the new CSV in `data/raw/`
2. Write a new manifest YAML in `data/manifests/`
3. Write a new loader class (inherits from `BaseLoader`)
4. Run `python scripts/ingest.py --manifest data/manifests/new_dataset.yaml`

**Potential datasets:**
- [euL1db](https://www.euL1db.icm.unicamp.br/) — LINE1 insertions in humans
- [TEMPOseq](https://github.com/WashU-BRG/TEMPOseq) — TE expression data
- Custom lab datasets

**Each dataset gets its own `dataset_id`**, so queries can filter by source:
`/v1/insertions?dataset_id=eul1db_v1`

---

## 7. Enrichment / Annotation Extensions

**What:** Add biological context to insertions — gene names, OMIM disease links.

**Where:** Extension tables in the database (already sketched in the API design doc):
```sql
CREATE TABLE enrichment (
    insertion_id  TEXT PRIMARY KEY REFERENCES insertions(id),
    gene_name     TEXT,
    gene_id       TEXT,
    evo2_score    REAL,
    omim_ids      TEXT[],
    gtex_egene    TEXT
);
```

**How:** A new ingest script (e.g. `scripts/enrich.py`) that:
1. Reads insertions from the DB
2. Looks up each position in a gene annotation file (GTF)
3. Cross-references with OMIM, GTEx, etc.
4. Writes to the `enrichment` table

**New endpoint:** `GET /v1/insertions/{id}/enrichment`

**Effort:** Large — requires downloading and parsing external data sources.

---

## 8. Liftover (hg19 / CHM13 coordinates)

**What:** Provide alternate coordinates for each insertion in hg19 and CHM13 assemblies.

**Where:** `coordinates_liftover` table (already sketched in the design doc):
```sql
CREATE TABLE coordinates_liftover (
    insertion_id  TEXT REFERENCES insertions(id),
    assembly      TEXT,    -- "hg19" or "CHM13"
    chrom         TEXT,
    start         INTEGER,
    end           INTEGER,
    method        TEXT,    -- "UCSC liftOver" or "T2T tools"
    UNIQUE (insertion_id, assembly)
);
```

**How:** Use UCSC `liftOver` tool with chain files. A script would:
1. Export insertions as BED (using the API's export endpoint)
2. Run `liftOver` to convert hg38 → hg19 and hg38 → CHM13
3. Load the results into the `coordinates_liftover` table

**New endpoint:** Region queries would accept `assembly=hg19` and automatically use the lifted coordinates.

**Effort:** Medium — the tool exists, the challenge is handling unmapped regions.

---

## Suggested Priority

| Priority | What | Why |
|----------|------|-----|
| 1 | Docker (SQLite-only) | Makes it deployable immediately |
| 2 | MCP Server | High-value, low-effort — Claude can query real data |
| ~~3~~ | ~~CLI tool~~ | Done — 5 commands, 21 tests |
| 4 | Additional datasets | Multiplies the value of everything above |
| 5 | Web frontend | Useful but big effort — FastAPI `/docs` works for now |
| 6 | Enrichment | High scientific value but requires external data work |
| 7 | Liftover | Important for cross-assembly analysis |
| 8 | PostgreSQL + Alembic | Only needed when scale demands it |
