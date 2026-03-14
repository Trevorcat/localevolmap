# Client Template Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reusable repository templates and docs for Cursor, Claude Code, Kimi, and OpenCode so other developers can deploy LocalEvomap without editing personal machine config in the repo.

**Architecture:** Keep client examples in versioned template files, use placeholders for local paths and secrets, and point all docs to those templates. Extend lightweight docs tests to enforce that all supported client templates remain referenced.

**Tech Stack:** TypeScript, Jest, Markdown, JSON, TOML.

---

### Task 1: Refresh client templates

**Files:**
- Modify: `E:/projects/test_model/capability/docs/examples/.cursor/mcp.json`
- Modify: `E:/projects/test_model/capability/docs/examples/.mcp.json`
- Add: `E:/projects/test_model/capability/docs/examples/kimi.localevomap.json`
- Modify: `E:/projects/test_model/capability/.kimi/localevolmap.json`
- Modify: `E:/projects/test_model/capability/opencode/localevomap.remote.example.json`
- Modify: `E:/projects/test_model/capability/opencode/localevomap.remote.json`

### Task 2: Refresh docs

**Files:**
- Modify: `E:/projects/test_model/capability/docs/MCP_CLIENT_CONFIG.md`
- Modify: `E:/projects/test_model/capability/README.md`
- Modify: `E:/projects/test_model/capability/opencode/README.md`

### Task 3: Extend regression checks

**Files:**
- Modify: `E:/projects/test_model/capability/docs/mcp-client-config.test.ts`
- Modify: `E:/projects/test_model/capability/docs/mcp-example-files.test.ts`

### Task 4: Verify and publish

**Files:**
- Remove: `E:/projects/test_model/capability/.mcp.json`
- Remove: `E:/projects/test_model/capability/.cursor/mcp.json`

Run `npm test -- docs/mcp-client-config.test.ts docs/mcp-example-files.test.ts --runInBand --coverage=false`, then commit and push.
