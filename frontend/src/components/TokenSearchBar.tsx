/**
 * TokenSearchBar — a search input that converts recognized words into filter chips.
 *
 * WHAT IT DOES:
 *   Instead of one big free-text LIKE query, this bar lets users type structured
 *   tokens like "ALU", "INTRONIC", "+", or "chr1" and have them automatically
 *   recognized as specific API filter fields. Unrecognized text stays as a
 *   free-text LIKE search, exactly like the old search bar.
 *
 * HOW CHIP CREATION WORKS:
 *   1. User types a word (e.g. "ALU").
 *   2. User presses Space or Enter.
 *   3. classifyToken("ALU") returns "meType".
 *   4. Word is removed from the input and added as a blue chip.
 *   5. Unrecognized words: Space is typed normally (they stay in the input).
 *
 * HOW IT CONNECTS TO OTHER FILES:
 *   - classifyToken / TokenType (constants/filters.ts) — does the actual
 *     token recognition; this component has no knowledge of valid values.
 *   - InteractiveSearch (pages/InteractiveSearch.tsx) — renders this component
 *     and receives SearchTokens via onTokensChange to build the API query.
 *
 * CHIP COLOR SCHEME:
 *   meType     → indigo  (same blue-ish family as the ME Type dropdown)
 *   annotation → green
 *   strand     → orange
 *   chrom      → gray
 *
 * KEYBOARD SHORTCUTS:
 *   Space / Enter  after a recognized word → promote to chip
 *   Space          after an unrecognized word → normal space (free text)
 *   Backspace      on empty input → remove the last chip
 *   × button       on a chip → remove that chip
 */

import { useState, useCallback } from "react";
import {
  classifyToken,
  type TokenType,
} from "../constants/filters";

// ── Public types ────────────────────────────────────────────────────────────

/**
 * SearchTokens — the structured output this bar produces.
 * Passed to onTokensChange whenever the user changes chips or types free text.
 *
 * meTypes / annotations / strands / chroms: arrays of recognized token values
 *   ready to pass directly to the API (comma-joined as needed).
 * freeText: whatever remains in the input box (debounced by the parent).
 */
export interface SearchTokens {
  meTypes:     string[];
  annotations: string[];
  strands:     string[];
  chroms:      string[];
  freeText:    string;
}

interface TokenSearchBarProps {
  /** Called whenever chips or free text change. */
  onTokensChange: (tokens: SearchTokens) => void;
  /** Ghost text shown in the empty input box. */
  placeholder?: string;
}

// ── Internal chip type ──────────────────────────────────────────────────────

interface Chip {
  type: TokenType;
  /** The canonical value to send to the API (always uppercase for non-strand). */
  value: string;
  /** The display label (same as value; shown on the chip face). */
  label: string;
}

// ── Color map ───────────────────────────────────────────────────────────────

const CHIP_COLORS: Record<TokenType, string> = {
  meType:     "bg-indigo-100 text-indigo-800",
  annotation: "bg-green-100  text-green-800",
  strand:     "bg-orange-100 text-orange-800",
  chrom:      "bg-gray-100   text-gray-700",
};

// ── Helper: derive canonical API value from raw word + type ─────────────────
// Strand stays as-is; everything else is uppercased to match DB storage.
function canonicalValue(word: string, type: TokenType): string {
  if (type === "strand") return word;
  if (type === "chrom")  return word.toLowerCase();  // chr1, chrX …
  return word.toUpperCase();                          // ALU, INTRONIC …
}

