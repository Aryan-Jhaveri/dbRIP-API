# Track Hub Implementation Log

Documents the UCSC Track Hub integration — what was built, why, and how each piece fits together.


---

## Build Order & Status

Each step was committed independently (one file per commit).

| Step | File | Status | What it does |
|------|------|--------|-------------|
| 1 | `data/hub/templates/hub.txt` | Done | UCSC entry point — identifies the hub, links to genomes.txt |
| 2 | `data/hub/templates/genomes.txt` | Done | One stanza per assembly — tells UCSC where trackDb.txt lives |
| 3a | `data/hub/templates/trackDb_composite.txt` | Done | Composite parent track container — groups sub-tracks together |
| 3b | `data/hub/templates/trackDb_subtrack.txt` | Done | Per-ME-type sub-track — bigDataUrl, color, searchIndex |
| 4 | `data/hub/templates/dbRIP.html` | Done | Track description popup shown in UCSC |
| 5 | `scripts/build_trackhub.py` | Done | Full pipeline: API export → sort → bedToBigBed → hub config |
| 6 | `pyproject.toml` | Done | Added `trackhub` dep group (httpx) to `[project.optional-dependencies]` |
| 7 | `frontend/src/api/client.ts` | Done | `BASE` reads `VITE_API_URL` env var; falls back to `/v1` for local dev |
| 8 | `app/main.py` | Done | CORS already `["*"]`; added comment documenting GitHub Pages consumer |
| 9 | `.github/workflows/build-trackhub.yml` | Done | CI: ingest → API → build hub → build frontend → deploy both to gh-pages |
| 9b | `.gitignore` | Done | Added `hub/` |
| 10 | `GUIDE.md` | Done | Added Track Hub build + deploy sections |
| 11 | `README.md` | Done | Added Track Hub section, updated structure, deployment diagram |

---

## Key Design Decisions

### BED6 (no AutoSQL)

The hub uses plain BED6 — the 6 standard columns (chrom, start, end, name, score, strand). Clicking an insertion in UCSC shows the dbRIP ID and coordinates.

AutoSQL (BED6+N with extra columns like me_type, annotation, TSD) was deferred. The core visualization — insertion positions, ME-family colors, search by ID — is identical with plain BED6. Adding AutoSQL requires coordinating 5 files.

### ME types auto-detected from API

`build_trackhub.py` calls `GET /v1/stats?by=me_type` to discover which ME types are in the DB. New types added to a future CSV automatically get their own sub-track — no template changes needed.

### Hub URL is dynamic in CI

The workflow constructs the hub URL from `github.repository_owner` and `github.event.repository.name`:
```
https://<owner>.github.io/<repo>/hub
```
When the lab forks the repo, the URL updates automatically — no workflow edits needed.

### hg19 via FASTA (no liftOver)

The lab's `HS-ME.hg19.fa` contains native hg19 coordinates in FASTA headers. Parsing these directly avoids liftOver (which produces unmapped entries and requires a chain file binary). Pass `--hg19-fasta data/raw/HS-ME.hg19.fa` to enable.

### sort before bedToBigBed

The API returns rows in lexicographic chrom order (`chr1, chr10, chr11, chr2`). `bedToBigBed` requires records within each chromosome to be contiguous and position-sorted. `sort -k1,1 -k2,2n` with `LC_ALL=C` fixes this.

### Two gh-pages deploy steps with `keep_files: true`

The frontend (`frontend/dist`) and hub (`hub/`) are deployed separately because they come from different source directories. Both steps use `keep_files: true` to prevent each from deleting the other.

---

## Test Coverage

101 tests total across the project.

### Track Hub tests (`tests/test_build_trackhub.py` — 31 tests)

| Class | Count | What is verified |
|-------|-------|-----------------|
| `TestStripComments` | 5 | Comment/blank line removal from templates |
| `TestParseHg19Fasta` | 7 | Header parsing, coordinate conversion, grouping, error handling |
| `TestWriteBedFromRecords` | 4 | BED6 tab format, column values, empty input |
| `TestRenderTemplates` | 9 | All template outputs, color palette, URL construction, trailing slash |
| `TestWriteBuildMeta` | 3 | JSON file format, field values, ISO timestamp |
| `TestCheckTools` | 3 | Tool detection, dry-run bypass, missing tool message |

