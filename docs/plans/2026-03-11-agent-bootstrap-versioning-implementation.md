# Agent Bootstrap Versioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add server-authoritative manifest/check endpoints and an MCP bootstrap gate that verifies local runtime and skill versions, auto-updates supported client skills, and disables formal LocalEvomap tools when the server is unreachable or compatibility is blocked.

**Architecture:** Introduce a checked-in manifest source and server-side comparison logic, then extend the MCP server with a bootstrap state machine that conditionally registers tools based on manifest/check results. Add a client-specific skill updater for supported clients and a universal status tool for diagnostics.

**Tech Stack:** TypeScript, Node.js, Jest, existing HTTP server in `server.ts`, existing MCP server in `mcp/server.ts`, filesystem reads/writes, hashing via Node crypto.

---

### Task 1: Add bootstrap types and manifest loader

**Files:**
- Create: `E:/projects/test_model/capability/types/agent-bootstrap-schema.ts`
- Create: `E:/projects/test_model/capability/core/agent-manifest.ts`
- Create: `E:/projects/test_model/capability/config/agent-manifest.json`
- Test: `E:/projects/test_model/capability/core/agent-manifest.test.ts`

**Step 1: Write the failing test**

Add `E:/projects/test_model/capability/core/agent-manifest.test.ts` with tests that:

```ts
it('loads the checked-in manifest and computes hashes for tracked files', async () => {
  const manifest = await loadAgentManifest();
  expect(manifest.manifest_version).toBeTruthy();
  expect(manifest.skills.codex.hash).toMatch(/^sha256-/);
});

it('marks supported auto-update clients correctly', async () => {
  const manifest = await loadAgentManifest();
  expect(manifest.skills.codex.auto_update_supported).toBe(true);
  expect(manifest.skills.kimi.auto_update_supported).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- core/agent-manifest.test.ts --runInBand --coverage=false`

Expected: FAIL because the bootstrap schema, loader, and manifest file do not exist.

**Step 3: Write minimal implementation**

- Define exact request/response/runtime-state types in `types/agent-bootstrap-schema.ts`
- Add `config/agent-manifest.json` with tracked entries for `mcp.runtime` and all client skills
- Implement `loadAgentManifest()` in `core/agent-manifest.ts`
- Use Node `crypto.createHash('sha256')` to compute file hashes from manifest-tracked files

**Step 4: Run test to verify it passes**

Run: `npm test -- core/agent-manifest.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 2: Add server-side manifest and compatibility endpoints

**Files:**
- Modify: `E:/projects/test_model/capability/server.ts`
- Test: `E:/projects/test_model/capability/core/agent-check.test.ts`
- Modify: `E:/projects/test_model/capability/docs/API_REFERENCE.md`
- Modify: `E:/projects/test_model/capability/README.md`

**Step 1: Write the failing test**

Add `E:/projects/test_model/capability/core/agent-check.test.ts` covering:

```ts
it('returns ready when local versions and hashes match manifest', async () => {
  const result = evaluateAgentCompatibility(manifest, {
    client: 'codex',
    manifest_version_seen: manifest.manifest_version,
    mcp_version: manifest.mcp.runtime.version,
    mcp_hash: manifest.mcp.runtime.hash,
    skill_version: manifest.skills.codex.version,
    skill_hash: manifest.skills.codex.hash,
  });
  expect(result.status).toBe('ready');
  expect(result.blocking).toBe(false);
});

