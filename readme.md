# dbRIP API

Read-only REST API for the [dbRIP database](https://lianglab.shinyapps.io/shinydbRIP/) of retrotransposon insertion polymorphisms — 44,984 TE insertions across 33 populations from the 1000 Genomes Project.

## Running with Docker

The easiest way to run the full stack (API + web app) in one command:

```bash
docker build -t dbrip-api .
docker run -p 8000:8000 dbrip-api
```

Then open `http://localhost:8000`. The Docker image compiles the frontend, loads the database, and starts the server — no other setup needed.

## Local Development

If you want to work on the code, run the API and frontend separately.

**Requirements:** Python 3.11+, Node.js 18+

```bash
# 1. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -e ".[all,dev]"

# 3. Load the database
python scripts/ingest.py --manifest data/manifests/dbrip_v1.yaml

# 4. Start the API
uvicorn app.main:app --reload
# → http://localhost:8000/docs
```

Then in a separate terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The frontend proxies all `/v1` requests to `localhost:8000`, so both can run simultaneously without any CORS configuration.

## Deployment

**Render** — connect this repo on [render.com](https://render.com) and it auto-deploys from the `render.yaml` in this repo. Every push to `main` triggers a redeploy.

**GitHub Actions** — on every push to `main`, the CI workflow runs tests and pushes a Docker image to the GitHub Container Registry (`ghcr.io/<your-username>/dbrip-api:latest`).

## API Endpoints

Interactive docs available at `/docs` (Swagger) or `/redoc` after starting the server.

| Endpoint | Description |
|----------|-------------|
| `GET /v1/health` | Health check |
| `GET /v1/insertions` | List insertions with filters and pagination |
| `GET /v1/insertions/{id}` | Single insertion with population frequencies |
| `GET /v1/insertions/region/{assembly}/{chrom}:{start}-{end}` | Region query |
| `GET /v1/export?format=bed\|vcf\|csv` | Export filtered results |
| `GET /v1/stats?by=me_type\|chrom\|variant_class` | Summary counts |
| `GET /v1/datasets` | List loaded datasets |

All query endpoints accept these optional filters (AND logic):

| Param | Example | Description |
|-------|---------|-------------|
| `me_type` | `ALU` | TE family |
| `me_subtype` | `AluYa5` | TE subfamily |
| `me_category` | `Non-reference` | Reference or polymorphic |
| `variant_class` | `Common` | Frequency class |
| `annotation` | `INTRONIC` | Genomic context |
| `population` | `EUR` | Filter by population |
| `min_freq` | `0.05` | Minimum allele frequency (requires `population`) |
| `max_freq` | `0.50` | Maximum allele frequency (requires `population`) |
| `limit` | `50` | Page size (max 1000) |
| `offset` | `0` | Pagination offset |

## CLI Tool

A command-line client that wraps the API. Requires the API to be running.

```bash
dbrip search --region chr1:1M-5M --me-type ALU
dbrip get A0000001
dbrip export --format vcf --me-type LINE1 -o l1.vcf
dbrip stats --by me_type
dbrip datasets
```

Add `--output json` to any command for pipe-friendly JSON instead of a table.

## Tests

```bash
pytest tests/ -v
```

60 tests total: 13 ingest, 26 API, 21 CLI. Tests use a 5-row in-memory fixture — no need to load the full database first.

## Project Structure

```
data/raw/dbRIP_all.csv          ← source CSV (44,984 rows)
data/manifests/dbrip_v1.yaml   ← describes the CSV format for ingest

ingest/                         ← ETL pipeline (used by scripts/, not the API)
scripts/ingest.py               ← loads CSV into SQLite; run directly, not imported

app/                            ← FastAPI read-only query layer
  main.py                       ← app entry point, registers routers
  database.py                   ← SQLAlchemy engine + session
  models.py                     ← ORM models
  schemas.py                    ← Pydantic response schemas
  routers/                      ← one file per endpoint group

cli/dbrip.py                    ← `dbrip` CLI (Typer + httpx)
frontend/src/                   ← React app (Vite + TanStack + Tailwind + igv.js)
tests/                          ← pytest suite
```

## Data Management

The database is always rebuildable from the CSV. To reload:

```bash
python scripts/ingest.py --manifest data/manifests/dbrip_v1.yaml

# Validate without writing
python scripts/ingest.py --manifest data/manifests/dbrip_v1.yaml --dry-run

# Check what's loaded
python scripts/ingest.py --status
```

## Switching to PostgreSQL

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbrip"
uvicorn app.main:app --reload
```

The ORM models and queries work identically on SQLite and PostgreSQL.
