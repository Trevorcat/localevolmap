# Local Evomap - 本地能力进化系统

基于 **EvoMap/evolver** 的核心思想实现的本地进化系统。

## 核心概念

### 基因/胶囊双层模型

- **Genes (基因)**: 抽象的知识模式，编码"如何响应特定信号"的知识
- **Capsules (胶囊)**: 具体、已验证的解决方案，可跨环境复用

### 信号驱动进化

系统从运行时日志中提取信号，根据信号匹配基因，执行进化操作。

## 项目结构

```
capability/
├── core/                    # 核心算法
│   ├── gene-selector.ts     # 基因选择算法（群体遗传学）
│   ├── capsule-manager.ts   # 胶囊匹配与复用
│   ├── signal-extractor.ts  # 信号提取引擎
│   ├── validation-gate.ts   # 安全验证门控
│   └── evolution-engine.ts  # 进化循环主控
├── storage/                 # 持久化存储
│   ├── gene-store.ts        # 基因存储
│   ├── capsule-store.ts     # 胶囊存储
│   └── event-logger.ts      # 事件审计日志
├── types/                   # 类型定义
│   └── gene-capsule-schema.ts
├── RESEARCH_SUMMARY.md      # 研究总结
├── ARCHITECTURE.md          # 架构设计文档
├── index.ts                 # 主入口
└── package.json
```

## 安装

```bash
cd capability
npm install
npm run build
```

## 快速开始

```typescript
import { LocalEvomap } from './index';

// 1. 初始化
const evomap = new LocalEvomap();
await evomap.init();

// 2. 添加基因
const gene = {
  type: 'Gene',
  id: 'gene_my_first_gene',
  category: 'repair',
  signals_match: ['error', 'failed'],
  preconditions: ['has error signal'],
  strategy: ['Fix the error'],
  constraints: { max_files: 5, max_lines: 50 }
};
await evomap.addGene(gene);

// 3. 执行进化
const logs = [
  {
    type: 'tool_result',
    error: { message: 'TypeError: undefined is not a function' },
    timestamp: new Date().toISOString()
  }
];

const event = await evomap.evolve(logs);
console.log('Evolution event:', event);
```

## 核心 API

### 进化操作

- `evolve(logs: any[])` - 执行进化循环
- `extractSignals(logs: any[])` - 提取信号
- `selectGene(signals: string[])` - 选择基因
- `selectCapsule(signals: string[])` - 选择胶囊

### 数据管理

- `addGene(gene: Gene)` - 添加基因
- `addCapsule(capsule: Capsule)` - 添加胶囊
- `getGenePoolStats()` - 获取基因池统计
- `getCapsulePoolStats()` - 获取胶囊池统计
- `getEventStats()` - 获取事件统计

### 外部胶囊源

- `searchExternalCapsules(opts)` - 搜索外部 Hub 中的胶囊
- `downloadExternalCapsule(id)` - 从外部 Hub 下载胶囊
- `syncExternalCapsules(signals?)` - 同步匹配的胶囊
- `refreshHubCache(hubName?)` - 刷新 Hub 缓存

### 工具函数

- `isCommandSafe(command: string)` - 验证命令安全性
- `estimateBlastRadius(files, lines)` - 估算影响范围
- `requiresApproval(blastRadius)` - 检查是否需要审批

## 配置选项

```typescript
const config = {
  strategy: 'balanced',  // balanced | innovate | harden | repair-only
  genes_path: './data/genes',
  capsules_path: './data/capsules',
  events_path: './data/events',
  session_scope: 'local-dev',
  review_mode: true,  // 是否需要人工审批
  max_blast_radius: { files: 50, lines: 500 },
  forbidden_paths: ['.git', 'node_modules'],
  selection: {
    driftEnabled: true,
    effectivePopulationSize: 3,
    minConfidence: 0.5,
    alternativesCount: 5
  },
  // 外部胶囊源配置
  externalSources: [
    {
      name: 'evomap-official',
      url: 'https://hub.evomap.ai',
      validatedOnly: true,
      apiKey: 'your-api-key',  // 可选
      enabled: true
    }
  ]
};

const evomap = new LocalEvomap(config);
```

## 安全机制

1. **命令白名单**: 只允许 `node/npm/npx` 前缀
2. **路径限制**: 禁止访问 `.git`, `node_modules` 等
3. **影响范围估算**: 限制修改文件数和行数
4. **审批流程**: 高风险操作需要人工确认

## 与原始 EvoMap 的对比

| 功能 | EvoMap (原始) | Local Evomap (本地) |
|------|--------------|-------------------|
| 基因选择算法 | ✅ | ✅ |
| 胶囊管理 | ✅ | ✅ |
| 信号提取 | ✅ | ✅ |
| 验证门控 | ✅ | ✅ |
| 事件审计 | ✅ | ✅ |
| 外部胶囊源 | ✅ | ✅ |
| Hub 同步 | ✅ | ✅ |
| LLM 集成 | ✅ | ⚠️ (框架已就绪) |