// ── Helper: rebuild SearchTokens from current chip list + input value ────────
function buildSearchTokens(chips: Chip[], inputValue: string): SearchTokens {
  return {
    meTypes:     chips.filter((c) => c.type === "meType"    ).map((c) => c.value),
    annotations: chips.filter((c) => c.type === "annotation").map((c) => c.value),
    strands:     chips.filter((c) => c.type === "strand"    ).map((c) => c.value),
    chroms:      chips.filter((c) => c.type === "chrom"     ).map((c) => c.value),
    freeText:    inputValue.trim(),
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TokenSearchBar({
  onTokensChange,
  placeholder = "e.g. ALU INTRONIC + chr1",
}: TokenSearchBarProps) {
  // chips: the array of promoted filter tokens shown as colored pills.
  const [chips, setChips] = useState<Chip[]>([]);

  // inputValue: the raw text currently in the <input> box.
  // This becomes the freeText LIKE search once debounced by the parent.
  const [inputValue, setInputValue] = useState("");

  // ── Notify parent ────────────────────────────────────────────────────────
  // Called after every chips or input change so the parent always has fresh state.
  const notify = useCallback(
    (nextChips: Chip[], nextInput: string) => {
      onTokensChange(buildSearchTokens(nextChips, nextInput));
    },
    [onTokensChange]
  );

  // ── Remove a chip by index ────────────────────────────────────────────────
  const removeChip = useCallback(
    (index: number) => {
      setChips((prev) => {
        const next = prev.filter((_, i) => i !== index);
        notify(next, inputValue);
        return next;
      });
    },
    [inputValue, notify]
  );

  // ── Handle keydown inside the text input ─────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Backspace on an empty input → pop the last chip.
      if (e.key === "Backspace" && inputValue === "") {
        setChips((prev) => {
          if (prev.length === 0) return prev;
          const next = prev.slice(0, -1);
          notify(next, "");
          return next;
        });
        return;
      }

      // Space or Enter after a non-empty word → attempt token promotion.
      if ((e.key === " " || e.key === "Enter") && inputValue.trim() !== "") {
        // Grab the last whitespace-separated word in the input.
        // Example: if input is "hello ALU" and user presses Space,
        // we try to promote "ALU".
        const parts = inputValue.trimEnd().split(/\s+/);
        const lastWord = parts[parts.length - 1];

        const tokenType = classifyToken(lastWord);

        if (tokenType !== null) {
          // Recognized token → create a chip and remove the word from input.
          e.preventDefault(); // Don't let the space/enter character through.

          const value = canonicalValue(lastWord, tokenType);
          const newChip: Chip = { type: tokenType, value, label: value };

          // Remove the promoted word from the input, keep any preceding text.
          const prefix = parts.slice(0, -1).join(" ");
          const nextInput = prefix ? prefix + " " : "";

          setChips((prev) => {
            const next = [...prev, newChip];
            notify(next, nextInput);
            return next;
          });
          setInputValue(nextInput);
        }
        // If unrecognized: do nothing — the key event propagates normally
        // (Space inserts a space, Enter has no effect since there's no form).
      }
    },
    [inputValue, notify]
  );

  // ── Handle text input changes ─────────────────────────────────────────────
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      notify(chips, val);
    },
    [chips, notify]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    /*
     * Outer container: flex row, wraps so chips don't overflow on small screens.
     * border + px/py mirrors the other filter inputs on the page.
     * Clicking anywhere on the bar focuses the hidden input via the label trick,
     * but we just use onClick to imperatively focus instead for simplicity.
     */
    <div
      className="flex flex-wrap border border-black dark:border-gray-500 px-2 py-1 gap-1 items-center cursor-text min-h-[2rem]"
      onClick={(e) => {
        // Focus the input when the user clicks anywhere in the bar area
        // (not directly on a chip's × button, which stops propagation).
        const input = (e.currentTarget as HTMLElement).querySelector("input");
        input?.focus();
      }}
    >
      {/* ── Chips ─────────────────────────────────────────────────────── */}
      {chips.map((chip, i) => (
        <span
          key={`${chip.type}-${chip.value}-${i}`}
          className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${CHIP_COLORS[chip.type]}`}
        >
          {chip.label}
          {/* × button: stops click propagation so the outer onClick
              doesn't re-focus the input after the chip is removed. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeChip(i);
            }}
            className="ml-0.5 leading-none cursor-pointer hover:opacity-70"
            aria-label={`Remove ${chip.label}`}
          >
            ×
          </button>
        </span>
      ))}

      {/* ── Text input ────────────────────────────────────────────────── */}
      {/*
       * flex-1 lets the input fill remaining space.
       * min-w-[8rem] prevents it from collapsing to zero when there are many chips.
       * outline-none removes the browser focus ring (the outer div already has a border).
       * bg-transparent so the input doesn't show a white box on dark-mode backgrounds.
       */}
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={chips.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[8rem] outline-none text-sm bg-transparent dark:text-gray-100"
      />
    </div>
  );
}
