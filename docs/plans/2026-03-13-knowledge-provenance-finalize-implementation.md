# Knowledge Provenance Finalize Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ambiguous `selected_gene = "unknown"` writes with explicit knowledge-provenance states, preserve non-blocking finalization, and surface provenance warnings across APIs, UI, and client guidance.

**Architecture:** Extend the task/event schemas with provenance metadata, derive provenance deterministically in `EvolutionService.finalizeTask()`, update event creation and UI rendering to use nullable `selected_gene` plus `knowledge_status`, and refresh client-facing docs so supported agents reliably call `record_usage` when they truly use knowledge.

**Tech Stack:** TypeScript, Node.js, Jest, HTTP server in `server.ts`, evolution core in `core/evolution-service.ts`, event logic in `index.ts`, browser UI in `public/index.html`, existing docs tests.

---

### Task 1: Add provenance fields to schemas

**Files:**
- Modify: `E:/projects/test_model/capability/types/gene-capsule-schema.ts`
- Modify: `E:/projects/test_model/capability/types/task-session-schema.ts`
- Test: `E:/projects/test_model/capability/core/evolution-service.test.ts`

**Step 1: Write the failing test**

Extend `E:/projects/test_model/capability/core/evolution-service.test.ts` with assertions that finalized task results and emitted events can carry:

```ts
expect(result.knowledgeStatus).toBe('no_knowledge_used');
expect(result.warnings).toContain('Task finalized without recorded gene/capsule usage');
expect(event.knowledge_status).toBe('no_knowledge_used');
expect(event.selected_gene).toBeNull();
```

**Step 2: Run test to verify it fails**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: FAIL because the schemas and result types do not yet include provenance metadata.

**Step 3: Write minimal implementation**

- Add `knowledge_status` to event types
- Add `knowledgeStatus` and `warnings` to task finalization/result types
- Keep the union small: `recorded | capsule_only | no_knowledge_used | inferred_legacy`

**Step 4: Run test to verify it passes**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 2: Derive provenance during task finalization

**Files:**
- Modify: `E:/projects/test_model/capability/core/evolution-service.ts`
- Test: `E:/projects/test_model/capability/core/evolution-service.test.ts`

**Step 1: Write the failing test**

Add tests for three finalize paths:

```ts
it('marks finalize as recorded when a gene usage ref exists', async () => {
  expect(result.knowledgeStatus).toBe('recorded');
});

it('marks finalize as capsule_only when only capsule usage exists', async () => {
  expect(result.knowledgeStatus).toBe('capsule_only');
});

it('marks finalize as no_knowledge_used when no usage refs exist', async () => {
  expect(result.knowledgeStatus).toBe('no_knowledge_used');
  expect(result.warnings).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: FAIL because `finalizeTask()` does not derive provenance yet.

**Step 3: Write minimal implementation**

- In `finalizeTask()`, inspect `task.knowledgeRefs`
- Choose `recorded`, `capsule_only`, or `no_knowledge_used`
- Pass warnings and `knowledgeStatus` into persisted task finalization metadata
- Preserve existing distill and event behavior otherwise

**Step 4: Run test to verify it passes**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 3: Stop writing new events with `selected_gene = "unknown"`

**Files:**
- Modify: `E:/projects/test_model/capability/index.ts`
- Test: `E:/projects/test_model/capability/index.test.ts`

**Step 1: Write the failing test**

Extend `E:/projects/test_model/capability/index.test.ts` with coverage for:

```ts
it('writes null selected_gene and no_knowledge_used for feedback without recorded knowledge', async () => {
  expect(events[0]?.selected_gene).toBeNull();
  expect(events[0]?.knowledge_status).toBe('no_knowledge_used');
});

