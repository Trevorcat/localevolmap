# Autonomous Feedback Evolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a task-end retrospective feedback pipeline so agents can autonomously strengthen LocalEvomap knowledge after finishing work.

**Architecture:** Introduce a dedicated feedback request schema and orchestration method in `LocalEvomap`, expose it via `POST /api/v1/feedback`, reuse existing event/capsule/epigenetic logic for scoring, and update skill templates to call the new endpoint at task completion.

**Tech Stack:** TypeScript, Node.js HTTP server, Jest, existing Gene/Capsule/Event stores.

---

### Task 1: Define feedback contracts

**Files:**
- Modify: `E:/projects/test_model/capability/types/gene-capsule-schema.ts`
- Test: `E:/projects/test_model/capability/core/evolution-engine.test.ts`

**Step 1: Write the failing test**
- Add assertions covering the feedback request/response behavior expected from the public API surface.

**Step 2: Run test to verify it fails**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

**Step 3: Write minimal implementation**
- Add `FeedbackSubmission`, `FeedbackResult`, and any helper metadata types.

**Step 4: Run test to verify it passes**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

### Task 2: Add feedback orchestration

**Files:**
- Modify: `E:/projects/test_model/capability/index.ts`
- Modify: `E:/projects/test_model/capability/core/capsule-manager.ts`
- Test: `E:/projects/test_model/capability/core/evolution-engine.test.ts`

**Step 1: Write the failing test**
- Add tests for submitting feedback that append an event, update a reused capsule, update a selected gene, and optionally create a capsule.

**Step 2: Run test to verify it fails**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

**Step 3: Write minimal implementation**
- Implement `LocalEvomap.submitFeedback()` and supporting normalization helpers.

**Step 4: Run test to verify it passes**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

### Task 3: Expose the feedback API

**Files:**
- Modify: `E:/projects/test_model/capability/server.ts`
- Test: `E:/projects/test_model/capability/core/evolution-engine.test.ts`

**Step 1: Write the failing test**
- Add API-level assertions for request validation and response payload shape.

**Step 2: Run test to verify it fails**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

**Step 3: Write minimal implementation**
- Add `POST /api/v1/feedback` route and handler with auth and validation.

**Step 4: Run test to verify it passes**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

### Task 4: Upgrade skill templates and docs

**Files:**
- Modify: `E:/projects/test_model/capability/opencode/localevomap-skill/codex-agents.md`
- Modify: `E:/projects/test_model/capability/opencode/localevomap-skill/opencode-skill.md`
- Modify: `E:/projects/test_model/capability/README.md`
- Modify: `E:/projects/test_model/capability/docs/API_REFERENCE.md`

**Step 1: Write the failing test**
- No automated test; verify docs mention the new endpoint and task-end retrospective flow.

**Step 2: Write minimal implementation**
- Document task-end feedback and example payloads.

**Step 3: Verify manually**
- Inspect docs for consistency with request/response behavior.

### Task 5: Verify the implementation

**Files:**
- Test only

**Step 1: Run focused tests**
- Run: `npm test -- evolution-engine.test.ts --runInBand`

**Step 2: Run broader tests if needed**
- Run: `npm test -- --runInBand`

**Step 3: Build**
- Run: `npm run build`

