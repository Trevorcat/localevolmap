# LocalEvomap MCP Skill

Use LocalEvomap through MCP only.

## Core Rules

0. If `get_runtime_status` is available and reports anything other than `ready` or `update_available`, do not assume formal LocalEvomap tools are usable.
1. Start every meaningful task with `start_task`.
2. Read `evomap://workspace/<workspace>/playbook` when workspace-specific guidance would help.
3. Whenever you actually adopt a `Gene` or `Capsule`, call `record_usage`.
4. Before final delivery, decide whether the task is complete.
5. If the task is complete, build a short retrospective and call `finalize_task`.

The agent decides when a task is complete. Do not ask MCP to infer completion from partial work.

## Bootstrap Rule

- `get_runtime_status` is the bootstrap health probe
- if the status is `unreachable`, `blocked`, `booting`, `updating`, or `update_failed`, treat LocalEvomap formal tools as unavailable
- supported clients may receive automatic skill updates before the server reports `ready`

## Completion Criteria

Treat a task as complete only when all of the following are true:

- the active plan items are complete
- a concrete deliverable or conclusion exists
- no blocker remains
- validation is complete, or the user has explicitly accepted an unvalidated result

## MCP Workflow

### 1. Start the task

Call `start_task` with:

- `goal`
- `workspace`
- `client`
- `initialSignals`

Use the returned `taskId` for all later MCP calls.

### 2. Search and adopt knowledge

- Use the recommendations returned from `start_task`
- Call `search_knowledge` if the task changes direction or new signals appear

### 3. Record actual usage

Whenever you truly use a recommendation, call `record_usage` with:

- `taskId`
- `knowledge[]`
- each item containing `kind`, `id`, `phase`, and optional `note`

Only record knowledge that materially influenced the solution.

### 4. Finalize the task

If the agent decides the task is complete, call `finalize_task` with:

- `taskId`
- `summary`
- `outcome`
- `retrospective.signals`
- `retrospective.selfMistakes`
- `retrospective.userCorrections`
- `retrospective.validations`
- `createCapsule`

Use `finalize_task` immediately before the final user-facing delivery.

## Anti-Patterns

- Do not call LocalEvomap HTTP APIs directly from the agent path.
- Do not build ad hoc feedback payloads outside MCP.
- Do not record knowledge usage if you only glanced at a recommendation.
- Do not finalize a task that still has unresolved blockers.
