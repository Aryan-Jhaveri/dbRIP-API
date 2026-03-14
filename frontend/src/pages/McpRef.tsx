/**
 * McpRef — Static MCP (Model Context Protocol) reference page.
 *
 * WHAT THIS PAGE DOES:
 *   Documents the 5 MCP tools that let LLMs query the dbRIP database
 *   directly in natural language — their names, inputs, and example outputs.
 *   Also shows how to connect supported AI clients to the hosted server.
 *
 * WHAT IS MCP?
 *   Model Context Protocol (MCP) is an open standard that lets AI assistants
 *   call external tools. Instead of copy-pasting data into a chat, the AI can
 *   query the dbRIP database directly during a conversation. The MCP server
 *   (mcp/server.ts) translates tool calls into HTTP requests against the
 *   FastAPI backend — it never touches the database directly.
 *
 * WHY STATIC?
 *   Docs don't change at runtime. A static component has no loading state,
 *   no error state, and nothing to break.
 *
 * HOW THIS FILE CONNECTS TO THE REST:
 *   - Imported and rendered by App.tsx when activeTab === "mcp-ref"
 *   - Uses local useState for collapsible tool sections and copy buttons;
 *     no API calls are made
 */

import { useState } from "react";

// ── The current hosted MCP endpoint ───────────────────────────────────────
//
// This is a temporary deployment on Render's free tier. Free-tier services
// spin down after 15 minutes of inactivity — the first call after a cold
// start may take ~30 seconds.
//
// Keeping it as a constant means only one place needs updating when the
// server moves to a permanent home.
const MCP_URL = "https://dbrip-1.onrender.com/mcp";

// ── Sub-components ────────────────────────────────────────────────────────

/**
 * CopyBlock — a <pre> code block with an inline "Copy" button.
 *
 * Placed top-right inside the block so users can copy the snippet without
 * manually selecting text. The button flashes "Copied!" for 1.5 s then
 * reverts — same pattern as the page-level "Copy full reference" button.
 *
 * @param code   The text to display and copy.
 * @param label  Optional aria-label for the copy button (defaults to "Copy").
 */
