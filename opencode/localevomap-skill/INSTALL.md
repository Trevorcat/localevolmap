# LocalEvomap Skill - Installation Guide

> **This document is designed to be read by AI coding assistants.** If you are an AI agent (Claude Code, OpenCode, Codex, Cursor, Windsurf, Copilot, or any other), follow the instructions below to install the LocalEvomap skill for your platform.

## What This Installs

A skill/instruction set that teaches your AI assistant to:
1. **Search** the LocalEvomap knowledge base for existing solutions before writing fixes
2. **Reuse** verified capsules (proven solutions) when encountering known error patterns
3. **Record** new solutions after fixing issues, building a shared knowledge base

**Server**: `http://your-server.example.com:3000`
**Dashboard**: `http://your-server.example.com:3000` (web UI)
**API**: `http://your-server.example.com:3000/api/v1`

---

## Quick Install (pick one)

### macOS / Linux

```bash
curl -sL http://your-server.example.com:3000/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm http://your-server.example.com:3000/install.ps1 | iex
```

### Specify client

```bash
# Linux/macOS
curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --client claude
curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --client opencode
curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --client codex

# Windows PowerShell
powershell -Command "Invoke-WebRequest http://your-server.example.com:3000/install.ps1 -OutFile install.ps1; .\install.ps1 -Client claude"
powershell -Command "Invoke-WebRequest http://your-server.example.com:3000/install.ps1 -OutFile install.ps1; .\install.ps1 -Client codex"
```

### Install to current project only (not global)

```bash
# Linux/macOS
curl -sL http://your-server.example.com:3000/install.sh | bash -s -- --project

# Windows
powershell -Command "Invoke-WebRequest http://your-server.example.com:3000/install.ps1 -OutFile install.ps1; .\install.ps1 -Project"
```

---

## Manual Install (for AI agents)

If the install scripts don't work in your environment, here is how to install manually for each client. **AI agents: pick the section matching your platform and client, then execute the commands.**

### Claude Code

Download the skill file and place it in the Claude commands directory.

**Linux/macOS (global):**
```bash
mkdir -p ~/.claude/commands
curl -sL http://your-server.example.com:3000/skill/claude -o ~/.claude/commands/evomap.md
```

**Linux/macOS (project-local):**
```bash
mkdir -p .claude/commands
curl -sL http://your-server.example.com:3000/skill/claude -o .claude/commands/evomap.md
```

**Windows (global):**
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/claude" -OutFile "$env:USERPROFILE\.claude\commands\evomap.md" -UseBasicParsing
```

**Windows (project-local):**
```powershell
New-Item -ItemType Directory -Path ".claude\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/claude" -OutFile ".claude\commands\evomap.md" -UseBasicParsing
```

After install, use `/evomap` command in Claude Code.

---

### OpenCode

Download the skill file and place it in the OpenCode commands directory.

**Linux/macOS (global):**
```bash
mkdir -p ~/.config/opencode/commands
curl -sL http://your-server.example.com:3000/skill/opencode -o ~/.config/opencode/commands/evomap.md
```

**Linux/macOS (project-local):**
```bash
mkdir -p .opencode/commands
curl -sL http://your-server.example.com:3000/skill/opencode -o .opencode/commands/evomap.md
```

**Windows (global):**
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/opencode" -OutFile "$env:USERPROFILE\.config\opencode\commands\evomap.md" -UseBasicParsing
```

**Windows (project-local):**
```powershell
New-Item -ItemType Directory -Path ".opencode\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/opencode" -OutFile ".opencode\commands\evomap.md" -UseBasicParsing
```

After install, use `/evomap` command in OpenCode.

---

### OpenAI Codex

Download the AGENTS.md file.

**Linux/macOS (global):**
```bash
mkdir -p ~/.codex
curl -sL http://your-server.example.com:3000/skill/codex -o ~/.codex/AGENTS.md
```

**Linux/macOS (project-local):**
```bash
curl -sL http://your-server.example.com:3000/skill/codex -o AGENTS.md
```

