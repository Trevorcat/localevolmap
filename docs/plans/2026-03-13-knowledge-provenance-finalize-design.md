# Knowledge Provenance Finalize Design

## Goal

Make LocalEvomap task finalization distinguish clearly between "a gene was actually recorded as used" and "no knowledge usage was recorded", so the system stops overloading `selected_gene = "unknown"` for multiple meanings.

## Problem

The current finalize flow allows an agent or client to:

1. open a task
2. skip `record_usage`
3. call `finalize_task`

When that happens, the server can still create a success event, but it cannot tell whether:

- the task truly used no gene or capsule
- the client forgot to record usage
- the system could have inferred a capsule or gene from adjacent context

Today those cases collapse into `selected_gene = "unknown"`.

That creates three issues:

1. **semantic ambiguity** — `unknown` mixes missing provenance with genuine absence of knowledge use
2. **poor operability** — dashboards and event streams cannot tell whether a client is behaving correctly
3. **bad incentives** — clients can silently omit `record_usage` and still look similar to legitimate no-knowledge tasks

## Decision

Adopt an explicit provenance model:

1. `finalize_task` remains non-blocking when no usage was recorded
2. events and task finalization metadata explicitly classify provenance state
3. `selected_gene` becomes nullable for new data instead of using `"unknown"`
4. clients and skills still must call `record_usage` when a gene or capsule materially affects the work

This follows the chosen policy **B**: allow finalize, but explicitly mark missing knowledge provenance.

## Approaches Considered

### Option A — Reject finalize without usage

Pros:

- strongest data quality guarantee
- easiest analytics semantics

Cons:

- breaks legitimate tasks that used no LocalEvomap knowledge
- increases operational friction and failure cases for agents

### Option B — Allow finalize and label provenance state (recommended)

Pros:

- preserves agent usability
- makes missing provenance visible instead of ambiguous
- lets operators track client compliance over time

Cons:

- requires event/task schema expansion
- analytics/UI need minor adaptation

### Option C — Always infer a gene automatically

Pros:

- fewer empty-looking events in the UI

Cons:

- inference can misrepresent what the agent actually used
- hides client behavior problems instead of surfacing them

## High-Level Design

### Provenance states

Introduce an explicit `knowledge_status` concept for finalized task outcomes and events.

Recommended values:

- `recorded` — at least one `gene` usage record exists for the task
- `capsule_only` — no gene usage record exists, but a capsule usage record exists
- `no_knowledge_used` — no gene or capsule usage was recorded for the task
- `inferred_legacy` — compatibility-only state for historical data that still relies on legacy inference

### `selected_gene` semantics

For newly created events:

- set `selected_gene` to the explicit recorded gene id when `knowledge_status = recorded`
- set `selected_gene = null` when `knowledge_status = capsule_only`
- set `selected_gene = null` when `knowledge_status = no_knowledge_used`

Do not write the literal string `unknown` for new events.

### Task finalization behavior

`finalize_task` should continue to succeed even when the task has no recorded usage.

During finalization, the service derives provenance from `task.knowledgeRefs`:

1. if any `gene` usage exists, mark `recorded`
2. else if any `capsule` usage exists, mark `capsule_only`
3. else mark `no_knowledge_used`

The finalize response should also include a warning list so clients can surface weak provenance without failing the workflow.

Example warning:

- `Task finalized without recorded gene/capsule usage`

## Data Model Changes

### Event schema

Extend the event shape with:

- `selected_gene?: string | null`
- `knowledge_status?: 'recorded' | 'capsule_only' | 'no_knowledge_used' | 'inferred_legacy'`

Optionally add a structured provenance block if richer auditing is needed later:

```ts
provenance?: {
  recordedGeneId?: string | null;
  recordedCapsuleId?: string | null;
  warningCodes?: string[];
}
```

The first phase can keep this simpler by storing just `knowledge_status` plus nullable `selected_gene`.

### Task finalization metadata

Extend stored task finalization metadata with:

- `knowledgeStatus`
- `warnings`

This makes task detail APIs explain why an event has no selected gene.

## API Changes

### `POST /api/v1/tasks/:taskId/finalize`

Return additional fields:

- `knowledgeStatus`
- `warnings`

Example:

```json
{
  "eventId": "feedback_xxx",
  "taskId": "task_xxx",
  "capsuleId": null,
  "distillReady": false,
  "knowledgeStatus": "no_knowledge_used",
  "warnings": ["Task finalized without recorded gene/capsule usage"]
}
```

### `GET /api/v1/tasks/:taskId`

Expose the stored finalization warnings and provenance state.

### `GET /api/v1/events`

Return `selected_gene: null` plus `knowledge_status` for new data.

## Backward Compatibility

Historical events may still contain `selected_gene = "unknown"`.

Compatibility policy:

1. do not rewrite historical data during the first phase
2. normalize legacy values at read time where helpful
3. map legacy `"unknown"` to `knowledge_status = inferred_legacy` in analytics/UI if the event lacks explicit provenance metadata

This preserves current data while preventing new ambiguity.

## UI Changes

The events list and dashboard recent-activity surfaces should stop rendering `unknown` as if it were a meaningful gene id.

Recommended display rules:

- `recorded` → show the actual gene id
- `capsule_only` → show `Capsule used (gene unrecorded)`
- `no_knowledge_used` → show `No knowledge recorded`
- `inferred_legacy` → show `Legacy inferred / unknown`

Filtering and analytics should also be provenance-aware so operators can monitor client quality.

## Client and Skill Expectations

This design does not reduce the requirement to call `record_usage`.

Supported skills and client templates should explicitly state:

- call `record_usage` immediately after a gene or capsule materially shapes the solution
- do not record knowledge that was merely searched or viewed but not used
- treat finalize warnings as signals of low-quality provenance, not as hard failures

For auto-updating clients, the latest skill guidance should reinforce this workflow automatically.

## Failure Handling

### No usage recorded

- finalize succeeds
- event gets `knowledge_status = no_knowledge_used`
- response includes warning text

### Capsule recorded but no gene recorded

- finalize succeeds
- event gets `knowledge_status = capsule_only`
- `selected_gene = null`

### Legacy clients still writing `unknown`

- reads remain compatible
- analytics and UI classify them as `inferred_legacy`

## Testing Strategy

Cover at least these cases:

1. finalize with recorded gene writes `recorded` and real `selected_gene`
2. finalize with capsule-only usage writes `capsule_only` and `selected_gene = null`
3. finalize with no usage writes `no_knowledge_used` and warning output
4. legacy `unknown` events still render safely in the UI
5. task detail APIs expose provenance state and warnings
6. docs and client templates describe the updated contract

## Success Criteria

The design is successful when:

- new events never use `selected_gene = "unknown"`
- operators can tell whether missing gene data is expected or a client omission
- agents can still finalize tasks that used no knowledge
- client templates and skills consistently steer users toward `record_usage`
