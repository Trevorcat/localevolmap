# Mapping Unified Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate `plugins/cloud_mapping` into LocalEvomap as an internally managed plugin so agents perceive one unified LocalEvomap service across HTTP and MCP.

**Architecture:** Add a lightweight plugin framework in TypeScript that discovers enabled plugins, launches `cloud_mapping` as a loopback-only Python sidecar, and exposes mapping endpoints/tools through the existing LocalEvomap HTTP and MCP surfaces. Reuse the existing Python implementation as the domain engine while keeping service boundary, auth, runtime status, and error handling inside LocalEvomap.

**Tech Stack:** TypeScript, Node.js HTTP server, MCP server, Python FastAPI sidecar, pytest, Jest.

---

### Task 1: Define plugin metadata and config loading

**Files:**
- Create: `config/plugins.json`
- Create: `core/plugins/types.ts`
- Create: `core/plugins/plugin-registry.ts`
- Create: `core/plugins/plugin-registry.test.ts`

**Step 1: Write the failing test**

Create tests that verify:
- plugin manifests are discovered from `plugins/*/plugin.json`
- disabled plugins are excluded
- enabled plugins merge manifest + config correctly

**Step 2: Run test to verify it fails**

Run: `npx jest core/plugins/plugin-registry.test.ts --runInBand`
Expected: FAIL because plugin registry does not exist.

**Step 3: Write minimal implementation**

Implement manifest/config types and a loader that:
- reads `plugin.json`
- reads `config/plugins.json`
- returns normalized plugin definitions

**Step 4: Run test to verify it passes**

Run: `npx jest core/plugins/plugin-registry.test.ts --runInBand`
Expected: PASS.

### Task 2: Implement Python sidecar runtime management

**Files:**
- Create: `core/plugins/python-sidecar-runtime.ts`
- Create: `core/plugins/plugin-manager.ts`
- Create: `core/plugins/plugin-manager.test.ts`

**Step 1: Write the failing test**

Create tests that verify:
- plugin manager reports disabled plugins without starting them
- a runtime definition produces `starting` -> `ready` or `failed`
- health failures become `degraded` or `failed`

**Step 2: Run test to verify it fails**

Run: `npx jest core/plugins/plugin-manager.test.ts --runInBand`
Expected: FAIL because plugin runtime manager does not exist.

**Step 3: Write minimal implementation**

Implement:
- a loopback-only Python process launcher
- health polling
- plugin state tracking
- status query helpers

**Step 4: Run test to verify it passes**

Run: `npx jest core/plugins/plugin-manager.test.ts --runInBand`
Expected: PASS.

### Task 3: Add mapping proxy and unified HTTP endpoints

**Files:**
- Create: `core/plugins/mapping-proxy.ts`
- Create: `core/plugins/mapping-proxy.test.ts`
- Modify: `server.ts`
- Modify: `plugins/cloud_mapping/app/config.py`
- Create: `plugins/cloud_mapping/plugin.json`

**Step 1: Write the failing test**

Create tests that verify:
- `/api/v1/mapping/health` proxies to plugin health
- `/api/v1/mapping/ingest/profiles` proxies request body and response
- `/api/v1/mapping/query/candidates` proxies correctly
- unavailable plugin returns standardized error

**Step 2: Run test to verify it fails**

Run: `npx jest core/plugins/mapping-proxy.test.ts --runInBand`
Expected: FAIL because mapping proxy and routes do not exist.

**Step 3: Write minimal implementation**

Implement:
- plugin-aware mapping proxy
- server route handling under `/api/v1/mapping/*`
- Python config support for runtime DB path/env provided by LocalEvomap

**Step 4: Run test to verify it passes**

Run: `npx jest core/plugins/mapping-proxy.test.ts --runInBand`
Expected: PASS.

### Task 4: Add unified MCP tools for mapping

**Files:**
- Modify: `mcp/server.ts`
- Modify: `mcp/remote-evolution-client.ts`
- Modify: `mcp/remote-evolution-client.test.ts`
- Modify: `mcp/server.test.ts`

**Step 1: Write the failing test**

Create tests that verify:
- MCP exposes `mapping_get_status`
- MCP exposes `mapping_ingest_profiles`
- MCP exposes `mapping_query_candidates`
- tools use the same LocalEvomap HTTP base URL instead of a second service URL

**Step 2: Run test to verify it fails**

Run: `npx jest mcp/remote-evolution-client.test.ts mcp/server.test.ts --runInBand`
Expected: FAIL because mapping methods/tools are missing.

**Step 3: Write minimal implementation**

Implement client methods and MCP tool registration that call unified LocalEvomap HTTP endpoints.

**Step 4: Run test to verify it passes**

Run: `npx jest mcp/remote-evolution-client.test.ts mcp/server.test.ts --runInBand`
Expected: PASS.

### Task 5: Surface plugin capability status in runtime diagnostics

**Files:**
- Modify: `mcp/bootstrap.ts`
- Modify: `mcp/bootstrap.test.ts`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Write the failing test**

Create tests that verify runtime diagnostics include plugin states/capabilities for `cloud_mapping`.

**Step 2: Run test to verify it fails**

Run: `npx jest mcp/bootstrap.test.ts --runInBand`
Expected: FAIL because plugin capability state is absent.

**Step 3: Write minimal implementation**

Add plugin status to runtime diagnostics and update docs to explain the unified service boundary.

**Step 4: Run test to verify it passes**

Run: `npx jest mcp/bootstrap.test.ts --runInBand`
Expected: PASS.

### Task 6: Verify plugin integration end-to-end

**Files:**
- Verify: `server.ts`
- Verify: `mcp/server.ts`
- Verify: `plugins/cloud_mapping`

**Step 1: Run focused tests**

Run:
- `npx jest core/plugins/plugin-registry.test.ts core/plugins/plugin-manager.test.ts core/plugins/mapping-proxy.test.ts --runInBand`
- `npx jest mcp/remote-evolution-client.test.ts mcp/server.test.ts mcp/bootstrap.test.ts --runInBand`

Expected: PASS.

**Step 2: Run Python plugin tests**

Run: `python -c "import pytest, sys; sys.path.insert(0, 'plugins'); raise SystemExit(pytest.main(['-c','plugins/cloud_mapping/pytest.ini','plugins/cloud_mapping/tests','-q']))"`
Expected: PASS.

**Step 3: Run full build**

Run: `npm run build`
Expected: PASS.

**Step 4: Manual smoke check**

Run the service and verify:
- `GET /api/v1/mapping/health`
- MCP tool `mapping_get_status`

Expected: Agent only needs one LocalEvomap endpoint to use mapping features.