## AI Skill 安装

LocalEvomap 提供面向 AI 编码助手的 Skill 文件，让 Claude Code、OpenCode、Codex 等客户端能自动搜索/复用知识库中的解决方案。

### 前置条件

部署 LocalEvomap 服务器后，记下服务器地址（以下用 `YOUR_SERVER` 代替，例如 `http://localhost:3000`）。

### 一键安装

```bash
# macOS / Linux（自动检测已安装的客户端）
curl -sL http://YOUR_SERVER/install.sh | bash

# Windows PowerShell
irm http://YOUR_SERVER/install.ps1 | iex
```

### 指定客户端安装

```bash
# Linux/macOS
curl -sL http://YOUR_SERVER/install.sh | bash -s -- --client claude
curl -sL http://YOUR_SERVER/install.sh | bash -s -- --client opencode
curl -sL http://YOUR_SERVER/install.sh | bash -s -- --client codex

# Windows PowerShell
Invoke-WebRequest http://YOUR_SERVER/install.ps1 -OutFile install.ps1; .\install.ps1 -Client claude
```

### 仅安装到当前项目

```bash
# Linux/macOS
curl -sL http://YOUR_SERVER/install.sh | bash -s -- --project

# Windows
Invoke-WebRequest http://YOUR_SERVER/install.ps1 -OutFile install.ps1; .\install.ps1 -Project
```

### 手动安装

如果自动脚本不适用，可手动下载 Skill 文件：

| 客户端 | 全局路径 | 命令 |
|--------|----------|------|
| Claude Code | `~/.claude/commands/evomap.md` | `curl -sL http://YOUR_SERVER/skill/claude -o ~/.claude/commands/evomap.md` |
| OpenCode | `~/.config/opencode/commands/evomap.md` | `curl -sL http://YOUR_SERVER/skill/opencode -o ~/.config/opencode/commands/evomap.md` |
| Codex | `~/.codex/AGENTS.md` | `curl -sL http://YOUR_SERVER/skill/codex -o ~/.codex/AGENTS.md` |
| Cursor/其他 | 项目根目录 `AGENTS.md` | `curl -sL http://YOUR_SERVER/skill/codex -o AGENTS.md` |

Windows 使用 `Invoke-WebRequest -Uri "http://YOUR_SERVER/skill/claude" -OutFile "$env:USERPROFILE\.claude\commands\evomap.md"` 等效命令。

### 安装后验证

```bash
curl -s http://YOUR_SERVER/api/v1/genes | head -c 200
```

应返回包含 `total` 和 `genes` 字段的 JSON。

### 初始化知识库（Seed）

首次部署后，预加载基础 Gene 策略：

```bash
curl -X POST http://YOUR_SERVER/api/v1/seed -H "Authorization: Bearer YOUR_API_KEY"
```

包含 10 个基础 Gene，覆盖 repair、refactor、performance、feature、security、test 六个类别。幂等操作，可重复执行。

### Skill 分发端点

| 路径 | 说明 |
|------|------|
| `/install.sh` | Linux/macOS 一键安装脚本 |
| `/install.ps1` | Windows 一键安装脚本 |
| `/INSTALL.md` | 安装指南（给 AI 读） |
| `/skill` | Skill 清单 (JSON) |
| `/skill/claude` | Claude Code Skill 文件 |
| `/skill/opencode` | OpenCode Skill 文件 |
| `/skill/codex` | Codex AGENTS.md 文件 |

详细的 API Schema 和字段说明参见 [INSTALL.md](./opencode/localevomap-skill/INSTALL.md)。

## 扩展方向

1. **LLM 集成**: 实现 `executeEvolution()` 中的 LLM 调用
2. **Web UI**: 可视化进化过程和统计
3. **插件系统**: 支持自定义信号提取器和验证器
4. **部署自己的 Hub**: 参考 `examples/hub-server.ts`

## 参考资料

- [EvoMap/evolver](https://github.com/EvoMap/evolver) - 原始实现
- [RESEARCH_SUMMARY.md](./RESEARCH_SUMMARY.md) - 研究总结
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计
- [docs/DEPLOYMENT_OPENCODE.md](./docs/DEPLOYMENT_OPENCODE.md) - 服务器部署与 OpenCode 远程实验方案
- [docs/HTTP_API.md](./docs/HTTP_API.md) - HTTP API 与 CORS 配置
- [docs/SSH_OPENCODE.md](./docs/SSH_OPENCODE.md) - SSH 远程命令执行配置
- [docs/PLAYWRIGHT_REMOTE.md](./docs/PLAYWRIGHT_REMOTE.md) - Playwright 远程自动化配置

## License

MIT