it('returns blocked for breaking skill mismatch', async () => {
  const result = evaluateAgentCompatibility(manifest, {
    client: 'codex',
    manifest_version_seen: manifest.manifest_version,
    mcp_version: manifest.mcp.runtime.version,
    mcp_hash: manifest.mcp.runtime.hash,
    skill_version: '0.1.0',
    skill_hash: 'sha256-old',
  });
  expect(result.status).toBe('blocked');
  expect(result.blocking).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- core/agent-check.test.ts --runInBand --coverage=false`

Expected: FAIL because compatibility evaluation and routes do not exist.

**Step 3: Write minimal implementation**

- Add compatibility evaluator in `core/agent-manifest.ts` or a nearby module
- Add `GET /api/v1/agent-manifest`
- Add `POST /api/v1/agent/check`
- Return `ready`, `update_available`, or `blocked`
- Keep the first version stateless and deterministic

**Step 4: Run test to verify it passes**

Run: `npm test -- core/agent-check.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 3: Add MCP bootstrap state machine and status tool

**Files:**
- Create: `E:/projects/test_model/capability/mcp/bootstrap.ts`
- Modify: `E:/projects/test_model/capability/mcp/server.ts`
- Test: `E:/projects/test_model/capability/mcp/server.test.ts`

**Step 1: Write the failing test**

Extend `E:/projects/test_model/capability/mcp/server.test.ts` with tests like:

```ts
it('registers only get_runtime_status when bootstrap state is unreachable', async () => {
  const server = await createBootstrapAwareServer({ bootstrapState: unreachableState });
  const tools = await server.listTools();
  expect(tools.map(t => t.name)).toEqual(['get_runtime_status']);
});

it('registers formal tools when bootstrap state is ready', async () => {
  const server = await createBootstrapAwareServer({ bootstrapState: readyState });
  const tools = await server.listTools();
  expect(tools.map(t => t.name)).toEqual(expect.arrayContaining([
    'get_runtime_status',
    'start_task',
    'search_knowledge',
    'record_usage',
    'get_task_context',
    'finalize_task'
  ]));
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: FAIL because bootstrap-aware registration is not implemented.

**Step 3: Write minimal implementation**

- Add runtime state types in `mcp/bootstrap.ts`
- Add bootstrap fetch/check logic against server endpoints
- Register `get_runtime_status` unconditionally
- Register formal tools/resources only in `ready` or `update_available`
- Surface `unreachable`, `blocked`, `booting`, and `updating` through status payloads

**Step 4: Run test to verify it passes**

Run: `npm test -- mcp/server.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 4: Add supported-client skill auto-updater

**Files:**
- Create: `E:/projects/test_model/capability/mcp/skill-updater.ts`
- Modify: `E:/projects/test_model/capability/mcp/bootstrap.ts`
- Test: `E:/projects/test_model/capability/mcp/skill-updater.test.ts`

**Step 1: Write the failing test**

Add `E:/projects/test_model/capability/mcp/skill-updater.test.ts` covering:

```ts
it('downloads and atomically replaces supported client skill files', async () => {
  const result = await autoUpdateSkill({
    client: 'codex',
    downloadUrl: 'http://localhost:3000/skill/codex',
    expectedHash: 'sha256-...'
  });
  expect(result.updated).toBe(true);
});

it('skips unsupported clients without mutating files', async () => {
  const result = await autoUpdateSkill({ client: 'kimi', downloadUrl: 'http://localhost:3000/skill/kimi', expectedHash: 'sha256-...' });
  expect(result.updated).toBe(false);
  expect(result.reason).toContain('unsupported');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- mcp/skill-updater.test.ts --runInBand --coverage=false`

Expected: FAIL because the updater does not exist.

**Step 3: Write minimal implementation**

- Implement supported-client path resolution for `codex`, `claude-code`, `cursor`
- Download skill text from `download_url`
- Write to a temp file, validate hash, then atomically replace target file
- Return structured `updated / skipped / failed` result
- On successful update, re-run compatibility check from bootstrap logic

**Step 4: Run test to verify it passes**

Run: `npm test -- mcp/skill-updater.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 5: Add unreachable and blocking behavior docs

**Files:**
- Modify: `E:/projects/test_model/capability/README.md`
- Modify: `E:/projects/test_model/capability/docs/API_REFERENCE.md`
- Modify: `E:/projects/test_model/capability/docs/MCP_CLIENT_CONFIG.md`
- Modify: `E:/projects/test_model/capability/agent-skill/SKILL.md`
- Modify: `E:/projects/test_model/capability/opencode/localevomap-skill/INSTALL.md`

**Step 1: Write the failing test**

Add or extend docs tests so they assert the docs mention:

- `agent-manifest`
- `agent/check`
- `get_runtime_status`
- server unreachable disables formal tools
- supported auto-update clients

**Step 2: Run test to verify it fails**

Run: `npm test -- docs/mcp-client-config.test.ts --runInBand --coverage=false`

Expected: FAIL until the docs are updated.

**Step 3: Write minimal implementation**

- Add bootstrap/versioning explanation to each document at the right abstraction level
- Keep client-facing docs concise and operational

**Step 4: Run test to verify it passes**

Run: `npm test -- docs/mcp-client-config.test.ts --runInBand --coverage=false`

Expected: PASS.

### Task 6: Run end-to-end verification

**Files:**
- Modify only if required by failing tests discovered above

**Step 1: Run focused bootstrap test set**

Run:

```bash
npm test -- core/agent-manifest.test.ts core/agent-check.test.ts mcp/server.test.ts mcp/skill-updater.test.ts --runInBand --coverage=false
```

Expected: PASS.

**Step 2: Run regression tests for existing behavior**

Run:

```bash
npm test -- index.test.ts core/capsule-gene-resolver.test.ts docs/mcp-client-config.test.ts docs/mcp-example-files.test.ts --runInBand --coverage=false
```

Expected: PASS.

**Step 3: Run build**

Run:

```bash
npm run build
```

Expected: exit 0 and `public folder copied to dist`.

**Step 4: Commit**

```bash
git add config/agent-manifest.json types/agent-bootstrap-schema.ts core/agent-manifest.ts core/agent-manifest.test.ts core/agent-check.test.ts mcp/bootstrap.ts mcp/skill-updater.ts mcp/skill-updater.test.ts mcp/server.ts mcp/server.test.ts README.md docs/API_REFERENCE.md docs/MCP_CLIENT_CONFIG.md agent-skill/SKILL.md opencode/localevomap-skill/INSTALL.md
git commit -m "feat: add MCP bootstrap version checks"
```