it('writes capsule_only when only a capsule is supplied', async () => {
  expect(events[0]?.knowledge_status).toBe('capsule_only');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- index.test.ts --runInBand --coverage=false`

Expected: FAIL because event writing still defaults to `unknown`.

**Step 3: Write minimal implementation**

- Update feedback submission/event creation logic so new events use nullable `selected_gene`
- Derive `knowledge_status` from explicit `selected_gene` / `used_capsule`
- Keep legacy inference only for historical compatibility paths if still needed

**Step 4: Run test to verify it passes**

Run: `npm test -- index.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 4: Expose provenance through HTTP APIs

**Files:**
- Modify: `E:/projects/test_model/capability/server.ts`
- Test: `E:/projects/test_model/capability/core/evolution-service.test.ts`

**Step 1: Write the failing test**

Add or extend API-facing tests so finalize and task-context outputs include:

```ts
expect(response.knowledgeStatus).toBe('no_knowledge_used');
expect(response.warnings).toEqual(expect.arrayContaining([
  'Task finalized without recorded gene/capsule usage'
]));
```

**Step 2: Run test to verify it fails**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: FAIL because API result shapes do not include provenance fields.

**Step 3: Write minimal implementation**

- Return `knowledgeStatus` and `warnings` from `POST /api/v1/tasks/:taskId/finalize`
- Ensure `GET /api/v1/tasks/:taskId` exposes persisted provenance metadata
- Keep responses backward-compatible by only adding fields

**Step 4: Run test to verify it passes**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 5: Make the dashboard provenance-aware

**Files:**
- Modify: `E:/projects/test_model/capability/public/index.html`
- Test: `E:/projects/test_model/capability/e2e/dashboard.spec.ts`

**Step 1: Write the failing test**

Add an end-to-end assertion that the events list renders provenance labels instead of raw `unknown` for new events:

```ts
await expect(page.getByText('No knowledge recorded')).toBeVisible();
await expect(page.getByText('Capsule used (gene unrecorded)')).toBeVisible();
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "events provenance"`

Expected: FAIL because the UI still renders `unknown`.

**Step 3: Write minimal implementation**

- Add a small formatter for event provenance display
- Render actual gene ids only for `recorded`
- Render explicit fallback labels for `capsule_only`, `no_knowledge_used`, and legacy unknown data

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "events provenance"`

Expected: PASS.

### Task 6: Update client templates and docs

**Files:**
- Modify: `E:/projects/test_model/capability/README.md`
- Modify: `E:/projects/test_model/capability/docs/API_REFERENCE.md`
- Modify: `E:/projects/test_model/capability/docs/IDEAL_WORKFLOW.md`
- Modify: `E:/projects/test_model/capability/docs/MCP_CLIENT_CONFIG.md`
- Modify: `E:/projects/test_model/capability/agent-skill/SKILL.md`
- Modify: `E:/projects/test_model/capability/opencode/localevomap-skill/README.md`

**Step 1: Write the failing test**

Extend docs tests or add a focused docs assertion that the guidance mentions:

- `record_usage` is required when knowledge materially affects work
- finalize without usage is allowed but produces provenance warnings
- `selected_gene = "unknown"` is legacy behavior only

**Step 2: Run test to verify it fails**

Run: `npm test -- docs/mcp-client-config.test.ts --runInBand --coverage=false`

Expected: FAIL until docs are updated.

**Step 3: Write minimal implementation**

- Update operator docs and client setup docs
- Keep wording operational and consistent across Codex, Cursor, Claude Code, Kimi, and OpenCode guidance

**Step 4: Run test to verify it passes**

Run: `npm test -- docs/mcp-client-config.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 7: Run full verification

**Files:**
- Modify only if a failing test above requires a focused correction

**Step 1: Run focused unit tests**

Run: `npm test -- index.test.ts core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

**Step 2: Run focused UI verification**

Run: `npm run test:e2e -- --grep "events provenance|dashboard"`

Expected: PASS.

**Step 3: Run full regression suite**

Run: `npm test -- --runInBand --coverage=false`

Expected: PASS.

**Step 4: Run end-to-end suite**

Run: `npm run test:e2e`

Expected: PASS.

**Step 5: Re-check requirements manually**

Verify the implementation against `E:/projects/test_model/capability/docs/plans/2026-03-13-knowledge-provenance-finalize-design.md` and confirm:

- new events do not write `selected_gene = "unknown"`
- missing provenance is explicit and non-blocking
- UI renders provenance states clearly
- docs tell clients when to call `record_usage`