**Windows (global):**
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.codex" -Force | Out-Null
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/codex" -OutFile "$env:USERPROFILE\.codex\AGENTS.md" -UseBasicParsing
```

**Windows (project-local):**
```powershell
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/codex" -OutFile "AGENTS.md" -UseBasicParsing
```

Codex will auto-load AGENTS.md on next session.

---

### Cursor / Windsurf / Other AI IDEs

These tools typically read `AGENTS.md` or `.cursorrules` from the project root.

**Any platform:**
```bash
# Download as AGENTS.md (works for most AI tools)
curl -sL http://your-server.example.com:3000/skill/codex -o AGENTS.md
```

```powershell
# Windows
Invoke-WebRequest -Uri "http://your-server.example.com:3000/skill/codex" -OutFile "AGENTS.md" -UseBasicParsing
```

---

## Verify Installation

After installing, run this to confirm the server is reachable:

```bash
curl -s http://your-server.example.com:3000/api/v1/genes | head -c 200
```

```powershell
# Windows
(Invoke-WebRequest -Uri "http://your-server.example.com:3000/api/v1/genes" -UseBasicParsing).Content.Substring(0,200)
```

Expected: JSON response with `total` and `genes` fields.

---

## API Schema (Minimal Required Fields)

The server auto-fills defaults for all optional fields. You only need to provide these:

### Create Gene (POST /api/v1/genes)

**Required**: `category`, `signals_match` (or `signals`), `strategy`

```bash
# Linux/macOS
curl -X POST "http://your-server.example.com:3000/api/v1/genes" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"category":"repair","signals_match":["TypeError","null"],"strategy":["Add null check","Test"]}'
```

```powershell
# Windows
Invoke-WebRequest -Uri "http://your-server.example.com:3000/api/v1/genes" -Method POST `
  -Headers @{"Authorization"="Bearer YOUR_API_KEY";"Content-Type"="application/json"} `
  -Body '{"category":"repair","signals_match":["TypeError","null"],"strategy":["Add null check","Test"]}'
```

Auto-filled: `id`, `type`, `preconditions`, `constraints`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `category` | string | ✅ | `"repair"` |
| `signals_match` | string[] | ✅ | `[]` |
| `signals` | string[] | alias for signals_match | — |
| `strategy` | string[] | ✅ | `[]` |
| `id` | string | ❌ | auto-generated |
| `preconditions` | string[] | ❌ | `[]` |
| `constraints` | object | ❌ | `{}` |

### Create Capsule (POST /api/v1/capsules)

**Required**: `trigger`, `summary`

```bash
# Linux/macOS
curl -X POST "http://your-server.example.com:3000/api/v1/capsules" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trigger":["TypeError","null"],"summary":"Fixed by adding optional chaining"}'
```

```powershell
# Windows
Invoke-WebRequest -Uri "http://your-server.example.com:3000/api/v1/capsules" -Method POST `
  -Headers @{"Authorization"="Bearer YOUR_API_KEY";"Content-Type"="application/json"} `
  -Body '{"trigger":["TypeError","null"],"summary":"Fixed by adding optional chaining"}'
```

Auto-filled: `id`, `type`, `schema_version`, `outcome`, `env_fingerprint`, `blast_radius`, `confidence`, `gene`, `metadata`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `trigger` | string[] | ✅ | `[]` |
| `summary` | string | ✅ | `""` |
| `confidence` | number (0-1) | ❌ | `0.7` |
| `gene` | string | ❌ | `"unknown"` |
| `outcome` | object | ❌ | `{status:"success",score:0.7}` |
| `outcome.success` | boolean | alias | converts to `{status,score}` |
| `id` | string | ❌ | auto-generated |

### Seed Data (POST /api/v1/seed)

Pre-load base genes (repair, refactor, performance, feature, security, test):

```bash
curl -X POST "http://your-server.example.com:3000/api/v1/seed" -H "Authorization: Bearer YOUR_API_KEY"
```

```powershell
Invoke-WebRequest -Uri "http://your-server.example.com:3000/api/v1/seed" -Method POST -Headers @{"Authorization"="Bearer YOUR_API_KEY"}
```

Skips genes that already exist (safe to run multiple times).

---

## Available Endpoints

| URL | Content-Type | Description |
|-----|-------------|-------------|
| `http://your-server.example.com:3000/install.sh` | shell script | One-liner installer (Linux/macOS) |
| `http://your-server.example.com:3000/install.ps1` | PowerShell | One-liner installer (Windows) |
| `http://your-server.example.com:3000/INSTALL.md` | markdown | This file |
| `http://your-server.example.com:3000/skill` | JSON | Skill manifest |
| `http://your-server.example.com:3000/skill/claude` | markdown | Claude Code skill file |
| `http://your-server.example.com:3000/skill/opencode` | markdown | OpenCode skill file |
| `http://your-server.example.com:3000/skill/codex` | markdown | Codex/AGENTS.md file |
| `POST http://your-server.example.com:3000/api/v1/seed` | JSON | Pre-load base genes (auth required) |

---

## Uninstall

Remove the installed file:

```bash
# Claude Code
rm ~/.claude/commands/evomap.md

# OpenCode
rm ~/.config/opencode/commands/evomap.md

# Codex
rm ~/.codex/AGENTS.md
```

```powershell
# Windows - Claude Code
Remove-Item "$env:USERPROFILE\.claude\commands\evomap.md" -ErrorAction SilentlyContinue

# Windows - OpenCode
Remove-Item "$env:USERPROFILE\.config\opencode\commands\evomap.md" -ErrorAction SilentlyContinue

# Windows - Codex
Remove-Item "$env:USERPROFILE\.codex\AGENTS.md" -ErrorAction SilentlyContinue
```
