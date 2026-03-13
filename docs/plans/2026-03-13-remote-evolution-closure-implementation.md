# Remote Evolution Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make LocalEvomap MCP write authoritative task/evolution data to the deployed service and automatically execute distillation when the service becomes distill-ready.

**Architecture:** Add server-side task-session and distill-job HTTP APIs, then refactor MCP formal tools into a remote client that preserves existing response shapes. Keep bootstrap/versioning behavior unchanged, and make automatic distillation non-blocking and single-flight on the server.

**Tech Stack:** TypeScript, Node.js, existing `server.ts`, `LocalEvomap`, `TaskSessionStore`, Jest, existing MCP server and bootstrap code.

---

### Task 1: Add server task API tests

**Files:**
- Modify: `E:/projects/test_model/capability/core/agent-endpoints.test.ts`
- Modify: `E:/projects/test_model/capability/core/evolution-service.test.ts`
- Test: `E:/projects/test_model/capability/server.ts`

**Step 1: Write the failing test**

Add tests that assert the server exposes:

```ts
it('creates a task session over HTTP and returns MCP-compatible fields', async () => {
  const response = await invokeJsonRoute('POST', '/api/v1/tasks', {
    goal: 'ship remote evolution',
    workspace: 'capability',
    client: 'codex',
    initialSignals: ['remote-evolution']
  });

  expect(response.taskId).toMatch(/^task_/);
  expect(Array.isArray(response.recommendedGenes)).toBe(true);
  expect(Array.isArray(response.recommendedCapsules)).toBe(true);
});

it('finalizes a task over HTTP and persists an event', async () => {
  const started = await invokeJsonRoute('POST', '/api/v1/tasks', payload);
  const finalized = await invokeJsonRoute('POST', `/api/v1/tasks/${started.taskId}/finalize`, finalizePayload);
  const events = await invokeJsonRoute('GET', '/api/v1/events?limit=20');

  expect(finalized.eventId).toMatch(/^feedback_/);
  expect(events.events.some((event: any) => event.id === finalized.eventId)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest core/agent-endpoints.test.ts core/evolution-service.test.ts --runInBand --coverage=false`

Expected: FAIL because server task routes do not exist.

**Step 3: Write minimal implementation**

- Add task HTTP handlers to `server.ts`
- Reuse `EvolutionService` and `TaskSessionStore`
- Keep request/response shape aligned with current MCP tool contracts

**Step 4: Run test to verify it passes**

Run: `npx jest core/agent-endpoints.test.ts core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 2: Add persistent distill job store and server tests

**Files:**
- Create: `E:/projects/test_model/capability/storage/distill-job-store.ts`
- Create: `E:/projects/test_model/capability/storage/distill-job-store.test.ts`
- Modify: `E:/projects/test_model/capability/types/gene-capsule-schema.ts`
- Modify: `E:/projects/test_model/capability/server.ts`

**Step 1: Write the failing test**

Add tests that assert:

```ts
it('creates a single running distill job and persists its status', async () => {
  const store = new DistillJobStore(tmpDir);
  const created = await store.createPending({ sourceCapsuleIds: ['cap-1', 'cap-2'] });
  const running = await store.markRunning(created.jobId);
  expect(running.status).toBe('running');
});

