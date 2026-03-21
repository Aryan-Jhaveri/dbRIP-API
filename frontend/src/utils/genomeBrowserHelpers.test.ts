/**
 * Tests for the genomeBrowserHelpers utility functions.
 *
 * WHAT THESE TESTS VERIFY:
 *   - groupAndMergeByChrom correctly groups rows by chromosome and computes
 *     bounding regions (min start, max end)
 *   - Merged regions are sorted by count descending (most rows first)
 *   - Edge cases: empty input, single row, single chromosome, multiple chromosomes
 *   - buildUcscUrl produces correctly formatted UCSC Genome Browser URLs
 *   - buildIgvLocus produces correctly formatted IGV locus strings
 *
 * WHY TEST THESE SEPARATELY?
 *   These are pure functions with no React or DOM dependencies. Testing them
 *   in isolation is fast and precise — no component rendering, no mocking.
 *   The InteractiveSearch tests verify that the buttons call these functions
 *   correctly; these tests verify the functions themselves.
 */

import { describe, it, expect } from "vitest";
import {
  groupAndMergeByChrom,
  buildUcscUrl,
  buildIgvLocus,
  formatBp,
} from "./genomeBrowserHelpers";
import type { GenomicRow } from "./genomeBrowserHelpers";

// ── Test data ──────────────────────────────────────────────────────────────
// Rows spread across two chromosomes with varying positions,
// so we can verify grouping, merging, and sort order.

const multiChromRows: GenomicRow[] = [
  { chrom: "chr1", start: 100, end: 200 },
  { chrom: "chr1", start: 500, end: 600 },
  { chrom: "chr1", start: 300, end: 400 },
  { chrom: "chr3", start: 900, end: 950 },
];

const singleChromRows: GenomicRow[] = [
  { chrom: "chr7", start: 1000, end: 2000 },
  { chrom: "chr7", start: 5000, end: 6000 },
];

// ── groupAndMergeByChrom ───────────────────────────────────────────────────

describe("groupAndMergeByChrom", () => {
  it("returns empty array for empty input", () => {
    expect(groupAndMergeByChrom([])).toEqual([]);
  });

  it("returns a single region for a single row", () => {
    const result = groupAndMergeByChrom([{ chrom: "chr1", start: 100, end: 200 }]);
    expect(result).toEqual([{ chrom: "chr1", start: 100, end: 200, count: 1 }]);
  });

  it("merges rows on the same chromosome into a bounding region", () => {
    // chr7 rows: start=1000..5000, end=2000..6000
    // Bounding region should be start=1000, end=6000
    const result = groupAndMergeByChrom(singleChromRows);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ chrom: "chr7", start: 1000, end: 6000, count: 2 });
  });

  it("groups by chromosome and merges each group independently", () => {
    // chr1: 3 rows → start=100, end=600
    // chr3: 1 row  → start=900, end=950
    const result = groupAndMergeByChrom(multiChromRows);
    expect(result).toHaveLength(2);

    // chr1 has more rows (3 vs 1), so it should come first
    expect(result[0]).toEqual({ chrom: "chr1", start: 100, end: 600, count: 3 });
    expect(result[1]).toEqual({ chrom: "chr3", start: 900, end: 950, count: 1 });
  });

  it("sorts by count descending (most rows first)", () => {
    // If we add more chr3 rows than chr1, chr3 should come first
    const rows: GenomicRow[] = [
      { chrom: "chr1", start: 100, end: 200 },
      { chrom: "chr3", start: 900, end: 950 },
      { chrom: "chr3", start: 800, end: 850 },
      { chrom: "chr3", start: 700, end: 750 },
    ];
    const result = groupAndMergeByChrom(rows);
    expect(result[0].chrom).toBe("chr3");
    expect(result[0].count).toBe(3);
    expect(result[1].chrom).toBe("chr1");
    expect(result[1].count).toBe(1);
  });
});

// ── buildUcscUrl ───────────────────────────────────────────────────────────

describe("buildUcscUrl", () => {
  it("builds a correctly formatted UCSC URL with default db=hg38", () => {
    const url = buildUcscUrl("chr1", 100000, 200000);
    expect(url).toBe(
      "https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr1:100000-200000"
    );
  });

  it("uses a custom db when specified", () => {
    const url = buildUcscUrl("chr7", 500, 600, "hg19");
    expect(url).toBe(
      "https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg19&position=chr7:500-600"
    );
  });
});

// ── buildIgvLocus ──────────────────────────────────────────────────────────

describe("buildIgvLocus", () => {
  it("builds a correctly formatted IGV locus string", () => {
    expect(buildIgvLocus("chr1", 100000, 200000)).toBe("chr1:100000-200000");
  });

  it("handles small regions", () => {
    expect(buildIgvLocus("chrX", 1, 2)).toBe("chrX:1-2");
  });
});

// ── formatBp ──────────────────────────────────────────────────────────────

describe("formatBp", () => {
  it("formats values under 1,000 as bp", () => {
    expect(formatBp(500)).toBe("500 bp");
    expect(formatBp(0)).toBe("0 bp");
    expect(formatBp(999)).toBe("999 bp");
  });

  it("formats values 1,000–999,999 as kb", () => {
    expect(formatBp(1_000)).toBe("1.0 kb");
    expect(formatBp(12_345)).toBe("12.3 kb");
    expect(formatBp(999_999)).toBe("1000.0 kb");
  });

  it("formats values ≥ 1,000,000 as Mb", () => {
    expect(formatBp(1_000_000)).toBe("1.0 Mb");
    expect(formatBp(47_300_000)).toBe("47.3 Mb");
    expect(formatBp(248_956_422)).toBe("249.0 Mb");
  });
});
