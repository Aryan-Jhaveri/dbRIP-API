# dbRIP MCP Server

Model Context Protocol (MCP) server that lets LLMs like Claude query the dbRIP
database directly during a conversation — no copy-pasting, no terminal commands.

The server is a thin HTTP proxy. It translates tool calls into `GET` requests
against the FastAPI backend (`app/`) and returns results as text. It never
reads from or writes to the database directly.

---

## Hosted endpoint (temporary)

Currently running on Render's free tier. **This URL is temporary** — it will
change when the server moves to permanent hosting.

```
https://dbrip-1.onrender.com/mcp
```

Health check (confirms the server is awake):

```
https://dbrip-1.onrender.com/health  →  {"status":"ok"}
```

> **Cold starts:** Render's free tier spins down after 15 minutes of inactivity.
> The first tool call after a sleep may take ~30 seconds while the container wakes up.

### What permanent hosting would look like

When deployed under a real domain (e.g. the lab's own server or a paid cloud
service), the URL pattern would be:

```
https://dbrip.lianglab.ca/mcp          # example: served from lab domain
https://api.dbrip.org/mcp              # example: dedicated domain
```

The config snippets below would only need the URL replaced — everything else
stays the same.

---

## Setup by client

Replace `<MCP_URL>` with the current endpoint above in each snippet.

### Claude Desktop

Add to `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "https://dbrip-1.onrender.com/mcp"]
    }
  }
}
```

`mcp-remote` is a stdio→HTTP bridge. It runs as a local child process and
forwards Claude Desktop's stdio JSON-RPC messages to the HTTP server.
No local server needs to be running.

---

### Claude.ai (Custom Connector)

Claude.ai connects to HTTP MCP servers natively — no bridge required.

1. Go to **Settings → Connectors → Add connector**
2. Paste the URL:

```
https://dbrip-1.onrender.com/mcp
```

---

### Cursor

Add to `.cursor/mcp.json` (project-scoped) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "https://dbrip-1.onrender.com/mcp"]
    }
  }
}
```

---

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "dbrip": {
      "command": "npx",
      "args": ["mcp-remote", "https://dbrip-1.onrender.com/mcp"]
    }
  }
}
```

---

### VS Code (GitHub Copilot agent mode / Cline extension)

Add to `.vscode/mcp.json` (project) or user `settings.json` under `mcp.servers`:

```json
{
  "servers": {
    "dbrip": {
      "type": "stdio",
      "command": "npx",
      "args": ["mcp-remote", "https://dbrip-1.onrender.com/mcp"]
    }
  }
}
```

---

### Client compatibility summary

| Client | Transport | Setup method |
|--------|-----------|-------------|
| Claude Desktop | stdio (via mcp-remote) | `claude_desktop_config.json` |
| Claude.ai | HTTP (native) | Settings → Connectors, paste URL |
| Cursor | stdio (via mcp-remote) | `.cursor/mcp.json` |
| Windsurf | stdio (via mcp-remote) | `~/.codeium/windsurf/mcp_config.json` |
| VS Code + Copilot | stdio (via mcp-remote) | `.vscode/mcp.json` |
| VS Code + Cline | stdio (via mcp-remote) | Cline MCP settings panel |
| Zed | stdio (via mcp-remote) | `~/.config/zed/settings.json` |
| Continue.dev | stdio (via mcp-remote) | `.continue/config.json` |

All stdio-based clients use `mcp-remote` as a bridge. The URL is the only thing
that changes between clients — the rest of the config is identical.

---

## Running locally

Requires Node.js 18+ and the FastAPI backend running at `http://localhost:8000`.

```bash
cd mcp
npm install
npm start          # listens on port 3001 by default
```

Point any client at the local server by replacing the URL:

```
http://localhost:3001/mcp
```

Example for Claude Desktop local dev:

```json
{
  "mcpServers": {
    "dbrip-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3001/mcp"]
    }
  }
}
```

### Environment variables

| Variable        | Default                    | Description |
|-----------------|----------------------------|-------------|
| `DBRIP_API_URL` | `http://localhost:8000/v1` | FastAPI backend URL (include `/v1`) |
| `MCP_PORT`      | `3001`                     | Port the MCP server listens on |

---

## Tools

| Tool | Maps to | Description |
|------|---------|-------------|
| `search_by_region` | `GET /v1/insertions/region/{assembly}/{chrom}:{start}-{end}` | Find insertions in a genomic window |
| `list_insertions`  | `GET /v1/insertions` | Database-wide filter/search |
| `get_insertion`    | `GET /v1/insertions/{id}` | Full record + all 33 population frequencies |
| `get_stats`        | `GET /v1/stats` | Aggregate counts grouped by a field |
| `list_datasets`    | `GET /v1/datasets` | Loaded dataset metadata |

---

## Project structure

```
mcp/
├── server.ts          ← Express HTTP server, /mcp endpoint, stateless design
├── tools/
│   ├── insertions.ts  ← search_by_region, list_insertions, get_insertion
│   ├── stats.ts       ← get_stats
│   └── datasets.ts    ← list_datasets
├── package.json
└── tsconfig.json
```

`server.ts` creates a new `McpServer` per request (stateless — no sessions).
Each tool file exports a `register*()` function. Adding a tool = new file +
one `register*()` call in `server.ts`.

---

## Transport

Uses `StreamableHTTPServerTransport` (MCP spec 2025-03-26).
`GET /mcp` → 405 (SSE not supported, stateless design).
`DELETE /mcp` → 200 (no session to terminate).
