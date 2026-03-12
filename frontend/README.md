# dbRIP Web Frontend

React SPA for exploring the dbRIP retrotransposon insertion database. Backed by the FastAPI
server in `../app/`.

## Tabs

| Tab | File | What it does |
|-----|------|--------------|
| Interactive Search | `InteractiveSearch.tsx` | Server-side search + 6 filter types + paginated table + copy/download |
| File Search | `FileSearch.tsx` | Upload BED/CSV/TSV → window-based overlap query |
| Batch Search | `BatchSearch.tsx` | Checkbox-based multi-filter → download results |
| API Reference | `ApiRef.tsx` | Renders MkDocs `api-reference.md` fetched from the API |
| CLI Reference | `CliRef.tsx` | Quick-reference for all `dbrip` commands |

## Stack

| Package | Version | Role |
|---------|---------|------|
| Vite | 6 | Build tool + dev server |
| React | 19 | UI framework |
| TypeScript | 5 | Type safety |
| TanStack Table | 8 | Headless table (sorting, pagination, selection) |
| TanStack Query | 5 | Server state, caching, background refetch |
| Tailwind CSS | 4 | Utility-first styling |

## Quick Start

Requires the API running at `http://localhost:8000`.

```bash
# From the repo root — start the API first
uvicorn app.main:app --reload

# In a second terminal
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

Vite proxies all `/v1` requests to `localhost:8000` (configured in `vite.config.ts`),
so the frontend and API can run on separate ports in development with no CORS configuration.

**Type check:**
```bash
npx tsc --noEmit
```

**Run tests:**
```bash
npm test
```

## Architecture

### Two independent interaction systems in DataTable

`DataTable` (`src/components/DataTable.tsx`) has two completely separate click systems that share
no state. Selecting a row does not expand it; expanding a row does not select it.

| System | Trigger | Effect |
|--------|---------|--------|
| **Row selection** | Single-click or shift+click anywhere except the checkbox cell | Blue `bg-blue-100` highlight. Populates `onSelectionChange` → enables "Copy N selected rows" button, which fetches full detail and writes TSV to clipboard. Shift+click selects a range; drag-to-select sweeps multiple rows. |
| **Checkbox expand** | Click the checkbox cell | Shows/hides a nested `<tr>` rendered by the `renderExpandedRow` prop. In Interactive Search, this renders `<PopFreqTable id={...}>`, which calls `useInsertion(id)` — cached by TanStack Query so subsequent opens are instant. The header checkbox expands/collapses all rows on the current page. |

### Data flow

```
User action  → React state (filters, page, search term)
  → TanStack Query (useInsertions / useInsertion)
  → client.ts (typed fetch wrappers)
  → FastAPI /v1/... endpoints
  → SQLite / PostgreSQL
```

TanStack Query handles caching, background refetch, and loading/error states. Components only
see `data`, `isLoading`, and `error` — no manual `fetch()` logic.

## File Structure

```
frontend/src/
│
├── api/
│   └── client.ts              ← Typed fetch wrappers for every FastAPI endpoint.
│                                (listInsertions, getInsertion, getRegion, exportData, …)
│                                All fetch() calls live here. Components never call fetch() directly.
│
├── components/
│   └── DataTable.tsx          ← Generic reusable table with two interaction systems.
│                                (row-click selection + checkbox expand)
│                                Accepts: columns, data, renderExpandedRow, onSelectionChange.
│                                Does not know about insertions — fully generic.
│
├── hooks/
│   └── useInsertions.ts       ← Two TanStack Query hooks:
│                                  useInsertions(params) — paginated search results
│                                  useInsertion(id)      — single insertion with pop freqs
│
├── pages/
│   ├── InteractiveSearch.tsx  ← Main search tab. Search box + 6 filter dropdowns + DataTable.
│   │                            Contains PopFreqTable (inline pop freq expand via checkbox).
│   ├── FileSearch.tsx         ← File upload + window size input + overlap results table.
│   ├── BatchSearch.tsx        ← Checkbox-based multi-filter (ME type, chrom, etc.) + results.
│   ├── ApiRef.tsx             ← Fetches and renders MkDocs api-reference.md from the API.
│   └── CliRef.tsx             ← Static quick-reference table for all dbrip CLI commands.
│
├── types/
│   └── insertion.ts           ← TypeScript interfaces: InsertionSummary, InsertionDetail,
│                                PopFrequency, SearchParams, PaginatedResponse.
│
├── utils/
│   └── filterRowsByRegex.ts   ← Client-side regex filter helper (used by BatchSearch).
│
├── App.tsx                    ← Tab bar + renders the active page component.
├── main.tsx                   ← React entry point. Wraps app in QueryClientProvider.
└── index.css                  ← Tailwind base styles + system font stack.
```

## Key Components

### `DataTable` (`src/components/DataTable.tsx`)
Generic table built on TanStack Table 8. Does not know about insertions — receives `columns`
and `data` as props. Exposes two callbacks:
- `onSelectionChange(rows)` — called when the blue-highlighted row selection changes
- `renderExpandedRow(row)` — if provided, enables checkboxes and renders this below each
  checked row

### `PopFreqTable` (inside `InteractiveSearch.tsx`)
Calls `useInsertion(id)` and renders a compact population-frequency table inside the expanded
row. Fetches are deduped and cached by TanStack Query — opening the same row a second time
shows cached data instantly with no network request.

### `useInsertions` / `useInsertion` (`src/hooks/useInsertions.ts`)
TanStack Query hooks. `useInsertions` takes a `SearchParams` object and returns a paginated
`PaginatedResponse<InsertionSummary>`. `useInsertion` takes an ID and returns `InsertionDetail`
including all population frequencies. Both are cached by their query key; changing any
parameter automatically triggers a refetch.

### `client.ts` (`src/api/client.ts`)
All `fetch()` calls live here, typed with the interfaces from `types/insertion.ts`. Components
never call `fetch()` directly — they go through these wrappers, which keeps the API contract in
one place. If an endpoint URL or response shape changes, only this file needs updating.
