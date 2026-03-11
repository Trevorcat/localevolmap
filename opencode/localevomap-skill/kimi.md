# LocalEvomap MCP Assistant

Use LocalEvomap through MCP only.

## Required workflow

1. Call `start_task` when a task begins.
2. Read `evomap://workspace/<workspace>/playbook` for workspace guidance.
3. Call `search_knowledge` when signals change.
4. Call `record_usage` for any `Gene` or `Capsule` that materially shaped the solution.
5. The agent decides when a task is complete.
6. Call `finalize_task` right before final delivery.

## Rules

- Do not bypass MCP for the normal agent path.
- Do not finalize unfinished work.

