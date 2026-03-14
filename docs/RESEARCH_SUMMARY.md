# Capability Evolver 深度研究总结

## 核心概念

**Capability Evolver** 是一种 **AI 代理自进化系统架构**，其核心理念是：

> **"进化不是可选项。适应或死亡。"**

与传统插件架构不同，它使用 **协议约束的进化模型**，通过可审计、可复用的"基因资产"而非任意代码注入来实现能力进化。

---

## 核心架构设计

### 1. 基因/胶囊双层模型 (Gene/Capsule Dual-Layer)

这是整个系统的核心抽象：

#### **Genes (基因)** - 抽象的知识模式

基因编码"如何响应特定信号模式"的知识：

```json
{
  "type": "Gene",
  "id": "gene_gep_repair_from_errors",
  "category": "repair",
  "signals_match": ["error", "exception", "failed", "unstable"],
  "preconditions": ["signals contains error-related indicators"],
  "strategy": [
    "从日志中提取结构化信号",
    "根据信号匹配选择现有 Gene",
    "编辑前估算影响范围",
    "应用最小可逆补丁",
    "使用声明的验证步骤进行验证",
    "固化知识：追加 EvolutionEvent"
  ],
  "constraints": {
    "max_files": 20,
    "forbidden_paths": [".git", "node_modules"]
  },
  "validation": ["node scripts/validate-modules.js ./src/evolve"]
}
```

**关键特性**：
- **信号驱动激活**：基因匹配运行时信号（错误、机会）
- **范围受限**：约束防止失控修改
- **验证门控**：每个基因声明如何验证其应用

#### **Capsules (胶囊)** - 具体、已验证的解决方案

胶囊是已证明成功的"实例化修复"：

```json
{
  "type": "Capsule",
  "schema_version": "1.5.0",
  "id": "capsule_1770477654236",
  "trigger": ["log_error", "windows_shell_incompatible"],
  "gene": "gene_gep_repair_from_errors",
  "summary": "Fixed shell command compatibility on Windows",
  "confidence": 0.85,
  "blast_radius": {"files": 1, "lines": 2},
  "outcome": {"status": "success", "score": 0.85},
  "env_fingerprint": {
    "node_version": "v22.22.0",
    "platform": "linux",
    "arch": "x64"
  }
}
```

**关键特性**：
- **环境感知**：胶囊携带执行上下文以实现可移植性
- **结果追踪**：成功/失败指标指导复用决策
- **资产可寻址**：唯一 ID 支持跨部署共享

---

### 2. 选择算法与漂移控制

选择器实现 **群体遗传学原理** 来平衡探索/利用：

```javascript
// 群体大小依赖的漂移强度
function computeDriftIntensity(opts) {
  var effectivePopulationSize = opts.effectivePopulationSize || opts.genePoolSize || 1;
  
  if (opts.driftEnabled) {
    return effectivePopulationSize > 1 
      ? Math.min(1, 1 / Math.sqrt(effectivePopulationSize) + 0.3) 
      : 0.7;
  }
  
  // 群体依赖漂移：小群体 = 更多漂移
  // Ne=1: intensity=1.0 (纯漂移), Ne=25: intensity=0.2
  return Math.min(1, 1 / Math.sqrt(effectivePopulationSize));
}

function selectGene(genes, signals, opts) {
  // 根据信号匹配为基因评分
  const scored = genes.map(g => ({
    gene: g,
    score: g.signals_match.reduce((acc, pat) => 
      matchPatternToSignals(pat, signals) ? acc + 1 : acc, 0)
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  
  // 漂移下的随机选择
  var driftIntensity = computeDriftIntensity(opts);
  var selectedIdx = 0;
  if (driftIntensity > 0 && scored.length > 1 && Math.random() < driftIntensity) {
    var topN = Math.min(scored.length, Math.ceil(scored.length * driftIntensity));
    selectedIdx = Math.floor(Math.random() * topN);
  }
  
  return { selected: scored[selectedIdx].gene, alternatives: scored.slice(1, 5) };
}
```

**设计洞察**：这通过允许在置信度低或群体小时偶尔选择次优基因，防止 **局部最优陷阱**。

---

### 3. 信号提取引擎

信号是进化系统的主要输入：

```javascript
function extractSignals(logs, history) {
  const signals = [];
  
  // 错误信号（带精确错误签名）
  logs.forEach(entry => {
    if (entry.type === 'tool_result' && entry.error) {
      signals.push(`log_error`);
      signals.push(`errsig:${JSON.stringify(entry.error).slice(0, 200)}`);
    }
    
    // 性能信号
    if (entry.latency && entry.latency > 5000) {
      signals.push(`perf_bottleneck`);
    }
    
    // 机会信号
    if (entry.user_input && /feature|improvement/i.test(entry.user_input)) {
      signals.push(`user_feature_request`);
    }
  });
  
  // 多语言别名匹配
  function matchPatternToSignals(pattern, signals) {
    if (pattern.includes('|')) {
      // "error|错误 |エラー" -- 任意分支匹配 = 命中
      const branches = pattern.split('|').map(b => b.trim().toLowerCase());
      return branches.some(needle => signals.some(s => s.toLowerCase().includes(needle)));
    }
    return signals.some(s => s.toLowerCase().includes(pattern.toLowerCase()));
  }
  
  return signals;
}
```

