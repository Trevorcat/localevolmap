# Agent MCP Evolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace direct agent-to-HTTP evolution integration with an MCP-first task-session architecture where the agent skill controls completion and LocalEvomap core controls durable knowledge updates.

**Architecture:** Add a task-session store and domain service in the core, expose agent-facing functionality through MCP tools/resources, move agent instructions to an MCP-oriented skill, and remove legacy HTTP helper paths from the normal runtime. Administrative HTTP remains only for dashboard and ops flows.

**Tech Stack:** TypeScript, Node.js, Jest, Zod, Model Context Protocol SDK, existing Gene/Capsule/Event persistence.

**Note:** This plan intentionally omits git commit steps because the current workspace policy for this session does not allow automatic commits.

---

### Task 1: Add task-session domain contracts

**Files:**
- Create: `E:/projects/test_model/capability/types/task-session-schema.ts`
- Create: `E:/projects/test_model/capability/storage/task-session-store.test.ts`
- Create: `E:/projects/test_model/capability/storage/task-session-store.ts`
- Modify: `E:/projects/test_model/capability/index.ts`

**Step 1: Write the failing test**

Add `E:/projects/test_model/capability/storage/task-session-store.test.ts` with tests for:

```ts
it('creates an active task session', async () => {
  const store = new TaskSessionStore(tmpDir);
  const task = await store.create({ goal: 'wire MCP', workspace: 'capability', client: 'codex', signals: ['mcp'] });
  expect(task.status).toBe('active');
  expect(task.knowledgeRefs).toEqual([]);
});

it('deduplicates repeated knowledge usage', async () => {
  const updated = await store.recordUsage(task.taskId, { kind: 'gene', id: 'gene_feature_add', phase: 'implement' });
  const again = await store.recordUsage(task.taskId, { kind: 'gene', id: 'gene_feature_add', phase: 'implement' });
  expect(again.knowledgeRefs).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- storage/task-session-store.test.ts --runInBand --coverage=false`

Expected: FAIL because `TaskSessionStore` and the new task-session types do not exist.

**Step 3: Write minimal implementation**

Implement `types/task-session-schema.ts` with:

```ts
export interface TaskSession {
  taskId: string;
  goal: string;
  workspace: string;
  client: string;
  status: 'active' | 'finalized';
  openedAt: string;
  finalizedAt?: string;
  signals: string[];
  knowledgeRefs: KnowledgeUsageRef[];
  retrospective?: TaskRetrospective;
  outcome?: TaskOutcome;
}
```