### Existing tests (unchanged)

| File | Count | What |
|------|-------|------|
| `test_ingest.py` | 13 | ETL pipeline: row counts, column renaming, population melt, null preservation |
| `test_api.py` | 26 | Endpoints, filters, pagination, export formats, 404s/400s |
| `test_cli.py` | — | CLI tests |
| `test_build_trackhub.py` | 31 | Track hub build pipeline (see above) |

---

## How the CI Pipeline Works

```
push to main (data/raw/*.csv or frontend/src/**)
  │
  ├─ checkout + setup Python 3.13
  ├─ pip install -e ".[all]"
  ├─ wget bedToBigBed + fetchChromSizes (static binaries, ~5s)
  ├─ python scripts/ingest.py (build SQLite from CSV)
  ├─ uvicorn app.main:app & (background)
  ├─ health-check loop (curl /v1/health, up to 30 attempts)
  │
  ├─ python scripts/build_trackhub.py
  │     → auto-detect ME types from API
  │     → for each ME type:
  │         GET /v1/export?format=bed&me_type=TYPE
  │         sort -k1,1 -k2,2n
  │         bedToBigBed → hub/hg38/dbrip_{type}_hg38.bb
  │     → render templates → hub/hub.txt, hub/genomes.txt, hub/hg38/trackDb.txt
  │     → write hub/.build_meta.json
  │
  ├─ setup Node 20 + npm ci
  ├─ VITE_API_URL=https://dbrip-api.onrender.com/v1 npm run build
  │
  ├─ deploy frontend/dist → gh-pages / (keep_files: true)
  └─ deploy hub/ → gh-pages /hub/ (keep_files: true)
```

---

## Select All + Bulk Genome Browser (Steps 12–14)

Adds a "Select All" button to DataTable, bulk "View in IGV" (merged bounding region),
and a new "View in UCSC" button that opens the UCSC Genome Browser.

| Step | File | Status | What it does |
|------|------|--------|-------------|
| 12 | `frontend/src/utils/genomeBrowserHelpers.ts` | Done | Pure functions: group/merge rows by chrom, build UCSC URL, build IGV locus |
| 12b | `frontend/src/utils/genomeBrowserHelpers.test.ts` | Done | 9 tests for merge logic, URL format, edge cases |
| 13 | `frontend/src/components/DataTable.tsx` | Done | Select All / Deselect All button in pagination bar |
| 13b | `frontend/src/components/DataTable.test.tsx` | Done | 5 tests for Select All rendering and behavior |
| 14 | `frontend/src/pages/InteractiveSearch.tsx` | Done | Bulk View in IGV, View in UCSC, multi-chrom warnings |

### Key Design Decisions

- **Select All** lives in DataTable (generic) because it manages `selectedIds` internally — scope is current page only (selections already clear on page change).
- **Bulk IGV**: merges selected rows into one bounding region per chromosome; navigates to the chromosome with the most selected rows. igv.js `browser.search()` only accepts a single locus string.
- **UCSC**: opens one tab per chromosome group (max 5 to avoid popup blockers) with merged regions. URL format: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chrX:start-end`
- **Multi-chromosome warnings**: when selected rows span multiple chromosomes, amber warning text appears below the action bar explaining what each button will show and which chromosomes are omitted.
  - IGV: "Selected rows span N chromosomes. IGV will show only chrX (M rows, merged region start–end)."
  - UCSC (>5 chroms): "UCSC will open 5 of N chromosomes. K chromosomes omitted: chrA, chrB, ..."
  - UCSC (≤5 chroms): "UCSC will open N tabs (one per chromosome)."
- **Utility functions** in a new `genomeBrowserHelpers.ts` — follows the `filterRowsByRegex.ts` pattern: pure functions, no React, testable in isolation.

---

## Future Enhancements

- **AutoSQL (BED6+N)** — richer UCSC click popups showing me_type, annotation, TSD, variant_class
- **Population frequency tracks** — per-super-population bigBed tracks colored by allele frequency
- **UCSC Public Hub listing** — submit to genome-www@soe.ucsc.edu once hosted on a permanent domain
