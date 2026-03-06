# LocalEvomap AI Skill 安装指南

> **本文档面向 AI 编码助手。** 如果你是 AI agent，请按照以下步骤帮助用户将 LocalEvomap Skill 安装到他们的 AI 编码工具中。

## 你需要从用户那里获取的信息

| 信息 | 示例 | 必需 |
|------|------|------|
| LocalEvomap 服务器地址 | `http://192.168.1.100:3000` | 是 |
| 使用的 AI 客户端 | Claude Code / OpenCode / Codex | 是 |
| 安装范围 | 全局 / 仅当前项目 | 否（默认全局） |
| 操作系统 | Linux / macOS / Windows | 自动检测 |

以下所有命令中的 `SERVER` 请替换为用户的实际服务器地址。

---

## 方式一：一键安装（推荐）

### macOS / Linux

```bash
curl -sL http://SERVER/install.sh | bash
```

指定客户端：

```bash
curl -sL http://SERVER/install.sh | bash -s -- --client claude
curl -sL http://SERVER/install.sh | bash -s -- --client opencode
curl -sL http://SERVER/install.sh | bash -s -- --client codex
```

仅安装到当前项目：

```bash
curl -sL http://SERVER/install.sh | bash -s -- --project
```

### Windows PowerShell

```powershell
irm http://SERVER/install.ps1 | iex
```

指定客户端：

```powershell
Invoke-WebRequest http://SERVER/install.ps1 -OutFile install.ps1; .\install.ps1 -Client claude
```

仅安装到当前项目：

```powershell
Invoke-WebRequest http://SERVER/install.ps1 -OutFile install.ps1; .\install.ps1 -Project
```

---

## 方式二：手动安装

如果一键脚本不适用，按客户端手动安装：

### Claude Code

安装后使用 `/evomap` 命令触发。

**Linux/macOS（全局）：**
```bash
mkdir -p ~/.claude/commands
curl -sL http://SERVER/skill/claude -o ~/.claude/commands/evomap.md
```

**Linux/macOS（当前项目）：**
```bash
mkdir -p .claude/commands
curl -sL http://SERVER/skill/claude -o .claude/commands/evomap.md
```

**Windows（全局）：**
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://SERVER/skill/claude" -OutFile "$env:USERPROFILE\.claude\commands\evomap.md" -UseBasicParsing
```

**Windows（当前项目）：**
```powershell
New-Item -ItemType Directory -Path ".claude\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://SERVER/skill/claude" -OutFile ".claude\commands\evomap.md" -UseBasicParsing
```

### OpenCode

安装后使用 `/evomap` 命令触发。

**Linux/macOS（全局）：**
```bash
mkdir -p ~/.config/opencode/commands
curl -sL http://SERVER/skill/opencode -o ~/.config/opencode/commands/evomap.md
```

**Linux/macOS（当前项目）：**
```bash
mkdir -p .opencode/commands
curl -sL http://SERVER/skill/opencode -o .opencode/commands/evomap.md
```

**Windows（全局）：**
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://SERVER/skill/opencode" -OutFile "$env:USERPROFILE\.config\opencode\commands\evomap.md" -UseBasicParsing
```

**Windows（当前项目）：**
```powershell
New-Item -ItemType Directory -Path ".opencode\commands" -Force | Out-Null
Invoke-WebRequest -Uri "http://SERVER/skill/opencode" -OutFile ".opencode\commands\evomap.md" -UseBasicParsing
```

### OpenAI Codex

Codex 自动加载 `AGENTS.md`，无需命令触发。

**Linux/macOS（全局）：**
```bash
mkdir -p ~/.codex
curl -sL http://SERVER/skill/codex -o ~/.codex/AGENTS.md
```

**Linux/macOS（当前项目）：**
```bash
curl -sL http://SERVER/skill/codex -o AGENTS.md
```

**Windows（全局）：**
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.codex" -Force | Out-Null
Invoke-WebRequest -Uri "http://SERVER/skill/codex" -OutFile "$env:USERPROFILE\.codex\AGENTS.md" -UseBasicParsing
```

**Windows（当前项目）：**
```powershell
Invoke-WebRequest -Uri "http://SERVER/skill/codex" -OutFile "AGENTS.md" -UseBasicParsing
```

### Cursor / Windsurf / 其他 AI IDE

这些工具通常读取项目根目录的 `AGENTS.md` 或 `.cursorrules`：

```bash
curl -sL http://SERVER/skill/codex -o AGENTS.md
```

---

## 安装后验证

确认服务器可达：

```bash
curl -s http://SERVER/api/v1/genes | head -c 200
```

```powershell
# Windows
(Invoke-WebRequest -Uri "http://SERVER/api/v1/genes" -UseBasicParsing).Content.Substring(0,200)
```

应返回包含 `total` 和 `genes` 字段的 JSON 响应。

---

## 卸载

删除对应文件即可：

```bash
# Claude Code
rm ~/.claude/commands/evomap.md

# OpenCode
rm ~/.config/opencode/commands/evomap.md

# Codex
rm ~/.codex/AGENTS.md
```

```powershell
# Windows
Remove-Item "$env:USERPROFILE\.claude\commands\evomap.md" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.config\opencode\commands\evomap.md" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.codex\AGENTS.md" -ErrorAction SilentlyContinue
```

---

## Skill 做了什么

安装后，AI 助手会在编码过程中：

1. **开始任务前** — 自动搜索知识库中已有的解决方案（Capsule）和策略（Gene）
2. **遇到问题时** — 匹配信号查找已验证的修复方案
3. **解决问题后** — 将新方案录入知识库供团队复用

不会修改你的代码、不会联网、不会发送你的代码到外部——只和你自己部署的 LocalEvomap 服务器通信。
