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

Windows example:

```text
E:/projects/test_model/capability/dist/mcp/server.js
```

## Common stdio shape

Most MCP clients need the same information:

- command: `node`
- args: `E:/projects/test_model/capability/dist/mcp/server.js`
- optional env: `GENES_PATH`, `CAPSULES_PATH`, `EVENTS_PATH`, `TASKS_PATH`

Example with env:

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["E:/projects/test_model/capability/dist/mcp/server.js"],
  "env": {
    "GENES_PATH": "E:/projects/test_model/capability/data/genes",
    "CAPSULES_PATH": "E:/projects/test_model/capability/data/capsules",
    "EVENTS_PATH": "E:/projects/test_model/capability/data/events",
    "TASKS_PATH": "E:/projects/test_model/capability/data/tasks"
  }
}
```

## Cursor

Cursor uses an MCP config file named `mcp.json`.

### Project-scoped

Create `E:/projects/test_model/capability/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "local-evomap": {
      "type": "stdio",
      "command": "node",
      "args": ["E:/projects/test_model/capability/dist/mcp/server.js"]
    }
  }
}
```

Repository template: `E:/projects/test_model/capability/examples/.cursor/mcp.json`

### Global

Use the same JSON shape in the global Cursor MCP config location documented by Cursor.

## Claude Code

Claude Code supports both CLI registration and project-scoped `.mcp.json`.

### CLI registration

```bash
claude mcp add-json local-evomap '{"type":"stdio","command":"node","args":["E:/projects/test_model/capability/dist/mcp/server.js"]}'
```

### Project-scoped

Create `E:/projects/test_model/capability/.mcp.json`:

```json
{
  "mcpServers": {
    "local-evomap": {
      "type": "stdio",
      "command": "node",
      "args": ["E:/projects/test_model/capability/dist/mcp/server.js"]
    }
  }
}
```

Repository template: `E:/projects/test_model/capability/examples/.mcp.json`

## OpenAI Codex

Codex supports both CLI registration and `~/.codex/config.toml`.

### CLI registration

```bash
codex mcp add local-evomap -- node E:/projects/test_model/capability/dist/mcp/server.js
```

With env variables:

```bash
codex mcp add local-evomap --env TASKS_PATH=E:/projects/test_model/capability/data/tasks -- node E:/projects/test_model/capability/dist/mcp/server.js
```

### `~/.codex/config.toml`

```toml
[mcp_servers.local-evomap]
command = "node"
args = ["E:/projects/test_model/capability/dist/mcp/server.js"]
```

Optional env block:

```toml
[mcp_servers.local-evomap]
command = "node"
args = ["E:/projects/test_model/capability/dist/mcp/server.js"]

[mcp_servers.local-evomap.env]
TASKS_PATH = "E:/projects/test_model/capability/data/tasks"
```

Repository template: `E:/projects/test_model/capability/examples/codex.config.toml`

## Other MCP clients

If a client supports stdio MCP servers, map the same values into that client's config format:

- name: `local-evomap`
- transport: `stdio`
- command: `node`
- args: absolute path to `dist/mcp/server.js`

## Local skill to pair with MCP

After registering the MCP server, also load the local workflow instructions from:

```text
E:/projects/test_model/capability/agent-skill/SKILL.md
```

That skill tells the agent to:

- call `start_task`
- call `record_usage`
- decide for itself when the task is complete
- call `finalize_task` immediately before final delivery

## Quick verification checklist

After setup, verify the client can:

1. list `start_task`, `search_knowledge`, `record_usage`, `get_task_context`, `finalize_task`
2. read `evomap://workspace/<workspace>/playbook`
3. read `evomap://workspace/<workspace>/recent-successes`
4. finalize a completed task exactly once
