/**
 * filters.ts — shared filter option definitions used across InteractiveSearch and BatchSearch.
 *
 * WHY A SHARED FILE?
 *   InteractiveSearch and BatchSearch both filter by population, ME type, annotation, etc.
 *   Without a shared source, the two pages can drift — different labels, missing values,
 *   inconsistent ordering. This file is the single place to add, remove, or rename options.
 *
 * HOW TO USE:
 *   import { POPULATIONS, MIN_FREQ_OPTIONS, ME_TYPE_OPTIONS, ... } from "../constants/filters";
 *
 * FILTER OPTION FORMAT:
 *   Each option has:
 *     value — the string sent to the API (must exactly match the database value)
 *     label — the string shown to the user in a dropdown or checkbox
 */

export interface FilterOption {
  value: string;
  label: string;
}

// ── Population options ───────────────────────────────────────────────────
// 5 super-populations + 26 sub-populations from the 1000 Genomes Project,
// plus two aggregate columns: "Non_African" and "All".
// Values must match the population codes stored in the pop_frequencies table.

export const POPULATIONS: FilterOption[] = [
  // Aggregate columns (computed across all or a subset of populations)
  { value: "All",         label: "All — All populations combined" },
  { value: "Non_African", label: "Non_African — All non-African populations" },
  // Super-populations
  { value: "AFR", label: "AFR — African" },
  { value: "AMR", label: "AMR — Ad Mixed American" },
  { value: "EAS", label: "EAS — East Asian" },
  { value: "EUR", label: "EUR — European" },
  { value: "SAS", label: "SAS — South Asian" },
  // Sub-populations
  { value: "ACB", label: "ACB — African Caribbean in Barbados" },
  { value: "ASW", label: "ASW — Americans of African Ancestry in SW USA" },
  { value: "BEB", label: "BEB — Bengali in Bangladesh" },
  { value: "CDX", label: "CDX — Chinese Dai in Xishuangbanna, China" },
  { value: "CEU", label: "CEU — Utah Residents (CEPH) with Northern and Western European Ancestry" },
  { value: "CHB", label: "CHB — Han Chinese in Beijing, China" },
  { value: "CHS", label: "CHS — Southern Han Chinese" },
  { value: "CLM", label: "CLM — Colombians in Medellin, Colombia" },
  { value: "ESN", label: "ESN — Esan in Nigeria" },
  { value: "FIN", label: "FIN — Finnish in Finland" },
  { value: "GBR", label: "GBR — British in England and Scotland" },
  { value: "GIH", label: "GIH — Gujarati Indian in Houston, TX" },
  { value: "GWD", label: "GWD — Gambian in Western Division, The Gambia" },
  { value: "IBS", label: "IBS — Iberian Populations in Spain" },
  { value: "ITU", label: "ITU — Indian Telugu in the UK" },
  { value: "JPT", label: "JPT — Japanese in Tokyo, Japan" },
  { value: "KHV", label: "KHV — Kinh in Ho Chi Minh City, Vietnam" },
  { value: "LWK", label: "LWK — Luhya in Webuye, Kenya" },
  { value: "MSL", label: "MSL — Mende in Sierra Leone" },
  { value: "MXL", label: "MXL — Mexican Ancestry in Los Angeles, CA" },
  { value: "PEL", label: "PEL — Peruvians in Lima, Peru" },
  { value: "PJL", label: "PJL — Punjabi in Lahore, Pakistan" },
  { value: "PUR", label: "PUR — Puerto Ricans in Puerto Rico" },
  { value: "STU", label: "STU — Sri Lankan Tamil in the UK" },
  { value: "TSI", label: "TSI — Toscani in Italy" },
  { value: "YRI", label: "YRI — Yoruba in Ibadan, Nigeria" },
];

// ── Minimum frequency thresholds ─────────────────────────────────────────
// Preset allele frequency cutoffs for the min_freq API param.
// "" means no filter (show insertions at any frequency in the chosen population).
// The min_freq dropdown is disabled until a population is selected, because
// the API only applies the frequency filter when a population is also specified.

