/**
 * DataTable — a generic, reusable table component with server-side pagination.
 *
 * WHAT THIS COMPONENT DOES:
 *   Renders a plain HTML <table> with pagination controls. It does NOT fetch
 *   data itself — the parent component provides data and column definitions.
 *   When the user changes page or page size, it calls onPaginationChange so
 *   the parent can refetch from the API.
 *
 * WHY IS IT GENERIC?
 *   This table doesn't know about insertions, frequencies, or biology. It just
 *   renders rows and columns. This means we can reuse it for:
 *     - Interactive Search results
 *     - File Search results
 *     - Batch Search results
 *     - Any future table in the app
 *
 * WHY SERVER-SIDE PAGINATION?
 *   With 44,984 rows, we can't load everything into the browser at once.
 *   Instead, the API returns one page at a time (e.g. 50 rows), and the table
 *   shows pagination controls to navigate between pages. TanStack Table's
 *   "manual" mode handles this — it doesn't try to paginate locally.
 *
 * HOW TANSTACK TABLE WORKS:
 *   TanStack Table is "headless" — it provides the logic (pagination, sorting,
 *   filtering) but NOT the UI. We write our own HTML/JSX for the table. This
 *   gives us full control over styling (black and white, no frills).
 *
 *   Key concepts:
 *     - ColumnDef: describes one column (header text, how to read the cell value)
 *     - useReactTable(): creates a table instance with all the logic
 *     - table.getHeaderGroups(): returns header rows to render <th> elements
 *     - table.getRowModel().rows: returns data rows to render <td> elements
 *
 * TWO INDEPENDENT INTERACTION SYSTEMS:
 *
 *   1. ROW CLICK (anywhere except the checkbox cell):
 *      Single-click toggles a blue highlight on that row. Shift+click extends
 *      the selection to a contiguous range. The highlighted rows are reported
 *      to the parent via onSelectionChange so the Copy button knows what to copy.
 *
 *   2. CHECKBOX (shown only when renderExpandedRow is provided):
 *      Single-click shows/hides a nested <tr> below that row (populated by
 *      renderExpandedRow). Shift+click expands or collapses a range at once.
 *      The header checkbox expands/collapses all rows on the current page.
 *
 *   The two systems are intentionally independent — clicking a checkbox does
 *   NOT highlight the row, and clicking a row does NOT expand/collapse it.
 *
 * PROPS:
 *   columns            — TanStack ColumnDef array describing columns
 *   data               — Array of row objects for the current page
 *   total              — Total number of rows matching filters (from API)
 *   pageIndex          — Current page number (0-based)
 *   pageSize           — Number of rows per page
 *   onPaginationChange — Called when user changes page or page size
 *   isLoading          — Whether data is currently being fetched
 *   onSelectionChange  — Called when row-click selection changes (blue highlight)
 *   renderExpandedRow  — If provided, enables checkboxes that expand a nested row
 */