it('deduplicates duplicate pending jobs for the same fingerprint', async () => {
  const first = await store.createPending({ sourceCapsuleIds: ['cap-1', 'cap-2'] });
  const second = await store.createPending({ sourceCapsuleIds: ['cap-1', 'cap-2'] });
  expect(second.jobId).toBe(first.jobId);
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest storage/distill-job-store.test.ts --runInBand --coverage=false`

Expected: FAIL because the store does not exist.

**Step 3: Write minimal implementation**

- Add a simple filesystem-backed distill job store
- Persist state transitions and source fingerprint
- Add server endpoints for listing/fetching jobs

**Step 4: Run test to verify it passes**

Run: `npx jest storage/distill-job-store.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 3: Add automatic distillation tests at service/server level

**Files:**
- Modify: `E:/projects/test_model/capability/core/evolution-service.test.ts`
- Modify: `E:/projects/test_model/capability/index.test.ts`
- Modify: `E:/projects/test_model/capability/server.ts`
- Modify: `E:/projects/test_model/capability/index.ts`

**Step 1: Write the failing test**

Add tests that assert:

```ts
it('schedules automatic distillation when finalize makes the system distill-ready', async () => {
  const finalized = await finalizeTaskThroughServer(...);
  expect(finalized.distillReady).toBe(true);
  expect(finalized.distillJobId).toMatch(/^distill_/);
});

it('does not fail finalize when automatic distillation fails', async () => {
  mockLlmFailure();
  const finalized = await finalizeTaskThroughServer(...);
  expect(finalized.eventId).toMatch(/^feedback_/);
  expect(finalized.distillStatus).toBe('failed');
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest core/evolution-service.test.ts index.test.ts --runInBand --coverage=false`

Expected: FAIL because finalize currently does not schedule or report distill jobs.

**Step 3: Write minimal implementation**

- Add server-side orchestration helper for `shouldDistill -> prepare -> synthesize -> complete`
- Use single-flight job locking via the new store
- Return distill metadata without making finalize fail on distill errors

**Step 4: Run test to verify it passes**

Run: `npx jest core/evolution-service.test.ts index.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 4: Refactor MCP formal tools to remote-first HTTP client

**Files:**
- Create: `E:/projects/test_model/capability/mcp/remote-evolution-client.ts`
- Create: `E:/projects/test_model/capability/mcp/remote-evolution-client.test.ts`
- Modify: `E:/projects/test_model/capability/mcp/server.ts`
- Modify: `E:/projects/test_model/capability/mcp/server.test.ts`

**Step 1: Write the failing test**

Add tests that assert:

```ts
it('start_task calls the remote server endpoint and preserves the existing response shape', async () => {
  const result = await server.callTool('start_task', payload);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/tasks'), expect.anything());
  expect(result).toEqual(expect.objectContaining({ taskId: expect.any(String), recommendedGenes: expect.any(Array) }));
});

it('finalize_task calls the remote finalize endpoint and returns server distill metadata', async () => {
  const result = await server.callTool('finalize_task', payload);
  expect(result).toEqual(expect.objectContaining({ eventId: expect.any(String), distillReady: expect.any(Boolean) }));
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest mcp/remote-evolution-client.test.ts mcp/server.test.ts --runInBand --coverage=false`

Expected: FAIL because MCP still uses local `EvolutionService` as the production data plane.

**Step 3: Write minimal implementation**

- Implement a small remote client wrapping task endpoints
- Keep `get_runtime_status` local
- Route formal tool handlers through the remote client when bootstrap status is `ready` or `update_available`
- Keep status-only behavior when the server is unreachable or blocked

**Step 4: Run test to verify it passes**

Run: `npx jest mcp/remote-evolution-client.test.ts mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 5: Add automatic distill observability and docs

**Files:**
- Modify: `E:/projects/test_model/capability/README.md`
- Modify: `E:/projects/test_model/capability/docs/API_REFERENCE.md`
- Modify: `E:/projects/test_model/capability/docs/MCP_CLIENT_CONFIG.md`
- Modify: `E:/projects/test_model/capability/docs/plans/2026-03-13-remote-evolution-closure-design.md`
- Test: `E:/projects/test_model/capability/docs/mcp-client-config.test.ts`
- Test: `E:/projects/test_model/capability/docs/mcp-example-files.test.ts`

**Step 1: Write the failing test**

Extend docs tests so they assert the docs mention:

- server-authoritative task/session flow
- automatic distillation after finalize
- distill job observability
- server-unreachable disables MCP formal tools

**Step 2: Run test to verify it fails**

Run: `npx jest docs/mcp-client-config.test.ts docs/mcp-example-files.test.ts --runInBand --coverage=false`

Expected: FAIL until the docs are updated.

**Step 3: Write minimal implementation**

- Update docs to explain the remote-first data plane
- Document task endpoints and distill job endpoints
- Document non-blocking failure behavior for distillation

**Step 4: Run test to verify it passes**

Run: `npx jest docs/mcp-client-config.test.ts docs/mcp-example-files.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 6: Run integrated verification

**Files:**
- Modify only if verification exposes a real bug

**Step 1: Run focused Jest suite**

Run:

```bash
npx jest storage/distill-job-store.test.ts core/evolution-service.test.ts core/agent-endpoints.test.ts mcp/remote-evolution-client.test.ts mcp/server.test.ts --runInBand --coverage=false
```

Expected: PASS.

**Step 2: Run broader regression suite**

Run:

```bash
npx jest index.test.ts core/capsule-gene-resolver.test.ts docs/mcp-client-config.test.ts docs/mcp-example-files.test.ts --runInBand --coverage=false
```

Expected: PASS.

**Step 3: Run build**

Run:

```bash
npm run build
```

Expected: exit 0 and `public folder copied to dist`.

**Step 4: Run full e2e against test server after deployment**

Run:

```bash
$env:BASE_URL='http://10.104.11.12:3001'; npm run test:e2e
```

Expected: PASS and server-side `/api/v1/events` increments after the flow.

**Step 5: Commit**

```bash
git add storage/distill-job-store.ts storage/distill-job-store.test.ts mcp/remote-evolution-client.ts mcp/remote-evolution-client.test.ts server.ts index.ts core/evolution-service.test.ts core/agent-endpoints.test.ts mcp/server.ts mcp/server.test.ts README.md docs/API_REFERENCE.md docs/MCP_CLIENT_CONFIG.md docs/mcp-client-config.test.ts docs/mcp-example-files.test.ts
git commit -m "feat: make evolution server-authoritative"
```
