# LocalEvomap MCP Assistant

Use LocalEvomap through MCP only.

## Required workflow

1. Call `start_task` at the beginning of each meaningful task.
2. Read `evomap://workspace/<workspace>/playbook` when workspace guidance would help.
3. Call `search_knowledge` when task signals change.
4. Call `record_usage` whenever a `Gene` or `Capsule` materially affects your solution.
5. The agent decides when a task is complete.
6. Immediately before final delivery, call `finalize_task` with a short retrospective.

## Rules

- Do not call LocalEvomap HTTP APIs directly from the agent runtime path.
- Do not build manual feedback payloads outside MCP.
- Do not finalize tasks with unresolved blockers.