import { useState, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";

// ── Props interface ──────────────────────────────────────────────────────

export interface DataTableProps<TData> {
  /** Column definitions — describes what columns to show and how to read cell values. */
  columns: ColumnDef<TData, unknown>[];

  /** Row data for the current page (from the API response). */
  data: TData[];

  /** Total number of rows matching the current filters (from API response.total). */
  total: number;

  /** Current page number (0-based). Page 0 = first page. */
  pageIndex: number;

  /** Number of rows per page (e.g. 10, 25, 50, 100). */
  pageSize: number;

  /**
   * Called when the user navigates to a different page or changes page size.
   * The parent should update its state and refetch from the API.
   */
  onPaginationChange: (pageIndex: number, pageSize: number) => void;

  /** Whether data is currently being fetched (shows a loading indicator). */
  isLoading?: boolean;

  /**
   * Called whenever the set of row-click-highlighted rows changes.
   * Receives the array of original row objects that are currently selected.
   * Omit this prop to hide the blue-highlight behaviour entirely.
   */
  onSelectionChange?: (selectedRows: TData[]) => void;

  /**
   * If provided, a checkbox column appears. When a row's checkbox is checked,
   * this function is called with that row's data and should return a React node
   * to render in a nested <tr> below that row (e.g. a population frequency table).
   */
  renderExpandedRow?: (row: TData) => React.ReactNode;
}

// ── Available page sizes ─────────────────────────────────────────────────
// These match the options in the Shiny app's DataTable (10, 25, 50, 100).
const PAGE_SIZES = [25, 50, 100, 500, 1000];

// ── Component ────────────────────────────────────────────────────────────

export default function DataTable<TData>({
  columns,
  data,
  total,
  pageIndex,
  pageSize,
  onPaginationChange,
  isLoading = false,
  onSelectionChange,
  renderExpandedRow,
}: DataTableProps<TData>) {
  // Calculate total number of pages
  const pageCount = Math.ceil(total / pageSize);

  // "Go to page" input — tracks the raw text so the user can type freely.
  // We only jump when they press Enter or blur the field, and we clamp to [1, pageCount].
  const [goToInput, setGoToInput] = useState("");

  // ── Two independent selection sets ─────────────────────────────────────
  //
  // selectedIds — IDs of rows highlighted blue (row-click system).
  //   Used to drive onSelectionChange → Copy button in the parent.
  //
  // expandedIds — IDs of rows with their nested detail row showing (checkbox system).
  //   Controls whether renderExpandedRow is rendered below each row.
  //
  // Both are Sets of TanStack row IDs (strings like "0", "1", "2"...).
  // We use Sets instead of plain objects because membership tests are O(1)
  // and "add / delete / has" is cleaner than setting booleans in a Record.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Shift-click anchors — one per interaction system.
  // These are refs (not state) because updating them should NOT trigger a re-render.
  // They remember the last row the user clicked so we know where the shift-range starts.
  const lastRowClickRef = useRef<number | null>(null);
  const lastCheckboxClickRef = useRef<number | null>(null);

  // Reset both sets and both anchors whenever the page data changes.
  // If we didn't do this, row IDs from the previous page would linger in the sets,
  // and the next page's rows (which reuse the same IDs "0"–"49") would appear
  // pre-selected or pre-expanded.
  useEffect(() => {
    setSelectedIds(new Set());
    setExpandedIds(new Set());
    lastRowClickRef.current = null;
    lastCheckboxClickRef.current = null;
  }, [data]);

  // ── Create TanStack Table instance ────────────────────────────────────
  // manualPagination = true tells TanStack "don't paginate locally,
  // the server handles it — just render what I give you".
  // We no longer use TanStack's row-selection feature; we manage our own
  // selectedIds Set so row-click (blue highlight) and checkbox (expand) can
  // be completely independent of each other.
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination: { pageIndex, pageSize },
    },
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  // Notify parent whenever row-click selection changes.
  // We map row IDs back to original TData objects using the current row model.
  useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange(
      rows.filter((r) => selectedIds.has(r.id)).map((r) => r.original)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // Calculate which rows are currently showing (for the "Showing X–Y of Z" label)
  const firstRow = total === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * pageSize, total);

  // Total column count, including the optional checkbox column.
  // Used for colSpan in loading/empty state cells.
  const totalCols = columns.length + (renderExpandedRow ? 1 : 0);

  // ── Row-click handler (blue highlight / copy system) ─────────────────
  //
  // Normal click: toggles this row in selectedIds (on → off → on).
  // Shift+click: adds every row between lastRowClickRef and this row to selectedIds.
  //   (We only ADD during shift-click, never remove — matches spreadsheet behaviour.)
  // We always update the anchor ref so the next shift-click has a valid range start.
  function handleRowClick(e: React.MouseEvent, rowId: string, rowIndex: number) {
    if (e.shiftKey && lastRowClickRef.current !== null) {
      const lo = Math.min(lastRowClickRef.current, rowIndex);
      const hi = Math.max(lastRowClickRef.current, rowIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => {
          if (r.index >= lo && r.index <= hi) next.add(r.id);
        });
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
    }
    lastRowClickRef.current = rowIndex;
  }

  // ── Checkbox click handler (expand / collapse system) ─────────────────
  //
  // e.stopPropagation() prevents the click from bubbling up to the <tr>'s
  // onClick handler — we don't want checking a box to also highlight the row.
  //
  // Normal click: toggles this row in expandedIds.
  // Shift+click: if the current row was expanded → collapse the whole range;
  //              if it was collapsed → expand the whole range.
  //   (The direction matches the current row's state before the click.)
  function handleCheckboxClick(e: React.MouseEvent, rowId: string, rowIndex: number) {
    e.stopPropagation();
    const isCurrentlyExpanded = expandedIds.has(rowId);

    if (e.shiftKey && lastCheckboxClickRef.current !== null) {
      const lo = Math.min(lastCheckboxClickRef.current, rowIndex);
      const hi = Math.max(lastCheckboxClickRef.current, rowIndex);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => {
          if (r.index >= lo && r.index <= hi) {
            if (isCurrentlyExpanded) next.delete(r.id);
            else next.add(r.id);
          }
        });
        return next;
      });
    } else {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
    }
    lastCheckboxClickRef.current = rowIndex;
  }

  return (
    <div>
      {/* ── Pagination controls ────────────────────────────────────────── */}
      <div className="mt-2 flex items-center justify-between text-sm">
        {/* Left side: showing X–Y of Z */}
        <span>
          {total === 0
            ? "No results"
            : `Showing ${firstRow} to ${lastRow} of ${total.toLocaleString()} entries`}
        </span>

        {/* Right side: page size selector + prev/next buttons */}
        <div className="flex items-center gap-2">
          {/* Page size dropdown */}
          <label>
            Show{" "}
            <select
              value={pageSize}
              onChange={(e) => {
                // When page size changes, reset to first page
                onPaginationChange(0, Number(e.target.value));
              }}
              className="border border-black px-1 py-0.5"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>{" "}
            entries
          </label>

          {/* Previous button */}
          <button
            onClick={() => onPaginationChange(pageIndex - 1, pageSize)}
            disabled={pageIndex === 0}
            className="border border-black px-2 py-0.5 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            Previous
          </button>

          {/* Current page indicator */}
          <span>
            Page {total === 0 ? 0 : pageIndex + 1} of {pageCount}
          </span>

          {/* Go to page input — lets users jump to an arbitrary page number
              without clicking Next/Previous repeatedly. We clamp the entered
              value to [1, pageCount] so out-of-range inputs don't break anything. */}
          {pageCount > 1 && (
            <label className="flex items-center gap-1">
              Go to:
              <input
                type="number"
                min={1}
                max={pageCount}
                value={goToInput}
                onChange={(e) => setGoToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const page = Math.min(Math.max(1, parseInt(goToInput) || 1), pageCount);
                    onPaginationChange(page - 1, pageSize);
                    setGoToInput("");
                  }
                }}
                onBlur={() => {
                  if (goToInput !== "") {
                    const page = Math.min(Math.max(1, parseInt(goToInput) || 1), pageCount);
                    onPaginationChange(page - 1, pageSize);
                    setGoToInput("");
                  }
                }}
                className="border border-black px-1 py-0.5 w-14 text-center"
              />
            </label>
          )}

          {/* Next button */}
          <button
            onClick={() => onPaginationChange(pageIndex + 1, pageSize)}
            disabled={pageIndex >= pageCount - 1}
            className="border border-black px-2 py-0.5 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-sm">
          {/* Table header */}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-black bg-white">
                {/* Checkbox column header — only shown when renderExpandedRow is provided.
                    This checkbox controls expanding/collapsing ALL rows on this page:
                    - checked = all rows expanded
                    - indeterminate = some (but not all) rows expanded
                    - unchecked = no rows expanded */}
                {renderExpandedRow && (
                  <th className="border border-black px-2 py-1 w-8">
                    <input
                      type="checkbox"
                      checked={expandedIds.size === rows.length && rows.length > 0}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            expandedIds.size > 0 && expandedIds.size < rows.length;
                      }}
                      onChange={() => {
                        if (expandedIds.size === rows.length) {
                          // All expanded → collapse all
                          setExpandedIds(new Set());
                        } else {
                          // Some or none expanded → expand all rows on this page
                          setExpandedIds(new Set(rows.map((r) => r.id)));
                        }
                      }}
                      aria-label="Expand all rows"
                    />
                  </th>
                )}
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border border-black px-2 py-1 text-left font-semibold whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          {/* Table body */}
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="border border-black px-2 py-4 text-center"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="border border-black px-2 py-4 text-center"
                >
                  No results found.
                </td>
              </tr>
            ) : (
              // flatMap lets us conditionally insert the expanded detail row
              // immediately after each data row without nesting arrays manually.
              rows.flatMap((row) => {
                const isSelected = selectedIds.has(row.id);
                const isExpanded = expandedIds.has(row.id);

                // The main data row.
                // - cursor-pointer signals the whole row is clickable (for blue highlight).
                // - bg-blue-100 when selected, hover:bg-blue-50 always so there's visual
                //   feedback on hover whether or not the row is already selected.
                const dataRow = (
                  <tr
                    key={row.id}
                    onClick={(e) => handleRowClick(e, row.id, row.index)}
                    className={`border-b border-black cursor-pointer ${
                      isSelected ? "bg-blue-100 hover:bg-blue-50" : "hover:bg-blue-50"
                    }`}
                  >
                    {/* Per-row expand checkbox — only when renderExpandedRow is provided.
                        stopPropagation is handled inside handleCheckboxClick so this click
                        doesn't also trigger the row's onClick (blue highlight). */}
                    {renderExpandedRow && (
                      <td className="border border-black px-2 py-1 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={isExpanded}
                          // onChange no-op: React requires this on a controlled checkbox.
                          // All logic is in onClick (handleCheckboxClick).
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(e, row.id, row.index)}
                          aria-label={`Expand row ${row.id}`}
                          title="Click to view population frequencies. Shift+click to expand a range."
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="border border-black px-2 py-1 whitespace-nowrap"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );

                // If this row's checkbox is checked, render the expanded detail row
                // directly below it. colSpan spans all columns (including the checkbox
                // column) so the nested content is full-width.
                if (isExpanded && renderExpandedRow) {
                  return [
                    dataRow,
                    <tr key={`${row.id}-expanded`}>
                      <td
                        colSpan={totalCols}
                        className="border border-black bg-gray-50 px-4 py-2"
                      >
                        {renderExpandedRow(row.original)}
                      </td>
                    </tr>,
                  ];
                }

                return [dataRow];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