export const MIN_FREQ_OPTIONS: FilterOption[] = [
  { value: "",     label: "Any frequency" },
  { value: "0.01", label: "≥ 1%" },
  { value: "0.05", label: "≥ 5%" },
  { value: "0.10", label: "≥ 10%" },
  { value: "0.50", label: "≥ 50%" },
];

// ── ME (Mobile Element) types ────────────────────────────────────────────
// The five TE families in the database. Values are the exact strings stored
// in the me_type column — the API filters with an equality or IN check.

export const ME_TYPE_OPTIONS: FilterOption[] = [
  { value: "ALU",   label: "ALU" },
  { value: "LINE1", label: "LINE1" },
  { value: "SVA",   label: "SVA" },
  { value: "HERVK", label: "HERVK" },
  { value: "PP",    label: "PP" },
];

// ── ME categories ────────────────────────────────────────────────────────

export const CATEGORY_OPTIONS: FilterOption[] = [
  { value: "Reference",     label: "Reference" },
  { value: "Non-reference", label: "Non-reference" },
];

// ── Genomic annotations ──────────────────────────────────────────────────
// The null/Undetermined option maps to rows where annotation IS NULL in the DB.
// The API accepts "null" as a special string value and translates it to IS NULL.

export const ANNOTATION_OPTIONS: FilterOption[] = [
  { value: "PROMOTER",    label: "Promoter" },
  { value: "5_UTR",       label: "5' UTR" },
  { value: "EXON",        label: "Exon" },
  { value: "INTRONIC",    label: "Intronic" },
  { value: "3_UTR",       label: "3' UTR" },
  { value: "TERMINATOR",  label: "Terminator" },
  { value: "INTERGENIC",  label: "Intergenic" },
  { value: "null",        label: "Undetermined" },
];

// ── Strand options ───────────────────────────────────────────────────────

export const STRAND_OPTIONS: FilterOption[] = [
  { value: "+",    label: "Positive (+)" },
  { value: "-",    label: "Negative (−)" },
  { value: "null", label: "Undetermined" },
];

// ── Population groups ─────────────────────────────────────────────────────
// Defines how the 33 population columns are grouped in the PopFreqTable.
// Each group has a label (the region name shown as a spanning header) and
// a list of population codes in left-to-right display order.
//
// WHY THIS LIVES HERE (not in InteractiveSearch.tsx):
//   PopFreqTable needs this to render grouped headers and toggle buttons.
//   Keeping it next to the flat POPULATIONS list means there is one place
//   to update if the 1000 Genomes population structure ever changes.
//
// ORDER MATTERS:
//   Groups appear left-to-right in the table.  Within each group, the
//   first entry is the super-population aggregate (e.g. "AFR") — it gets
//   a distinct background in the table — followed by its sub-populations.
//   The "Aggregates" group is an exception: both "All" and "Non_African"
//   are cross-population aggregates, not a super-pop + sub-pops pair.
//
// VERIFIED AGAINST: data/manifests/dbrip_v1.yaml population_columns
//   Aggregates: 7 cols (2 cross-continental + 5 super-pops) |
//   AFR sub: 7 cols | AMR sub: 4 cols | EAS sub: 5 cols |
//   EUR sub: 5 cols | SAS sub: 5 cols  →  total 33 ✓
//
// WHY SUPER-POPS IN AGGREGATES?
//   AFR/AMR/EAS/EUR/SAS are pooled frequencies across their sub-populations,
//   so they are aggregate values just like "All" and "Non_African". Grouping
//   them together means toggling "Aggregates" shows every summary-level
//   number at once, while the regional toggles show only granular sub-pop
//   breakdowns without a mixed aggregate column in the middle.
//   The SUPER_POPS set in InteractiveSearch.tsx gives them a distinct
//   background to visually separate them from All/Non_African within the group.

