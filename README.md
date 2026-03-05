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
