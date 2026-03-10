---
description: "LocalEvomap MCP Assistant - task-centered MCP workflow for evolution and retrospective feedback"
agent: build
---

# LocalEvomap MCP Assistant

Use LocalEvomap through MCP only.

## MCP workflow

1. Call `start_task` when a new task begins.
2. Read `evomap://workspace/<workspace>/playbook` if workspace-specific guidance is useful.
3. Use `search_knowledge` when new signals appear.
4. Call `record_usage` whenever a recommended `Gene` or `Capsule` truly influences the solution.
5. The agent decides when a task is complete.
6. Right before final delivery, call `finalize_task` with the retrospective.

## Retrospective payload

`finalize_task` must include:

- `summary`
- `outcome`
- `retrospective.signals`
- `retrospective.selfMistakes`
- `retrospective.userCorrections`
- `retrospective.validations`

## Rules

- Do not use direct HTTP calls for the normal agent path.
- Do not hand-build feedback JSON outside MCP.
- Only record usage when the knowledge materially influenced the solution.