**信号类别**：
- **错误信号**：`log_error`, `exception`, `failed`
- **性能信号**：`perf_bottleneck`, `slow_response`
- **机会信号**：`user_feature_request`, `capability_gap`
- **平台信号**：`windows_shell_incompatible`, `linux_only`

---

## 完整进化流程

```javascript
// 1. 从运行时历史提取信号
const signals = extractSignals(sessionLogs, memoryHistory);
// 输出：["log_error", "errsig:unknown command 'process'", "windows_shell_incompatible"]

// 2. 选择适当的基因
const { selected: gene, alternatives } = selectGene(allGenes, signals, {
  driftEnabled: true,
  effectivePopulationSize: 3
});
// 输出：gene_gep_repair_from_errors (score: 3)

// 3. 查找现有胶囊
const capsule = selectCapsule(allCapsules, signals);
// 输出：capsule_1770477654236 (confidence: 0.85)

// 4. 构建进化提示
const prompt = buildGepPrompt({
  signals,
  selectedGene: gene,
  selectedCapsule: capsule,
  recentEvents: readRecentEvents(5),
  mutation: buildMutation(signals, gene)
});

// 5. 执行进化（LLM 按照提示生成更改）
// 6. 验证更改
const validationPassed = runValidation(gene.validation);

// 7. 固化（记录结果）
if (validationPassed) {
  appendEvolutionEvent({ status: 'success', score: 0.9 });
  createCapsule({ gene: gene.id, signals, outcome: 'success' });
} else {
  rollbackChanges();
  appendEvolutionEvent({ status: 'failed', score: 0.0 });
}
```

---

## 安全架构

### 命令执行安全

```javascript
function isValidationCommandAllowed(command) {
  // 1. 前缀白名单
  if (!/^(node|npm|npx)\s/.test(command)) return false;
  
  // 2. 禁止命令替换
  if (/\$(\(|`)/.test(command)) return false;
  
  // 3. 禁止 shell 操作符（剥离引号后）
  const stripped = command.replace(/'[^']*'|"[^"]*"/g, '');
  if (/[;&|<>]/.test(stripped)) return false;
  
  return true;
}
```

### 外部资产摄入

来自外部源（EvoMap Hub）的胶囊在提升前需要验证：

```javascript
async function promoteCapsule(capsule, validated) {
  if (!validated) {
    throw new Error('External capsules require --validated flag');
  }
  
  // 审计所有验证命令
  if (capsule.gene) {
    const gene = loadGene(capsule.gene);
    for (const cmd of gene.validation || []) {
      if (!isValidationCommandAllowed(cmd)) {
        throw new Error(`Unsafe validation command rejected: ${cmd}`);
      }
    }
  }
  
  // 永不覆盖现有本地胶囊
  if (localStore.has(capsule.id)) {
    console.warn(`Capsule ${capsule.id} already exists, skipping`);
    return;
  }
  
  localStore.add(capsule);
}
```

---

## 架构对比

| 方面 | 插件架构 | 特征驱动 (ZeroClaw) | GEP 进化 (EvoMap) |
|------|---------|-------------------|-----------------|
| **代码来源** | 运行时下载 | 编译时编译 | 协议指导生成 |
| **验证** | 基于信任 | 编译器验证 | 信号 + 约束验证 |
| **权限** | 运行时，通常未检查 | 类型中声明 | 基因约束中声明 |
| **知识复用** | 无（每个插件独立） | 无 | 高（基因/胶囊共享） |
| **审计轨迹** | 仅安装日志 | 无 | 完整 EvolutionEvent 链 |
| **安全模型** | 进程隔离 | 编译时验证 | 命令白名单 + 验证 |
| **供应链风险** | 高 | 无 | 中（外部胶囊） |

---

## 关键设计原则

1. **协议 > 代码**：进化由结构化协议（GEP）指导，而非任意代码更改
2. **信号驱动**：更改由可观察的运行时信号触发，而非时间表或随意
3. **审计优先**：每次进化都产生 EvolutionEvent 记录以实现可追溯性
4. **复用优化**：基因和胶囊支持跨部署的知识共享
5. **风险受限**：约束和验证门防止失控修改
6. **漂移感知**：群体遗传学原理平衡探索与利用

---

## 相关资源

### 主要实现
- **[EvoMap/evolver](https://github.com/EvoMap/evolver)** - 主实现 (1.2k stars, v1.24.0)

### 研究论文
1. **[Self-Evolving Embodied AI](https://arxiv.org/html/2602.04411v1)** - 清华大学 (2026)
2. **[Controlled Self-Evolution (CSE)](https://arxiv.org/html/2601.07348v3)** - NJU/PKU/Midea-AIRC
3. **[EvoAgentX](https://github.com/EvoAgentX/EvoAgentX)** - 自进化代理生态系统 (2,582 stars)

### 架构对比
- **[Zylos: Plugin Architecture](https://zylos.ai/research/2026-02-21-ai-agent-plugin-extension-architecture)**
- **[ZeroClaw: Trait-Driven Architecture](https://zeroclaws.io/blog/trait-driven-architecture-extensible-agents/)**
