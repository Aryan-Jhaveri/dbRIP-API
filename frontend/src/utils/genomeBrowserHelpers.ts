/**
 * genomeBrowserHelpers — pure utility functions for genome browser integration.
 *
 * WHY THIS IS A SEPARATE FILE:
 *   These functions have no React dependencies — they're plain TypeScript that
 *   takes data in and returns strings or arrays. Keeping them separate from
 *   React components means:
 *     1. They're independently testable (no component rendering needed)
 *     2. React Fast Refresh keeps working in the component files
 *     3. They can be reused from InteractiveSearch, FileSearch, or any future page
 *
 * WHAT THESE FUNCTIONS DO:
 *   When a user selects multiple insertions and clicks "View in IGV" or
 *   "View in UCSC", we need to:
 *     1. Group the selected rows by chromosome
 *     2. Merge each group into a single bounding region (min start → max end)
 *     3. Build the right URL or locus string for the target browser
 *
 * WHY MERGE INTO BOUNDING REGIONS?
 *   IGV's browser.search() accepts only ONE locus string ("chr1:100-200").
 *   UCSC's URL also takes one position per page load. Rather than picking an
 *   arbitrary single row, we compute the bounding box that contains ALL selected
 *   rows on that chromosome — so the user sees every selected insertion in context.
 *
 * USED BY:
 *   - InteractiveSearch (pages/InteractiveSearch.tsx) — bulk View in IGV / UCSC buttons
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape needed from a selected row — just the genomic coordinates.
 * InsertionSummary satisfies this interface, so we can pass selected rows directly.
 */
export interface GenomicRow {
  chrom: string;
  start: number;
  end: number;
}

/**
 * One merged region per chromosome, with a count of how many selected rows
 * fell on that chromosome. Sorted by count descending so the first entry
 * is always the chromosome with the most selected rows.
 */
export interface MergedRegion {
  chrom: string;
  start: number;
  end: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Core merge function
// ---------------------------------------------------------------------------

/**
 * Group an array of genomic rows by chromosome and compute a bounding region
 * for each chromosome.
 *
 * EXAMPLE:
 *   Input:  [{chrom: "chr1", start: 100, end: 200},
 *            {chrom: "chr1", start: 500, end: 600},
 *            {chrom: "chr3", start: 900, end: 950}]
 *
 *   Output: [{chrom: "chr1", start: 100, end: 600, count: 2},
 *            {chrom: "chr3", start: 900, end: 950, count: 1}]
 *
 * The result is sorted by count descending — the chromosome with the most
 * rows comes first. This is used by the IGV button to decide which chromosome
 * to navigate to when rows span multiple chromosomes.
 *
 * @param rows - Selected rows (must have chrom, start, end)
 * @returns    - Merged regions sorted by count (most rows first)
 */
export function groupAndMergeByChrom(rows: GenomicRow[]): MergedRegion[] {
  if (rows.length === 0) return [];

  // Step 1: Group by chromosome using a Map.
  // For each chromosome, track the min start, max end, and row count.
  const byChrom = new Map<string, { start: number; end: number; count: number }>();

  for (const row of rows) {
    const existing = byChrom.get(row.chrom);
    if (existing) {
      // Expand the bounding box to include this row
      existing.start = Math.min(existing.start, row.start);
      existing.end = Math.max(existing.end, row.end);
      existing.count += 1;
    } else {
      // First row on this chromosome — initialize the bounding box
      byChrom.set(row.chrom, { start: row.start, end: row.end, count: 1 });
    }
  }

  // Step 2: Convert Map entries to an array of MergedRegion objects,
  // sorted by count descending so the most-populated chromosome comes first.
  return Array.from(byChrom.entries())
    .map(([chrom, region]) => ({ chrom, ...region }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// URL / locus builders
// ---------------------------------------------------------------------------

/**
 * Build a UCSC Genome Browser URL for a single genomic region.
 *
 * UCSC URL FORMAT:
 *   https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr1:100-200
 *
 *   - db:       genome assembly (hg38 = GRCh38, hg19 = GRCh37)
 *   - position: "chrom:start-end" using 1-based coordinates
 *
 * NOTE ON COORDINATES:
 *   The dbRIP database stores 1-based coordinates (from the source CSV).
 *   UCSC's position parameter also uses 1-based coordinates internally
 *   (despite BED files being 0-based). So we pass start and end directly
 *   without any conversion.
 *
 * @param chrom - Chromosome name (e.g. "chr1")
 * @param start - Start position (1-based)
 * @param end   - End position (1-based)
 * @param db    - Genome assembly (default: "hg38")
 * @returns     - Full UCSC URL ready to open in a browser tab
 */
export function buildUcscUrl(
  chrom: string,
  start: number,
  end: number,
  db: string = "hg38"
): string {
  return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=${chrom}:${start}-${end}`;
}

/**
 * Build an IGV-compatible locus string.
 *
 * IGV LOCUS FORMAT:
 *   "chr1:100-200"
 *
 *   igv.js's browser.search() accepts this format to navigate the viewer
 *   to a specific genomic region. It's the same format as UCSC's position
 *   parameter, just without the URL wrapper.
 *
 * @param chrom - Chromosome name (e.g. "chr1")
 * @param start - Start position
 * @param end   - End position
 * @returns     - Locus string like "chr1:100-200"
 */
export function buildIgvLocus(
  chrom: string,
  start: number,
  end: number
): string {
  return `${chrom}:${start}-${end}`;
}

// ---------------------------------------------------------------------------
// Human-readable base-pair formatting
// ---------------------------------------------------------------------------

/**
 * Format a base-pair count as a human-readable string.
 *
 * EXAMPLES:
 *   formatBp(500)         → "500 bp"
 *   formatBp(12_345)      → "12.3 kb"
 *   formatBp(47_300_000)  → "47.3 Mb"
 *
 * Used in warning messages so users can understand the merged region span
 * at a glance ("spans 47.3 Mb") instead of reading raw numbers ("47300000").
 *
 * @param bp - Number of base pairs (must be ≥ 0)
 * @returns  - Formatted string with appropriate unit
 */
export function formatBp(bp: number): string {
  if (bp >= 1_000_000) return `${(bp / 1_000_000).toFixed(1)} Mb`;
  if (bp >= 1_000) return `${(bp / 1_000).toFixed(1)} kb`;
  return `${bp} bp`;
}
