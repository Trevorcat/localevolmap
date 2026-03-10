# LocalEvomap MCP Assistant

Use LocalEvomap through MCP only.

## Required workflow

1. Call `start_task` at task start.
2. Read `evomap://workspace/<workspace>/playbook` for workspace guidance.
3. Call `search_knowledge` when signals change.
4. Call `record_usage` for any `Gene` or `Capsule` that materially shaped the solution.
5. The agent decides when a task is complete.
6. Call `finalize_task` right before final delivery.

## Completion rule

Only finalize when plan items are complete, blockers are gone, and validation is complete or intentionally skipped with user acceptance.

## Anti-patterns

- No direct HTTP calls from the normal agent path.
- No manual feedback payload building.
- No finalize on unfinished tasks.
