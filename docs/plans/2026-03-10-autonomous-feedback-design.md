# Autonomous Feedback Evolution Design

## Goal

Enable an agent to autonomously perform a task-end retrospective, report what knowledge was used and what mistakes were corrected, and feed that outcome back into LocalEvomap so the next agent benefits.

## Problem

Today LocalEvomap can search `Gene` and `Capsule` knowledge and can record new knowledge after a fix, but it does not have a dedicated task-end feedback path. Effective reuse feedback is only captured when a caller goes through `/api/v1/evolve`, which means simple retrieval-driven tasks do not strengthen the reused `Gene` or `Capsule`.

## Recommended Approach

Add a dedicated `POST /api/v1/feedback` API and task-end retrospective payload.

The agent keeps the current search-first workflow, but before final delivery it performs a structured retrospective and sends:

- which `Gene` was selected or followed
- which `Capsule` was reused, if any
- what mistakes the agent made
- what corrections came from the user
- whether the task outcome succeeded
- a summary worth preserving for future agents

The server translates this into the existing evolution primitives:

- append an `EvolutionEvent`
- update `Capsule` confidence/score when a reused capsule proved helpful or harmful
- apply `Gene` epigenetic marks based on outcome
- create a new capsule when the retrospective yields reusable knowledge
- optionally expose whether distillation is now eligible

## Why This Approach

### Option A — Dedicated feedback API

Pros:
- matches the semantics of retrospective learning
- works even when no repair execution went through `/api/v1/evolve`
- preserves attribution to reused `Gene` and `Capsule`
- keeps distillation and event logging on the server side

Cons:
- adds one new schema and endpoint

### Option B — Reuse `/api/v1/evolve`

Pros:
- smaller server surface area

Cons:
- overloads `evolve` with retrospective semantics
- forces callers to fake logs for a non-repair workflow
- weak attribution for user corrections and self mistakes

### Option C — Skill-only capsule/gene writes

Pros:
- fastest to ship

Cons:
- no reliable usage feedback for reused knowledge
- no event-level audit trail
- no unified scoring and epigenetic feedback

## Scope

### In scope

- new retrospective feedback request/response types
- `LocalEvomap.submitFeedback()` orchestration
- `POST /api/v1/feedback`
- event creation for feedback submissions
- gene/capsule feedback updates
- optional capsule creation from reusable retrospective summaries
- skill template updates so agents call feedback at task end
- tests for API and feedback behavior

### Out of scope

- background scheduler / cron-based autonomous evolution
- self-modifying prompts/rules/skills
- external hub synchronization changes

## Data Flow

1. Agent completes a task and decides it is ready to deliver.
2. Agent builds a retrospective payload.
3. Agent calls `POST /api/v1/feedback`.
4. Server validates payload and loads current stores.
5. Server appends an `EvolutionEvent` with `selected_gene`, `used_capsule`, signals, and outcome.
6. Server updates reused capsule confidence and reused gene epigenetic marks.
7. Server optionally creates a new capsule from the retrospective summary.
8. Server returns identifiers and whether distillation is currently ready.

## API Shape

### Request

- `signals: string[]`
- `selected_gene?: string | null`
- `used_capsule?: string | null`
- `outcome: { status: 'success' | 'failed' | 'partial' | 'skipped', score: number }`
- `summary: string`
- `self_mistakes?: string[]`
- `user_corrections?: string[]`
- `validation?: { passed?: boolean, commands_run?: number, errors?: string[] }`
- `create_capsule?: boolean`

### Response

- `event_id`
- `capsule_id?: string`
- `gene_updated: boolean`
- `capsule_updated: boolean`
- `distill_ready: boolean`

## Persistence Rules

- If `selected_gene` exists and is found, apply epigenetic marks using the outcome.
- If `used_capsule` exists and is found, update capsule confidence and weighted score using existing logic.
- If `create_capsule !== false` and `summary` is non-empty, create a new capsule for successful or partial outcomes.
- Store retrospective details inside `event.metadata.feedback` for auditability.

## Risk Controls

- require API key like other write APIs
- never mutate knowledge on malformed or empty payloads
- cap retrospective arrays to reasonable lengths during normalization
- do not create duplicate capsules when the same summary/signals/session already exist

## Testing Strategy

- unit tests for `submitFeedback()` behavior
- server/API tests for `POST /api/v1/feedback`
- assertions for event append, gene update, capsule update, optional capsule creation, and `distill_ready`