function CopyBlock({ code, label = "Copy" }: { code: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done">("idle");

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    });
  }

  return (
    // relative positioning lets the absolute copy button sit in the top-right corner.
    <div className="relative">
      <pre className="text-sm bg-gray-100 dark:bg-gray-800 font-mono px-2 py-2 overflow-x-auto whitespace-pre pr-16">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        aria-label={label}
        className="absolute top-1 right-1 border border-black dark:border-gray-500 px-2 py-0.5 text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 bg-gray-100 dark:bg-gray-800"
      >
        {state === "done" ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

/**
 * McpTool — documents a single MCP tool as a collapsible section.
 *
 * Clicking the header toggles the params table and example open and closed.
 * Collapsed by default so the page starts as a compact list.
 *
 * @param name     Tool name as the AI calls it, e.g. "search_by_region"
 * @param desc     One-line description of what it does
 * @param children Optional params table and/or example blocks
 */
function McpTool({
  name,
  desc,
  children,
}: {
  name: string;
  desc: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3 border border-black dark:border-gray-500">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2 flex items-start gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <code className="text-sm bg-gray-100 dark:bg-gray-800 font-mono px-1 font-semibold">
            {name}
          </code>
          <p className="text-sm mt-1">{desc}</p>
        </div>
        <span className="text-xs shrink-0 mt-1 select-none">{open ? "▾" : "▸"}</span>
      </button>

      {open && children && (
        <div className="px-3 pt-2 pb-3 border-t border-black dark:border-gray-500">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ParamsTable — renders a table of tool input parameter documentation.
 *
 * @param rows  Array of [name, type, description] tuples.
 */
function ParamsTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <table className="text-sm border border-black dark:border-gray-500 w-full">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-800">
          <th className="border border-black dark:border-gray-500 px-2 py-1 text-left font-semibold">Parameter</th>
          <th className="border border-black dark:border-gray-500 px-2 py-1 text-left font-semibold">Type</th>
          <th className="border border-black dark:border-gray-500 px-2 py-1 text-left font-semibold">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, type, description]) => (
          <tr key={name}>
            <td className="border border-black dark:border-gray-500 px-2 py-1 font-mono bg-gray-100 dark:bg-gray-800 whitespace-nowrap">{name}</td>
            <td className="border border-black dark:border-gray-500 px-2 py-1 text-gray-600 dark:text-gray-400 whitespace-nowrap">{type}</td>
            <td className="border border-black dark:border-gray-500 px-2 py-1">{description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Example — renders a JSON/text example in a scrollable code block (no copy button).
 * Used inside McpTool expanded sections where the snippet is illustrative, not
 * something users typically paste directly.
 */
function Example({ code }: { code: string }) {
  return (
    <pre className="text-sm bg-gray-100 dark:bg-gray-800 font-mono px-2 py-2 mt-2 overflow-x-auto whitespace-pre">
      {code}
    </pre>
  );
}

// ── Main component ────────────────────────────────────────────────────────

/**
 * MCP_REF_TEXT — plain-text version of the full MCP reference.
 * Used by the "Copy full reference" button.
 */
const MCP_REF_TEXT = `dbRIP MCP Reference
===================

Model Context Protocol (MCP) lets LLMs like Claude query the dbRIP database
directly in natural language during a conversation. The MCP server translates
tool calls into HTTP requests against the FastAPI backend — it never accesses
the database directly.

Temporary hosted endpoint (Render free tier):
  ${MCP_URL}

Health check: https://dbrip-1.onrender.com/health
Note: cold starts after 15 min inactivity may take ~30 seconds.


Setup by client
---------------

Claude Desktop — add to claude_desktop_config.json:
{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}

Claude.ai (Custom Connector) — paste URL directly in Settings → Connectors:
  ${MCP_URL}

Cursor — add to .cursor/mcp.json:
{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}

Windsurf — add to ~/.codeium/windsurf/mcp_config.json:
{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}


Tools
-----

search_by_region   — find insertions in a genomic window (primary region query)
list_insertions    — database-wide filter/search, all params optional
get_insertion      — full record + all 33 pop frequencies for a known ID
get_stats          — aggregate counts grouped by me_type, chrom, variant_class, etc.
list_datasets      — loaded dataset metadata, good first call to verify DB is live
`;

export default function McpRef() {
  const [copy, setCopy] = useState<"idle" | "done">("idle");

  function handleCopy() {
    navigator.clipboard.writeText(MCP_REF_TEXT).then(() => {
      setCopy("done");
      setTimeout(() => setCopy("idle"), 1500);
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={handleCopy}
          className="border border-black dark:border-gray-500 px-3 py-1 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {copy === "done" ? "Copied!" : "Copy full reference"}
        </button>
      </div>

      {/* Intro */}
      <p className="text-sm mb-2">
        Model Context Protocol (MCP) lets <strong>LLMs like Claude query the dbRIP
        database directly</strong> during a conversation — no copy-pasting API responses,
        no terminal commands. The MCP server translates tool calls into HTTP requests
        against the FastAPI backend.
      </p>
      <p className="text-sm mb-6">
        There are 5 tools:{" "}
        <code className="bg-gray-100 dark:bg-gray-800 font-mono px-1">search_by_region</code>,{" "}
        <code className="bg-gray-100 dark:bg-gray-800 font-mono px-1">list_insertions</code>,{" "}
        <code className="bg-gray-100 dark:bg-gray-800 font-mono px-1">get_insertion</code>,{" "}
        <code className="bg-gray-100 dark:bg-gray-800 font-mono px-1">get_stats</code>, and{" "}
        <code className="bg-gray-100 dark:bg-gray-800 font-mono px-1">list_datasets</code>.
        The AI chooses which tool to call based on your question.
      </p>

      {/* ── Hosted endpoint ──────────────────────────────────────────────── */}
      {/*
       * This is a temporary deployment on Render's free tier — not a permanent
       * production URL. Free tier services spin down after 15 minutes of
       * inactivity; the first request after a cold start takes ~30 seconds.
       * The URL will change when the server is moved to permanent hosting.
       */}
      <div className="mb-6">
        <p className="text-sm font-semibold mb-1">
          Hosted endpoint{" "}
          <span className="font-normal italic text-gray-500 dark:text-gray-400">
            — temporary deployment, URL may change
          </span>
        </p>
        <CopyBlock
          code={MCP_URL}
          label="Copy MCP endpoint URL"
        />
        <p className="text-xs mt-1 italic">
          Health check:{" "}
          <code className="font-mono">https://dbrip-1.onrender.com/health</code>
          {" "}— returns{" "}
          <code className="font-mono">{`{"status":"ok"}`}</code>.
          Cold starts (after 15 min idle) may take ~30 s.
        </p>
      </div>

      {/* ── Setup by client ──────────────────────────────────────────────── */}
      {/*
       * Each AI client stores MCP server config differently. The snippets
       * below are copy-paste ready — just replace the URL if the server moves.
       *
       * Most desktop clients use stdio transport and need the `mcp-remote`
       * npm package as a local bridge to reach this HTTP server. Claude.ai
       * supports HTTP MCP natively via Custom Connectors (no bridge needed).
       */}
      <div className="mb-6">
        <p className="text-sm font-semibold mb-3">Setup</p>

        {/* Claude Desktop */}
        <div className="mb-4">
          <p className="text-sm font-semibold mb-1">Claude Desktop</p>
          <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">
            Add to{" "}
            <code className="font-mono">claude_desktop_config.json</code>.{" "}
            <code className="font-mono">mcp-remote</code> bridges Desktop's stdio
            transport to this HTTP server — no local server needed.
          </p>
          <CopyBlock
            label="Copy Claude Desktop config"
            code={`{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}`}
          />
        </div>

        {/* Claude.ai */}
        <div className="mb-4">
          <p className="text-sm font-semibold mb-1">Claude.ai — Custom Connector</p>
          <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">
            Go to <strong>Settings → Connectors → Add connector</strong>, paste the URL
            below. Claude.ai connects to HTTP MCP servers natively — no bridge required.
          </p>
          <CopyBlock
            label="Copy Claude.ai connector URL"
            code={MCP_URL}
          />
        </div>

        {/* Cursor */}
        <div className="mb-4">
          <p className="text-sm font-semibold mb-1">Cursor</p>
          <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">
            Add to <code className="font-mono">.cursor/mcp.json</code> (project) or{" "}
            <code className="font-mono">~/.cursor/mcp.json</code> (global).
          </p>
          <CopyBlock
            label="Copy Cursor MCP config"
            code={`{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}`}
          />
        </div>

        {/* Windsurf */}
        <div className="mb-4">
          <p className="text-sm font-semibold mb-1">Windsurf</p>
          <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">
            Add to{" "}
            <code className="font-mono">~/.codeium/windsurf/mcp_config.json</code>.
          </p>
          <CopyBlock
            label="Copy Windsurf MCP config"
            code={`{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}`}
          />
        </div>

        {/* VS Code */}
        <div className="mb-2">
          <p className="text-sm font-semibold mb-1">VS Code (GitHub Copilot / Cline)</p>
          <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">
            Add to <code className="font-mono">.vscode/mcp.json</code> (project) or
            your user <code className="font-mono">settings.json</code> under{" "}
            <code className="font-mono">mcp.servers</code>.
          </p>
          <CopyBlock
            label="Copy VS Code MCP config"
            code={`{
  "servers": {
    "dbrip": {
      "type": "stdio",
      "command": "npx",
      "args": ["mcp-remote", "${MCP_URL}"]
    }
  }
}`}
          />
        </div>
      </div>

      {/* ── Tools ────────────────────────────────────────────────────────── */}
      <p className="text-sm font-semibold mb-3">Tools</p>

      {/* search_by_region */}
      <McpTool
        name="search_by_region"
        desc="Find TE insertions overlapping a genomic region. Coordinates are 1-based (same as dbRIP source data). Primary tool for region-based queries — e.g. 'what insertions are near gene X?'"
      >
        <ParamsTable
          rows={[
            ["chrom",         "string (required)",  "Chromosome, e.g. chr1, chrX, chrY"],
            ["start",         "integer (required)", "Region start coordinate (1-based, inclusive)"],
            ["end",           "integer (required)", "Region end coordinate (1-based, inclusive)"],
            ["assembly",      "string",             "Genome assembly — default hg38 (only assembly in dbRIP v1)"],
            ["me_type",       "string",             "TE family filter: ALU, LINE1, SVA, HERVK"],
            ["me_category",   "string",             "Non-reference (polymorphic) or Reference (fixed)"],
            ["population",    "string",             "Population code for frequency filter: EUR, AFR, EAS, SAS, AMR, or any individual 1000G code"],
            ["min_freq",      "number 0–1",         "Minimum allele frequency. Requires population."],
            ["annotation",    "string",             "Genomic context: INTRONIC, INTERGENIC, EXONIC, UTR5, UTR3, etc."],
            ["variant_class", "string",             "Frequency class: Very Rare, Rare, Low Frequency, Common"],
          ]}
        />
        <Example
          code={`# Example prompt: "Find ALU insertions near BRCA2 on chr13"
{
  "chrom": "chr13",
  "start": 32315086,
  "end": 32400268,
  "me_type": "ALU"
}

# Response:
{
  "total": 7,
  "limit": 50,
  "offset": 0,
  "results": [{ "id": "A0012345", "me_type": "ALU", "annotation": "INTRONIC", ... }]
}`}
        />
      </McpTool>

      {/* list_insertions */}
      <McpTool
        name="list_insertions"
        desc="Filter and search TE insertions database-wide. All params optional — no region needed. 'search' does free-text match; all other params are exact filters that stack with AND logic."
      >
        <ParamsTable
          rows={[
            ["search",        "string",        "Free-text search across id, chrom, me_type, me_category, rip_type, me_subtype, annotation, variant_class (case-insensitive LIKE)"],
            ["me_type",       "string",        "TE family: ALU, LINE1, SVA, HERVK. Comma-separate for OR: ALU,SVA"],
            ["me_category",   "string",        "Non-reference or Reference"],
            ["annotation",    "string",        "INTRONIC, INTERGENIC, EXONIC, etc. Comma-separate for multiple."],
            ["variant_class", "string",        "Very Rare, Rare, Low Frequency, Common. Comma-separate for multiple."],
            ["population",    "string",        "Population code for frequency filter"],
            ["min_freq",      "number 0–1",    "Minimum allele frequency (requires population)"],
            ["max_freq",      "number 0–1",    "Maximum allele frequency (requires population)"],
            ["chrom",         "string",        "Chromosome filter. Comma-separate for multiple: chr1,chr2,chrX"],
            ["strand",        "string",        "Strand: + or -"],
            ["limit",         "integer 1–1000","Rows per page (default 50, max 1000)"],
            ["offset",        "integer",       "Rows to skip for pagination (default 0)"],
          ]}
        />
        <Example
          code={`# Example prompt: "How many Common ALU insertions are on chrX?"
{
  "me_type": "ALU",
  "variant_class": "Common",
  "chrom": "chrX",
  "limit": 1
}

# Claude reads "total" to answer the count question:
{ "total": 58, "limit": 1, "offset": 0, "results": [...] }`}
        />
      </McpTool>

      {/* get_insertion */}
      <McpTool
        name="get_insertion"
        desc="Get the full record for a single insertion by ID, including allele frequencies for all 33 populations (26 individual + 7 super-population aggregates)."
      >
        <ParamsTable
          rows={[
            ["id", "string (required)", "Insertion ID, e.g. A0000001. IDs in dbRIP v1 start with A."],
          ]}
        />
        <Example
          code={`# Example prompt: "Show all population frequencies for A0000001"
{ "id": "A0000001" }

# Response includes all 33 population allele frequencies:
{
  "id": "A0000001",
  "chrom": "chr1",
  "me_type": "ALU",
  "variant_class": "Very Rare",
  "populations": [
    { "population": "All", "af": 0.0002 },
    { "population": "EUR", "af": 0.0    },
    { "population": "AFR", "af": 0.0028 }
  ]
}`}
        />
      </McpTool>

      {/* get_stats */}
      <McpTool
        name="get_stats"
        desc="Aggregate counts grouped by a field (SQL GROUP BY). Fast on the full 44,984-row dataset. Useful for overview questions about database composition."
      >
        <ParamsTable
          rows={[
            ["by", "enum (default: me_type)", "Field to group by: me_type, me_subtype, me_category, chrom, variant_class, annotation, dataset_id"],
          ]}
        />
        <Example
          code={`# Example prompt: "What is the TE family breakdown in dbRIP?"
{ "by": "me_type" }

# Response:
{
  "group_by": "me_type",
  "entries": [
    { "label": "ALU",   "count": 33709 },
    { "label": "LINE1", "count": 6468  },
    { "label": "SVA",   "count": 4697  },
    { "label": "HERVK", "count": 101   }
  ]
}`}
        />
      </McpTool>

      {/* list_datasets */}
      <McpTool
        name="list_datasets"
        desc="List all datasets loaded in the database with version, assembly, row count, and load date. No inputs required. Good first call to verify the database is populated."
      >
        <Example
          code={`# Example prompt: "What datasets are loaded in dbRIP?"
{}  # no inputs

# Response:
[{
  "id": "dbrip_v1",
  "label": "dbRIP — Database of Retrotransposon Insertion Polymorphisms",
  "assembly": "hg38",
  "row_count": 44984,
  "loaded_at": "2024-03-11T12:00:00"
}]`}
        />
      </McpTool>

      {/* ── Example conversation ─────────────────────────────────────────── */}
      <div className="mb-6 mt-2">
        <p className="text-sm font-semibold mb-2">Example conversation</p>
        <Example
          code={`You:    How many Common ALU insertions are in dbRIP?
Claude: [calls list_insertions(me_type="ALU", variant_class="Common", limit=1)]
        There are 4,231 Common ALU insertions in dbRIP.

You:    Which ones are on chrX with allele freq > 10% in Africans?
Claude: [calls list_insertions(me_type="ALU", variant_class="Common",
                               chrom="chrX", population="AFR", min_freq=0.1)]
        Found 12 matching insertions. Here are the top results…

You:    Show me the full record for A0012345 including all pop frequencies.
Claude: [calls get_insertion(id="A0012345")]
        Here is the full record for A0012345…`}
        />
      </div>
    </div>
  );
}