Implement `storage/task-session-store.ts` using the same JSON/JSONL persistence style as `E:/projects/test_model/capability/storage/gene-store.ts` and `E:/projects/test_model/capability/storage/capsule-store.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- storage/task-session-store.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 2: Extract an evolution service from task finalization

**Files:**
- Create: `E:/projects/test_model/capability/core/evolution-service.test.ts`
- Create: `E:/projects/test_model/capability/core/evolution-service.ts`
- Modify: `E:/projects/test_model/capability/index.ts`
- Modify: `E:/projects/test_model/capability/core/capsule-manager.ts`

**Step 1: Write the failing test**

Add `E:/projects/test_model/capability/core/evolution-service.test.ts` with tests for:

```ts
it('finalizes a task and updates referenced gene and capsule', async () => {
  const result = await service.finalizeTask({
    taskId,
    summary: 'MCP flow replaced HTTP helper path',
    outcome: { status: 'success', score: 0.93 },
    retrospective: {
      signals: ['mcp', 'task-complete'],
      selfMistakes: ['Initially left HTTP helper in the flow'],
      userCorrections: ['User asked to remove compatibility'],
      validations: [{ command: 'npm run build', passed: true }]
    },
    createCapsule: true
  });

  expect(result.eventId).toBeTruthy();
  expect(result.genesUpdated).toContain('gene_feature_add');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: FAIL because `EvolutionService` does not exist.

**Step 3: Write minimal implementation**

Implement `EvolutionService` with methods:

```ts
startTask(input)
searchKnowledge(input)
recordUsage(input)
getTaskContext(taskId)
finalizeTask(input)
```

Move the reusable feedback/update logic out of `E:/projects/test_model/capability/index.ts` into this service so both MCP tools and any admin surfaces reuse one code path.

**Step 4: Run test to verify it passes**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 3: Add the MCP server and tool handlers

**Files:**
- Create: `E:/projects/test_model/capability/mcp/server.test.ts`
- Create: `E:/projects/test_model/capability/mcp/server.ts`
- Create: `E:/projects/test_model/capability/mcp/tools/start-task.ts`
- Create: `E:/projects/test_model/capability/mcp/tools/search-knowledge.ts`
- Create: `E:/projects/test_model/capability/mcp/tools/record-usage.ts`
- Create: `E:/projects/test_model/capability/mcp/tools/get-task-context.ts`
- Create: `E:/projects/test_model/capability/mcp/tools/finalize-task.ts`
- Modify: `E:/projects/test_model/capability/package.json`

**Step 1: Write the failing test**

Add `E:/projects/test_model/capability/mcp/server.test.ts` with contract tests for:

```ts
it('registers all required MCP tools', async () => {
  const server = createMcpServer({ evolutionService });
  const tools = await server.listTools();
  expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
    'start_task',
    'search_knowledge',
    'record_usage',
    'get_task_context',
    'finalize_task'
  ]));
});

it('makes finalize_task idempotent per taskId', async () => {
  const first = await callTool(server, 'finalize_task', payload);
  const second = await callTool(server, 'finalize_task', payload);
  expect(second.eventId).toBe(first.eventId);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: FAIL because the MCP server and tool registrations do not exist.

**Step 3: Write minimal implementation**

Add the MCP SDK dependency to `E:/projects/test_model/capability/package.json`, create `mcp/server.ts`, wire each tool handler to `EvolutionService`, and validate arguments with Zod.

**Step 4: Run test to verify it passes**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 4: Add MCP resources for next-agent warm starts

**Files:**
- Create: `E:/projects/test_model/capability/mcp/resources/workspace-playbook.ts`
- Create: `E:/projects/test_model/capability/mcp/resources/recent-successes.ts`
- Modify: `E:/projects/test_model/capability/mcp/server.ts`
- Modify: `E:/projects/test_model/capability/core/evolution-service.ts`
- Modify: `E:/projects/test_model/capability/mcp/server.test.ts`

**Step 1: Write the failing test**

Extend `E:/projects/test_model/capability/mcp/server.test.ts` with assertions for:

```ts
it('returns a workspace playbook resource', async () => {
  const resource = await readResource(server, 'evomap://workspace/test/playbook');
  expect(resource.contents[0].text).toContain('recommendedGenes');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: FAIL because the resources are not registered.

**Step 3: Write minimal implementation**

Implement resource resolvers that ask `EvolutionService` for workspace-level summaries using finalized task sessions and successful capsules.

**Step 4: Run test to verify it passes**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 5: Replace the agent skill with an MCP-oriented workflow

**Files:**
- Create: `E:/projects/test_model/capability/agent-skill/SKILL.md`
- Modify: `E:/projects/test_model/capability/docs/SKILL_INSTALL.md`
- Modify: `E:/projects/test_model/capability/README.md`
- Delete: `E:/projects/test_model/capability/opencode/localevomap-skill/index.ts`
- Delete: `E:/projects/test_model/capability/opencode/localevomap-skill/index.test.ts`
- Delete: `E:/projects/test_model/capability/localevolmap-skill.mjs`
- Delete: `E:/projects/test_model/capability/localevolmap-skill-cli.ts`
- Delete: `E:/projects/test_model/capability/localevolmap-skill-cli.test.ts`

**Step 1: Write the failing test**

Add or update a documentation-oriented assertion in `E:/projects/test_model/capability/mcp/server.test.ts` or a new `E:/projects/test_model/capability/agent-skill/skill.test.ts` that checks the skill instructions mention `start_task`, `record_usage`, and `finalize_task`.

**Step 2: Run test to verify it fails**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: FAIL because the new skill file and MCP-oriented instructions do not exist.

**Step 3: Write minimal implementation**

Create `E:/projects/test_model/capability/agent-skill/SKILL.md` with this workflow:

```md
1. Start each user task with `start_task`.
2. Record adopted genes/capsules with `record_usage`.
3. Before final delivery, decide whether the task is complete.
4. If complete, generate a short retrospective and call `finalize_task`.
5. Read workspace resources at task start when useful.
```

Delete the legacy HTTP helper and CLI entrypoints from the normal runtime.

**Step 4: Run test to verify it passes**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 6: Reduce `server.ts` to admin/dashboard responsibilities

**Files:**
- Modify: `E:/projects/test_model/capability/server.ts`
- Modify: `E:/projects/test_model/capability/docs/API_REFERENCE.md`
- Modify: `E:/projects/test_model/capability/README.md`

**Step 1: Write the failing test**

Add assertions that the public docs and any server-level tests no longer position REST endpoints as the primary agent integration path.

**Step 2: Run test to verify it fails**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: FAIL because docs and server ownership still describe HTTP as the agent path.

**Step 3: Write minimal implementation**

Update `E:/projects/test_model/capability/server.ts` and the docs so HTTP is described as admin/dashboard transport only, while MCP is described as the standard agent path.

**Step 4: Run test to verify it passes**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 7: Verify the full redesign

**Files:**
- Test only

**Step 1: Run focused task-session tests**

Run: `npm test -- storage/task-session-store.test.ts --runInBand --coverage=false`

Expected: PASS.

**Step 2: Run focused domain-service tests**

Run: `npm test -- core/evolution-service.test.ts --runInBand --coverage=false`

Expected: PASS.

**Step 3: Run focused MCP tests**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

**Step 4: Run the full Jest suite**

Run: `npm test -- --runInBand --coverage=false`

Expected: PASS.

**Step 5: Build the project**

Run: `npm run build`

Expected: PASS with the MCP server compiled into `dist/`.

## Execution Notes

- Keep the first implementation pass narrow: make the MCP server call a single `EvolutionService` instead of duplicating logic inside tool files.
- Reuse existing normalization and scoring logic where it already exists; move code before rewriting it.
- Prefer deleting obsolete agent helper code rather than preserving compatibility switches.
- Do not claim the redesign is complete until the MCP contract tests, full Jest suite, and `npm run build` all pass.
