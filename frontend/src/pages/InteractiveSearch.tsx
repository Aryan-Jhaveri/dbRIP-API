/**
 * InteractiveSearch — the main search page (Tab 1).
 *
 * WHAT THIS PAGE DOES:
 *   Replicates the Shiny app's "Interactive Search" tab:
 *     1. A global search bar (regex-capable, case-insensitive)
 *     2. A data table showing insertion results with server-side pagination
 *     3. A download button for exporting filtered results as CSV
 *
 * HOW IT WORKS:
 *   - The page owns the pagination and filter state (pageIndex, pageSize, search)
 *   - On every state change, the useInsertions hook refetches from the API
 *   - The DataTable component renders whatever data the hook returns
 *   - The search bar uses a debounce (300ms) so we don't flood the API
 *     with requests on every keystroke
 *
 * HOW IT CONNECTS TO OTHER FILES:
 *   - useInsertions (hooks/useInsertions.ts) → fetches from FastAPI
 *   - DataTable (components/DataTable.tsx) → renders the table
 *   - listInsertions (api/client.ts) → the actual fetch call
 *   - InsertionSummary (types/insertion.ts) → TypeScript type for rows
 *   - buildExportUrl (api/client.ts) → builds the CSV download link
 *
 * COLUMN DEFINITIONS:
 *   The columns array below defines every column in the table. Each column
 *   has an accessorKey (which field from the data to read) and a header
 *   (what to show in the column header). These match the fields in
 *   InsertionSummary from types/insertion.ts.
 *
 * WHY NO POPULATION FREQUENCY COLUMNS?
 *   The list endpoint (GET /v1/insertions) returns InsertionSummary, which
 *   does NOT include the 33 population frequency columns. Those are only
 *   in InsertionDetail (GET /v1/insertions/{id}). This is intentional —
 *   sending 33 extra floats per row × 50 rows = 1,650 extra values per
 *   page load. If we need pop freqs in the table later, we'd add a new
 *   API endpoint that includes them.
 */

import { useState, useEffect, useCallback } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import DataTable from "../components/DataTable";
import { useInsertions } from "../hooks/useInsertions";
import { buildExportUrl } from "../api/client";
import type { InsertionSummary } from "../types/insertion";

// ── Column definitions ──────────────────────────────────────────────────
// Each column maps an accessorKey (field name from the API response)
// to a header label shown in the table. Order matches the Shiny app.

const columns: ColumnDef<InsertionSummary, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "chrom", header: "Chromosome" },
  { accessorKey: "start", header: "Start" },
  { accessorKey: "end", header: "End" },
  { accessorKey: "me_category", header: "Category" },
  { accessorKey: "me_type", header: "ME Type" },
  { accessorKey: "rip_type", header: "RIP Type" },
  { accessorKey: "me_subtype", header: "ME Subtype" },
  { accessorKey: "me_length", header: "ME Length" },
  { accessorKey: "strand", header: "Strand" },
  { accessorKey: "tsd", header: "TSD" },
  { accessorKey: "annotation", header: "Annotation" },
  { accessorKey: "variant_class", header: "Variant Class" },
];

// ── Component ────────────────────────────────────────────────────────────

export default function InteractiveSearch() {
  // ── State ────────────────────────────────────────────────────────────
  // pageIndex: current page (0-based)
  // pageSize: rows per page
  // searchInput: what the user is typing (updates on every keystroke)
  // searchQuery: the debounced value actually sent to the API
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Debounce search ──────────────────────────────────────────────────
  // Wait 300ms after the user stops typing before sending the query.
  // This prevents firing an API request on every single keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPageIndex(0); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Fetch data ───────────────────────────────────────────────────────
  // The useInsertions hook calls GET /v1/insertions with these params.
  // When any param changes, TanStack Query automatically refetches.
  //
  // NOTE: The "search" param doesn't exist on the API yet — we pass it
  // here so it's ready when we add server-side regex search to FastAPI.
  // For now, the API ignores unknown query params, so this is safe.
  const { data, isLoading } = useInsertions({
    limit: pageSize,
    offset: pageIndex * pageSize,
    // search: searchQuery || undefined, // TODO: enable when API supports regex search
  });

  // ── Pagination handler ───────────────────────────────────────────────
  // Called by DataTable when the user clicks Next/Previous or changes page size.
  const handlePaginationChange = useCallback(
    (newPageIndex: number, newPageSize: number) => {
      setPageIndex(newPageIndex);
      setPageSize(newPageSize);
    },
    []
  );

  // ── Export URL ───────────────────────────────────────────────────────
  // Build a download link for the current filters (CSV format).
  // Clicking this link triggers a direct download from the API.
  const exportUrl = buildExportUrl("csv");

  return (
    <div>
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-4">
        <label className="text-sm font-semibold">Search:</label>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="e.g. ALU|SVA|INTRONIC (regex, case-insensitive)"
          className="border border-black px-2 py-1 text-sm flex-1 max-w-md"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
            }}
            className="border border-black px-2 py-1 text-sm cursor-pointer hover:bg-gray-100"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Error display ──────────────────────────────────────────────── */}
      {!isLoading && !data && (
        <p className="text-sm mb-4">
          Unable to load data. Make sure the API is running (uvicorn app.main:app --reload).
        </p>
      )}

      {/* ── Data table ─────────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={data?.results ?? []}
        total={data?.total ?? 0}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPaginationChange={handlePaginationChange}
        isLoading={isLoading}
      />

      {/* ── Download button ────────────────────────────────────────────── */}
      <div className="mt-4">
        <a
          href={exportUrl}
          download
          className="border border-black px-3 py-1 text-sm no-underline hover:bg-gray-100 inline-block"
        >
          Download CSV
        </a>
      </div>
    </div>
  );
}
