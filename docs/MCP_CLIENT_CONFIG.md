# MCP Client Configuration Examples

> Verified against official client documentation and local CLI help on **March 10, 2026**. MCP config formats can change over time.

## Prerequisite

Build LocalEvomap first:

```bash
npm install
npm run build
```

The stdio MCP entrypoint is:

```bash
node dist/mcp/server.js
```

For client configs, prefer an **absolute path** to `dist/mcp/server.js`.

Template example:

```text
C:/path/to/your/repo/dist/mcp/server.js
```

## Common stdio shape

Most MCP clients need the same information:

- command: `node`
- args: `C:/path/to/your/repo/dist/mcp/server.js`
- optional env: `GENES_PATH`, `CAPSULES_PATH`, `EVENTS_PATH`, `TASKS_PATH`
- bootstrap env: `LOCAL_EVOMAP_CLIENT`, `LOCAL_EVOMAP_SERVER_URL`, `LOCAL_EVOMAP_SKILL_PATH`

Example with env:

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["C:/path/to/your/repo/dist/mcp/server.js"],
    "env": {
      "LOCAL_EVOMAP_CLIENT": "codex",
      "LOCAL_EVOMAP_SERVER_URL": "http://your-server.example.com:3000",
      "LOCAL_EVOMAP_SKILL_PATH": "C:/Users/your-user/.codex/AGENTS.md",
      "GENES_PATH": "C:/path/to/your/repo/data/genes",
    "CAPSULES_PATH": "C:/path/to/your/repo/data/capsules",
    "EVENTS_PATH": "C:/path/to/your/repo/data/events",
    "TASKS_PATH": "C:/path/to/your/repo/data/tasks"
  }
}
```

Before using any checked-in template, replace:

- `C:/path/to/your/repo` with your real absolute repo path
- `YOUR_API_KEY` with your real API key for HTTP-based helpers
- `your-server.example.com` with your actual host name or IP

## Bootstrap behavior

At startup, the MCP runtime now checks:

- `GET /api/v1/agent-manifest`
- `POST /api/v1/agent/check`

The always-available diagnostic tool is `get_runtime_status`.

- If bootstrap status is `ready` or `update_available`, formal tools/resources are available
- If bootstrap status is `blocked`, `unreachable`, `booting`, `updating`, or `update_failed`, only `get_runtime_status` remains available
- server unreachable disables formal tools

Supported automatic skill updates:

- `codex`
- `claude-code`
- `cursor`

Unsupported automatic skill updates in the current release:

- `opencode`
- `kimi`

## Cursor

Cursor uses an MCP config file named `mcp.json`.

### Project-scoped

Copy `examples/.cursor/mcp.json` to your project or global Cursor config and replace the placeholders.

```json
{
  "mcpServers": {
    "local-evomap": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/your/repo/dist/mcp/server.js"]
    }
  }
}
```

Repository template: `examples/.cursor/mcp.json`

Recommended local skill path for automatic skill updates:

```text
~/.cursor/rules/localevomap.mdc
```

### Global

Use the same JSON shape in the global Cursor MCP config location documented by Cursor.

## Claude Code

Claude Code supports both CLI registration and project-scoped `.mcp.json`.

### CLI registration

```bash
claude mcp add-json local-evomap '{"type":"stdio","command":"node","args":["C:/path/to/your/repo/dist/mcp/server.js"]}'
```

### Project-scoped

Copy `examples/.mcp.json` into your project root as `.mcp.json` and replace the placeholders.

```json
{
  "mcpServers": {
    "local-evomap": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/your/repo/dist/mcp/server.js"]
    }
  }
}
```

Repository template: `examples/.mcp.json`

Recommended local skill path for automatic skill updates:

```text
~/.claude/CLAUDE.md
```

## OpenAI Codex

Codex supports both CLI registration and `~/.codex/config.toml`.

### CLI registration

```bash
codex mcp add local-evomap -- node C:/path/to/your/repo/dist/mcp/server.js
```

With env variables:

```bash
codex mcp add local-evomap --env TASKS_PATH=C:/path/to/your/repo/data/tasks -- node C:/path/to/your/repo/dist/mcp/server.js
```

### `~/.codex/config.toml`

```toml
[mcp_servers.local-evomap]
command = "node"
args = ["C:/path/to/your/repo/dist/mcp/server.js"]
```

Optional env block:

```toml
[mcp_servers.local-evomap]
command = "node"
args = ["C:/path/to/your/repo/dist/mcp/server.js"]

[mcp_servers.local-evomap.env]
TASKS_PATH = "C:/path/to/your/repo/data/tasks"
```

Repository template: `examples/codex.config.toml`

Recommended local skill path for automatic skill updates:

```text
~/.codex/AGENTS.md
```

## Kimi

Kimi in this repository uses an HTTP helper config instead of an MCP stdio config.

Copy and edit:

```text
examples/kimi.localevomap.json
```

Then save your local working copy to:

```text
.kimi/localevolmap.json
```

The repository tracks the `examples/` template and ignores `.kimi/` local state. Replace these placeholders before use:

- `your-server.example.com`
- `YOUR_API_KEY`

Use Kimi against the LocalEvomap HTTP API when you want hosted access to `genes`, `capsules`, and retrospective helper flows.

Kimi currently does not support automatic skill updates through the LocalEvomap MCP bootstrap flow.

## OpenCode

OpenCode currently uses repository templates for HTTP helper integration and remote deployment metadata.

Copy and edit:

```text
opencode/localevomap.remote.example.json
```

The repository also keeps a reusable template at:

```text
opencode/localevomap.remote.json
```

These templates include:

- remote server base URL
- SSH deployment metadata
- Playwright base URL
- `/api/v1` prefix and `YOUR_API_KEY`

OpenCode templates are HTTP-oriented today. If you later add MCP support to your OpenCode runtime, reuse the same `stdio` shape shown above for Cursor, Claude Code, and Codex.

OpenCode currently does not support automatic skill updates through the LocalEvomap MCP bootstrap flow.

## Other MCP clients

If a client supports stdio MCP servers, map the same values into that client's config format:

- name: `local-evomap`
- transport: `stdio`
- command: `node`
- args: absolute path to `dist/mcp/server.js`

## Local skill to pair with MCP

After registering the MCP server, also load the local workflow instructions from:

```text
agent-skill/SKILL.md
```

That skill tells the agent to:

- call `start_task`
- call `record_usage`
- decide for itself when the task is complete
- call `finalize_task` immediately before final delivery

## Quick verification checklist

After setup, verify the client can:

1. list `start_task`, `search_knowledge`, `record_usage`, `get_task_context`, `finalize_task`
2. list `get_runtime_status`
3. read `evomap://workspace/<workspace>/playbook`
4. read `evomap://workspace/<workspace>/recent-successes`
5. finalize a completed task exactly once