export const POP_GROUPS: { label: string; pops: string[] }[] = [
  { label: "Aggregates", pops: ["All", "Non_African", "AFR", "AMR", "EAS", "EUR", "SAS"] },
  { label: "AFR",        pops: ["ACB", "ASW", "ESN", "GWD", "LWK", "MSL", "YRI"] },
  { label: "AMR",        pops: ["CLM", "MXL", "PEL", "PUR"] },
  { label: "EAS",        pops: ["CDX", "CHB", "CHS", "JPT", "KHV"] },
  { label: "EUR",        pops: ["CEU", "FIN", "GBR", "IBS", "TSI"] },
  { label: "SAS",        pops: ["BEB", "GIH", "ITU", "PJL", "STU"] },
];

// ── Token classification (used by TokenSearchBar) ─────────────────────────
//
// WHY SETS HERE (not in TokenSearchBar)?
//   TokenSearchBar needs to know which words are valid filter tokens. Keeping
//   these Sets here (next to the dropdown option lists) means there is ONE
//   place to update when a new ME type or annotation is added to the database.
//   TokenSearchBar simply imports and calls classifyToken() — it has no
//   knowledge of the actual values.
//
// CASE HANDLING:
//   All token matching is done on the uppercased input word. The raw word
//   coming out of classifyToken is returned as-is (original case) so the
//   chip label matches what the user typed; but for API calls the caller
//   should use the token value exactly as stored in the DB (which happens
//   to already be uppercase for ME types and annotations).

/** The four field types a typed word can resolve to. */
export type TokenType = "meType" | "annotation" | "strand" | "chrom";

// ME_TYPE_TOKENS mirrors ME_TYPE_OPTIONS values (uppercase, exact match).
export const ME_TYPE_TOKENS = new Set(["ALU", "LINE1", "SVA", "HERVK", "PP"]);

// ANNOTATION_TOKENS mirrors ANNOTATION_OPTIONS values (uppercase, exact match).
// "null" is excluded — it's only meaningful in the dropdown context.
export const ANNOTATION_TOKENS = new Set([
  "PROMOTER", "5_UTR", "EXON", "INTRONIC", "3_UTR", "TERMINATOR", "INTERGENIC",
]);

// Strand is just two characters. Both are stored exactly as "+" or "-" in the DB.
export const STRAND_TOKENS = new Set(["+", "-"]);

// All 25 chromosomes the API supports.  chr1–chr22 + X, Y, M.
export const CHROM_TOKENS = new Set([
  "chr1",  "chr2",  "chr3",  "chr4",  "chr5",  "chr6",  "chr7",  "chr8",
  "chr9",  "chr10", "chr11", "chr12", "chr13", "chr14", "chr15", "chr16",
  "chr17", "chr18", "chr19", "chr20", "chr21", "chr22", "chrX",  "chrY", "chrM",
]);

/**
 * classifyToken — maps a raw typed word to the API field it belongs to.
 *
 * Returns null if the word is not a recognized token (stays as free text).
 * Strand tokens are matched as-is; everything else is uppercased first so
 * users can type "alu", "Alu", or "ALU" interchangeably.
 *
 * @example
 *   classifyToken("ALU")       → "meType"
 *   classifyToken("alu")       → "meType"
 *   classifyToken("INTRONIC")  → "annotation"
 *   classifyToken("+")         → "strand"
 *   classifyToken("chr1")      → "chrom"
 *   classifyToken("BRCA2")     → null   (stays as free text)
 */
export function classifyToken(word: string): TokenType | null {
  // Strand: exact match only (+ and - must not be uppercased)
  if (STRAND_TOKENS.has(word)) return "strand";

  const upper = word.toUpperCase();
  if (ME_TYPE_TOKENS.has(upper))    return "meType";
  if (ANNOTATION_TOKENS.has(upper)) return "annotation";

  // Chromosomes: lowercase "chr" + uppercase remainder covers "chr1" and "CHR1"
  const lowerWord = word.toLowerCase();
  if (CHROM_TOKENS.has(lowerWord))  return "chrom";

  return null;
}
