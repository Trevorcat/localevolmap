# Code Review Issues — 代码审查问题清单

> 本文档记录了对项目 7 个核心模块逐个梳理过程中发现的设计缺陷和改进建议。
> 全部梳理已完成，共发现 **42 个问题**（7 个 P0、22 个 P1、6 个 P2、7 个 P3），交由 agent 统一修复。
>
> 状态标记：🔴 严重（P0） | 🟡 中等（P1） | 🟢 低优先级（P2/P3）
>
> **核心发现**：系统的"自进化"能力存在根本性断裂——表观遗传标记写入但未读取（2.8）、胶囊置信度永不更新（3.5）、基因禁止机制因命名空间不一致而失效（2.6），导致系统实质处于"无记忆"状态，不论基因/胶囊过去表现如何，对未来选择概率没有影响。

---

## 模块 1：Signal Extractor（信号提取引擎）

文件：`core/signal-extractor.ts`

### 问题 1.1 🔴 evolve 接口无运行时 schema 校验

**位置**：`evolution-engine.ts:141-143`、`server.ts:1104-1114`

**描述**：

`evolve()` 方法的 `logs` 参数类型为 `any[]`，服务端仅校验 `Array.isArray(logs) && logs.length > 0`，不验证每条日志是否符合 `LogEntry` 接口。

畸形数据进入 `extractSignals()` 后不会崩溃，但会**静默产生空信号**，导致下游基因选择失败，且无法定位问题根源。

**影响**：
- 垃圾数据静默通过，无任何错误提示
- 排查困难：调用者不知道自己传的数据有问题
- 通过 `POST /api/v1/evolve` 对外暴露时风险更高

**建议修复**：

项目已依赖 `zod`，在 `extractSignals()` 入口处增加运行时校验：

```typescript
import { z } from 'zod';

const LogEntrySchema = z.object({
  type: z.enum(['tool_result', 'user_input', 'agent_output', 'system', 'error']),
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
  latency: z.number().nonnegative().optional(),
  user_input: z.string().optional(),
  content: z.string().optional(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const SignalContextSchema = z.object({
  logs: z.array(LogEntrySchema).min(1),
  history: z.array(z.any()).optional(),
});
```

同时将 `evolution-engine.ts:141` 的 `logs: any[]` 改为 `logs: LogEntry[]`。

---

### 问题 1.2 🟡 Signal 类型为裸 string，无类型安全

**位置**：`types/gene-capsule-schema.ts:12`

**描述**：

`type Signal = string` 导致任何字符串都可以作为信号，编译器无法帮助检查拼写错误或无效信号。

**建议修复**：

使用模板字面量类型增加约束：

```typescript
type KnownSignal =
  | 'log_error' | 'system_error'
  | 'perf_critical' | 'perf_bottleneck'
  | 'user_feature_request' | 'user_bug_report'
  | 'security_concern' | 'performance_concern'
  | 'refactor_request' | 'testing_concern'
  | 'system_timeout' | 'memory_pressure' | 'cpu_pressure'
  | 'disk_pressure' | 'network_issue'
  | 'recurring_failures' | 'low_success_rate' | 'high_success_rate'
  | 'error_undefined' | 'error_null' | 'error_timeout'
  | 'error_permission' | 'error_not_found' | 'error_syntax'
  | 'error_type' | 'error_connection' | 'error_memory'
  | 'error_stack' | 'error_circular' | 'error_duplicate'
  | 'error_validation' | 'error_auth' | 'error_authz';

type DynamicSignal =
  | `errsig:${string}`
  | `error_code:${string}`
  | `error_msg:${string}`
  | `frequent_gene:${string}`;

type Signal = KnownSignal | DynamicSignal;
```

---

### 问题 1.3 🟡 用户输入信号提取基于粗粒度关键词匹配，误触发率高

**位置**：`core/signal-extractor.ts:162-193`

**描述**：

`extractUserInputSignals()` 使用简单正则匹配关键词，存在大量 false positive：
- 用户说 "create a new test" → 同时触发 `user_feature_request`（匹配 "create"）和 `testing_concern`（匹配 "test"）
- 用户说 "add performance monitoring" → 触发 `user_feature_request`（匹配 "add"）和 `performance_concern`（匹配 "performance"）

对于自然语言输入，关键词匹配无法理解上下文语义。

**建议修复**：

方案 A（低成本）：增加短语级匹配代替单词匹配，减少误触发。

方案 B（推荐）：项目已有 LLM 能力（`llm-provider.ts` 的 `generateObject`），可用 LLM 做意图分类：

```typescript
async function extractUserSignalsWithLLM(
  input: string,
  llmProvider: LLMProvider
): Promise<Signal[]> {
  const result = await llmProvider.generateObject({
    schema: z.object({
      intents: z.array(z.enum([
        'feature_request', 'bug_report', 'performance',
        'security', 'refactor', 'testing'
      ])),
      confidence: z.number()
    }),
    prompt: `Classify the user intent: "${input}"`
  });
  return result.intents
    .filter(() => result.confidence > 0.7)
    .map(i => `user_${i}` as Signal);
}
```

---

### 问题 1.4 🟡 信号去重逻辑对动态信号无效

**位置**：`core/signal-extractor.ts:67`

**描述**：

```typescript
const signals = [...new Set(rawSignals)];
```

`Set` 对字符串值去重有效，但**带动态后缀的信号几乎不会重复**。例如两条不同的错误日志各自产生 `errsig:{"message":"Error A"...}` 和 `errsig:{"message":"Error B"...}`，它们是不同的字符串，不会被去重。

固定名称的信号（如 `log_error`）可以正确去重，但同一类问题如果错误内容不同，会产生大量 `errsig:` 信号淹没有效信号。

**建议修复**：

按前缀分组去重——同一前缀只保留最具代表性的 N 条：

```typescript
function deduplicateSignals(signals: Signal[], maxPerPrefix: number = 3): Signal[] {
  const prefixCount = new Map<string, number>();
  return signals.filter(signal => {
    const colonIdx = signal.indexOf(':');
    const prefix = colonIdx > 0 ? signal.slice(0, colonIdx) : signal;
    const count = prefixCount.get(prefix) || 0;
    if (count >= maxPerPrefix) return false;
    prefixCount.set(prefix, count + 1);
    return true;
  });
}
```

---

### 问题 1.5 🟢 性能信号使用硬编码阈值，无输入合法性检查

**位置**：`core/signal-extractor.ts:100-107`

**描述**：

`latency > 10000` 和 `latency > 5000` 为硬编码阈值，不验证 `latency` 是否为合法数值（如负数、NaN、极端大值）。不同类型的操作合理延迟差异巨大（数据库查询 vs 文件下载），统一阈值不合理。

**建议修复**：

1. 增加输入校验：`if (typeof entry.latency === 'number' && entry.latency > 0 && isFinite(entry.latency))`
2. 阈值可配置化，或按操作类型区分。

---

### 问题 1.6 🟡 信号无置信度（confidence），所有信号等权

**描述**：

信号一旦被提取就是"确定存在"的，没有概率/权重概念。关键词匹配出来的 `user_feature_request` 和精确错误码产生的 `error_code:EACCES` 在下游的权重是一样的，但后者的可靠性远高于前者。

**建议修复**：

扩展 Signal 为结构体：

```typescript
interface WeightedSignal {
  signal: Signal;
  confidence: number;  // 0-1，提取时赋值
  source: 'error' | 'latency' | 'user_input' | 'system' | 'pattern';
}
```

下游 Gene Selector 可据此做加权匹配。

---

### 问题 1.7 🔴 Skill 客户端与服务端信号命名体系不一致

**位置**：
- 客户端：`opencode/localevomap-skill/index.ts:31-73`
- 服务端：`core/signal-extractor.ts:131-157`

**描述**：

Skill 客户端 `extractSignals()` 产出的信号名与服务端完全不同：

| 场景 | 客户端产出 | 服务端产出 |
|------|-----------|-----------|
| TypeError | `"TypeError"` | `"error_type"` |
| undefined | `"undefined"` | `"error_undefined"` |
| timeout | `"timeout"` | `"error_timeout"` |
| 一般错误 | `"error"` | `"log_error"` |

这导致客户端提取的信号用于 capsule 搜索时，与服务端基因的 `signals_match` 模式可能不匹配。

**建议修复**：

统一信号词表。建议：
1. 在 `types/` 下新建 `signal-registry.ts`，定义统一的信号常量。
2. 客户端 skill 和服务端共用同一份词表。
3. 搜索 API 增加信号别名映射（`"TypeError"` → `"error_type"`）。

---

### 问题 1.8 🟢 `prioritizeSignals` 中 `signalTypePrefix` 函数是冗余包装

**位置**：`core/signal-extractor.ts:308, 327-330`

**描述**：

排序比较函数中，`a` 用 `signalTypePriority(a)` 而 `b` 用 `signalTypePrefix(b)`，两个函数实现完全相同。这看起来像是 typo 或重构遗留，虽然不影响功能，但增加了维护成本和阅读困惑。

```typescript
return signalTypePriority(a) - signalTypePrefix(b);
//                              ^^^^^^^^^^^^^^^^ 应为 signalTypePriority
```

**建议修复**：

删除 `signalTypePrefix`，统一使用 `signalTypePriority`。

---

## 模块 2：Gene Selector（基因选择算法）

文件：`core/gene-selector.ts`

> **设计背景**：Gene Selector 使用硬性匹配（非 LLM）是合理的设计决策——信号到基因的匹配需要高频、低延迟调用，LLM 参与会导致效率过低。因此以下问题聚焦于匹配算法本身的精确度和鲁棒性。

### Agent 与基因库的交互模型

外部 agent 在三个时机与基因库交互：

1. **任务开始前（主动查询）**：`GET /api/v1/genes?category=repair` 或 `GET /api/v1/capsules/search?signals=...`，由 skill 文档指导 agent 在编码前主动搜索已有策略。
2. **遇到错误时（被动触发）**：skill 客户端的 `evolutionAssistant()` 从错误消息提取信号，搜索 capsule → gene。
3. **精确选择（算法驱动）**：`POST /api/v1/genes/select { signals: [...] }`，由服务端 `selectGene` 算法评分后返回最优基因。

Agent 通过两种方式表达需求：
- **按类别**（`?category=repair`）：粗粒度，7 个枚举值
- **按信号关键词**（`?signal=timeout` 或 `POST signals:[...]`）：细粒度，但依赖 `includes()` 子串匹配

当前设计**没有统一的信号词表/协议**告诉 agent "应该用什么词"，导致 agent 侧的表达（如 `"TypeError"`）和基因侧的配置（如 `"error"`）之间依赖模糊匹配来弥合差异。

---

### 问题 2.1 🔴 `includes()` 子串匹配导致基因选择严重交叉污染

**位置**：`core/gene-selector.ts:62-75`

**描述**：

`matchPatternToSignals()` 使用 `signal.includes(pattern)` 做子串匹配。这导致：

1. **宽网效应**：pattern `"error"` 命中所有含 "error" 子串的信号（`log_error`, `error_timeout`, `errsig:xxx`, `error_code:xxx` 等）。`gene_repair_general` 的 9 个 pattern 几乎能匹配到任何包含错误信号的场景。
2. **跨类别污染**：信号 `"error_timeout"` 同时命中 `gene_repair_general`（pattern `"error"`）和 `gene_performance_optimize`（pattern `"timeout"`），两个完全不同类型的基因得到相同匹配。
3. **意外命中**：`gene_feature_add` 的 pattern `"new"` 会命中 `"error_msg:Unexpected new line"` 等无关信号。

**实际影响举例**：

当信号为 `["error_timeout", "perf_critical"]` 时：

| 基因 | pattern 命中 | 得分 |
|------|-------------|------|
| `gene_repair_general` | `"error"` → `"error_timeout"` ✅ | 1 |
| `gene_performance_optimize` | `"timeout"` → `"error_timeout"` ✅ | 1 |

两个本应区分明确的基因得分一样，选择变成随机。

**建议修复**：

引入多层匹配策略，区分精确匹配和模糊匹配的权重：

```typescript
function matchPatternToSignals(pattern: string, signals: Signal[]): { matched: boolean; precision: number } {
  const patternLower = pattern.toLowerCase();

  for (const signal of signals) {
    const signalLower = signal.toLowerCase();
    // 精确匹配（完全相等或信号以 pattern 开头/结尾）
    if (signalLower === patternLower) return { matched: true, precision: 1.0 };
    // 前缀匹配（如 pattern "error" 匹配 signal "error_timeout"）
    if (signalLower.startsWith(patternLower + '_') || signalLower.startsWith(patternLower + ':'))
      return { matched: true, precision: 0.7 };
    // 子串匹配（最低精度）
    if (signalLower.includes(patternLower))
      return { matched: true, precision: 0.3 };
  }
  return { matched: false, precision: 0 };
}
```

评分时用 precision 加权而非简单 +1。

---

### 问题 2.2 🟡 评分是简单计数，大 signals_match 数组的基因天然占优

**位置**：`core/gene-selector.ts:113-135`

**描述**：

`scoreGenes()` 对每个命中的 pattern 简单加 1 分。这意味着：
- `gene_repair_general`（9 个 pattern）比 `gene_repair_import`（6 个 pattern）天然分数上限更高
- 没有考虑匹配**精确度**——完全匹配 `"TypeError"` vs 子串命中 `"error"` 贡献相同
- 没有考虑信号的**优先级**——P0 信号 `log_error` 和 P3 信号 `user_feature_request` 贡献相同
- 没有考虑 pattern 的**特异性**——`"error"` 几乎匹配所有错误信号（低特异性），`"Cannot read properties"` 只匹配特定错误（高特异性），但贡献相同

**建议修复**：

1. 评分纳入匹配精度（结合 2.1 的修复）
2. 考虑对 pattern 进行 IDF（逆文档频率）加权——在整个基因池中越罕见的 pattern 权重越高
3. 或简单方案：最终分数除以 `gene.signals_match.length` 做归一化，消除数组长度偏差

---

### 问题 2.3 🟡 漂移用 `Math.random()`，不可测试且不可复现

**位置**：`core/gene-selector.ts:189-200`

**描述**：

漂移选择依赖 `Math.random()`，导致：
1. 单元测试无法验证漂移行为——现有测试 `expect(selections.size).toBeGreaterThan(0)` 断言永远为真，实际什么都没验证
2. 生产环境中同样的输入会产生不同的输出，排查问题困难
3. 无法复现特定的选择结果

**建议修复**：

注入随机数生成器，测试时使用确定性种子：

```typescript
export function selectGene(
  genes: Gene[],
  signals: Signal[],
  opts: SelectionOptions = {},
  rng: () => number = Math.random  // 可注入
): SelectionResult<Gene> {
  // ...
  if (rng() < driftIntensity) { ... }
}
```

---

### 问题 2.4 🟡 `preconditions` 字段定义了但从未参与选择

**位置**：`core/gene-selector.ts:151-226`（`selectGene` 中无 preconditions 检查）

**描述**：

每个种子基因都定义了前置条件（如 `"Error signal detected in logs or output"`、`"TypeError or null/undefined access detected"`），但 `selectGene()` 完全不评估这些条件。它们目前纯粹是文档性质的注释，不影响选择逻辑。

这不一定是 bug——preconditions 可能设计上就是给 agent 看的参考信息，不参与算法。但如果是这样，应当在 schema 或文档中明确说明。

**建议**：

明确 preconditions 的定位：
- 若为文档性质：在类型定义中加注释说明
- 若应参与选择：在评分阶段检查 preconditions 是否在当前上下文中被满足（可通过信号匹配简单实现）

---

### 问题 2.5 🟢 错误处理依赖字符串匹配，脆弱

**位置**：`core/evolution-engine.ts:280-289`

**描述**：

`selectGeneWithFallback()` 通过 `error.message.includes('No matching genes')` 判断异常类型来决定是否自动创建基因。如果将来修改了 `selectGene` 的错误消息文本，这里会静默失效，自动基因创建功能不再触发。

**建议修复**：

使用自定义错误类代替字符串匹配：

```typescript
export class NoMatchingGeneError extends Error {
  constructor(signals: Signal[]) {
    super(`No matching genes found for signals: ${signals.join(', ')}`);
    this.name = 'NoMatchingGeneError';
  }
}

// evolution-engine.ts 中
} catch (error) {
  if (error instanceof NoMatchingGeneError || error instanceof AllGenesBannedError) {
    const autoGene = buildAutoGene({ signals: this.state.signals });
    return { selected: autoGene, alternatives: [], autoGenerated: true };
  }
  throw error;
}
```

---

### 问题 2.6 🟡 `banGenesFromFailedCapsules` 的 Jaccard 计算因命名空间不同而失效

**位置**：`core/gene-selector.ts:295-336`

**描述**：

该函数用 Jaccard 系数计算失败胶囊的触发信号与基因 `signals_match` 的重叠度。但两边的信号处于不同的命名空间：

- `failSignals` 来自运行时的 `state.signals`（服务端信号，如 `"error_timeout"`）
- `geneSignals` 来自基因的 `signals_match`（模式片段，如 `"timeout"`）

Jaccard 要求完全匹配才算交集，因此 `"error_timeout"` 和 `"timeout"` 不算相交——重叠度始终为 0，`FAILED_CAPSULE_OVERLAP_MIN = 0.6` 的阈值永远不会被触发，**基因禁止机制实际上是失效的**。

**建议修复**：

重叠度计算应使用与 `matchPatternToSignals` 相同的匹配逻辑（子串匹配），而非精确 Set 交集：

```typescript
export function computeSignalOverlap(signals: Signal[], patterns: Signal[]): number {
  if (signals.length === 0 && patterns.length === 0) return 0;

  const matchedPatterns = patterns.filter(pattern =>
    matchPatternToSignals(pattern, signals)
  );

  return patterns.length > 0 ? matchedPatterns.length / patterns.length : 0;
}
```

---

### 问题 2.7 🟢 蒸馏基因折扣系数硬编码，无配置化和理论依据

**位置**：`core/gene-selector.ts:17-18`

**描述**：

`DISTILLED_SCORE_FACTOR = 0.8`（蒸馏基因得分打 8 折）为硬编码常量，没有注释说明为什么是 0.8 而非其他值。不同应用场景下对蒸馏基因的信任程度不同，应支持配置。

**建议修复**：

移入 `SelectionOptions` 作为可选配置，保留 0.8 为默认值并补充设计理由注释。

---

### 问题 2.8 🔴 表观遗传标记被写入但选择阶段从未读取——适应度反馈回路断裂

**位置**：
- 写入端：`core/evolution-engine.ts:221-222`（`applyEpigeneticMarks` 调用）
- 读取端缺失：`core/gene-selector.ts:113-135`（`scoreGenes` 中无 `getEpigeneticBoost` 调用）

**描述**：

进化引擎在每次执行后正确调用 `applyEpigeneticMarks(gene, env, outcome)` 记录成功/失败标记。`epigenetic.ts` 中的 `getEpigeneticBoost()` 也有完整实现（环境匹配、90 天线性衰减、[-0.5, +0.5] 范围限制）。

但 `gene-selector.ts` 的 `scoreGenes()` 评分函数**从未调用 `getEpigeneticBoost()`**。基因评分完全靠 pattern 匹配计数，历史表现积累的适应度标记被写入后就再也没有被使用。

**影响**：

这是整个"基因优胜劣汰"体系的核心断裂点：
- 一个在当前环境中反复失败的基因（积累了大量 -0.1 惩罚），下次被选中的概率**完全不受影响**
- 一个表现优异的基因（积累了 +0.05 奖励），也得不到任何选择优势
- 表观遗传模块的全部代码实际上是死代码（Dead Feature）

**建议修复**：

在 `scoreGenes()` 中接入表观遗传加成：

```typescript
function scoreGenes(genes: Gene[], signals: Signal[], env?: EnvFingerprint): ScoredGene[] {
  return genes.map(gene => {
    // 信号匹配基础分
    let score = gene.signals_match.reduce((acc, pattern) => {
      if (matchPatternToSignals(pattern, signals)) return acc + 1;
      return acc;
    }, 0);

    // 蒸馏基因折扣
    if (gene.id.startsWith(DISTILLED_PREFIX)) {
      score *= DISTILLED_SCORE_FACTOR;
    }

    // 表观遗传加成
    if (env) {
      score += getEpigeneticBoost(gene, env);
    }

    return { gene, score, matchedSignals: [...] };
  });
}
```

需同时修改 `selectGene()` 的签名以接受 `EnvFingerprint` 参数。

---

### 跨模块问题：基因优胜劣汰机制总体评估

**设计意图**：系统设计了五种进化压力机制，形成完整的优胜劣汰循环。

**实际状态**：

| 机制 | 模块 | 设计意图 | 实际状态 |
|------|------|---------|---------|
| 信号匹配评分 | gene-selector | 匹配度高的基因得分高 | ✅ 生效，但区分度差（2.1/2.2） |
| 表观遗传加成 | epigenetic → gene-selector | 历史表现好的基因加分 | ❌ 写入了但选择时未读取（2.8） |
| 漂移探索 | gene-selector | 小群体多尝试新基因 | ✅ 生效，但不可控（2.3） |
| 基因禁止 | gene-selector | 反复失败的基因被禁 | ❌ Jaccard 计算失效（2.6） |
| 蒸馏创新 | skill-distiller | 从成功经验诞生新基因 | ⚠️ 逻辑完整但蒸馏基因永远打折，无法超越原始基因 |
| 自动淘汰 | — | 持续低效的基因被移除 | ❌ 不存在，仅有手动软删除 |

**结论**：真正起作用的只有"信号匹配评分 + 漂移"，四个负反馈/正反馈机制中有三个处于失效或断裂状态。这意味着基因池实际上没有自我优化能力——不论表现好坏，基因的选择概率基本不变。

---

## 模块 3：Capsule Manager（胶囊匹配与复用）

文件：`core/capsule-manager.ts`

> **总体评价**：相对健全的模块。评分算法考虑了信号匹配、环境兼容性和成功率三个维度；复用决策有清晰的四道关卡。主要问题来自对 `matchPatternToSignals` 的复用（继承了 2.1 的问题），以及一些辅助功能未接入核心流程。

### 问题 3.1 🟡 继承了 Gene Selector 的 `includes()` 匹配问题

**位置**：`core/capsule-manager.ts:56-60`

**描述**：

`selectCapsule` 和 `findMatchingCapsules` 复用 `matchPatternToSignals()`，继承了问题 2.1 的所有交叉污染问题。trigger 为 `["error"]` 的胶囊会匹配所有包含 "error" 子串的信号。

**建议**：随 2.1 一起修复，无需额外改动。

---

### 问题 3.2 🟡 `selectCapsule` 不预先过滤已删除和失败的胶囊

**位置**：`core/capsule-manager.ts:46-91`

**描述**：

`selectCapsule()` 对所有传入胶囊评分，包括 `_deleted=true` 和 `outcome.status='failed'` 的。失败胶囊虽然因 `successWeight=0.5` 被降权，但信号和环境分足够高时仍可被选中。选中后虽然 `shouldReuseCapsule` 会拒绝复用，但该胶囊仍会被传入 LLM 提示中作为"参考方案"——一个已知失败的方案作为参考可能误导 LLM。

**建议修复**：

在评分前预过滤：

```typescript
export function selectCapsule(capsules, signals, currentEnv) {
  const activeCapsules = capsules.filter(c => !c._deleted && c.outcome.status !== 'failed');
  if (activeCapsules.length === 0) return undefined;
  // ...对 activeCapsules 评分
}
```

---

### 问题 3.3 🟡 `selectCapsule` 与 `shouldReuseCapsule` 环境检查逻辑不一致

**位置**：
- `selectCapsule`：`capsule-manager.ts:62-68`（平台不匹配仅降分）
- `shouldReuseCapsule` → `checkEnvironmentCompatibility`：`capsule-manager.ts:201-211`（平台不匹配直接拒绝）

**描述**：

`selectCapsule` 中环境不匹配只是不加环境分（0 分），胶囊仍可凭信号分被选中。但 `shouldReuseCapsule` 中平台不匹配直接拒绝。这导致可能选出一个 darwin 平台的胶囊（信号分够高），随后被复用决策拒绝，白做一轮评分。

更严重的是，在进化引擎中，即使 `shouldReuseCapsule` 返回 `shouldReuse: false`，该胶囊仍会被写入 LLM 提示（`buildEvolutionPrompt` 中的 "Similar Capsule Available" 部分），只是不带"推荐复用"标记。这意味着一个环境不兼容的胶囊会影响 LLM 的决策。

**建议修复**：

在 `selectCapsule` 中也将平台不匹配的胶囊排除（或至少大幅降权），使两层检查的严格程度一致。

---

### 问题 3.4 🟢 `calculateCapsuleHealth` 和 `analyzeCapsules` 是未接入的功能

**位置**：`core/capsule-manager.ts:266-321`

**描述**：

这两个函数有完整的实现和测试（测试覆盖率很高），但在核心进化流程中**没有任何地方调用**。`selectCapsule` 不用健康度，进化引擎不用统计信息做决策。

如果是为 Dashboard 或未来的胶囊淘汰准备的，建议在代码中注明设计意图，避免被误认为死代码而删除。

---

### 问题 3.5 🔴 胶囊置信度是静态的，不随使用反馈更新——复用反馈回路断裂

**位置**：
- 创建端：`core/evolution-engine.ts:538-559`（`confidence: 0.7` 硬编码）
- 存储层：`storage/capsule-store.ts:81-85`（`update()` 方法存在）
- 调用端：仅 `server.ts:913-914`（外部 API `PUT /api/v1/capsules/:id`）
- 进化引擎：**无任何调用 `capsuleStore.update()` 的代码**

**描述**：

胶囊创建后 `confidence` 值永远不变。`CapsuleStore` 虽然提供了 `update()` 方法，但**进化引擎内部从不调用它**——唯一的调用来自外部 HTTP API（手动 PUT 更新和软删除）。

完整的反馈断裂链路：

```
胶囊创建 → confidence = 0.7（硬编码）
  → 被选中并复用 → 进化成功/失败
  → 进化引擎记录 EvolutionEvent
  → 但 不更新原胶囊的 confidence ❌
  → 不更新原胶囊的 outcome ❌
  → 不调用 capsuleStore.update() ❌
  → 下次选择时，该胶囊的 confidence 仍然是 0.7
```

同理，`outcome.score` 也是创建时硬编码为 `0.9`，永远不变。

**影响**：

- 一个多次被验证成功的优质胶囊永远无法提升到 0.7 以上
- 一个初始 confidence < 0.6 的胶囊（如从外部 Hub 导入）永远不会被推荐复用，即使它每次都成功
- 结合问题 2.8（基因表观遗传标记也不被读取），整个系统**没有任何从结果到选择的正反馈/负反馈闭环**

**建议修复**：

1. 在进化引擎中，当使用了已有胶囊时，根据结果更新其 confidence 并持久化：

```typescript
// evolution-engine.ts — 进化完成后
if (capsule && this.capsuleStore) {
  const delta = outcomeStatus === 'success' ? 0.03 : outcomeStatus === 'failed' ? -0.08 : 0;
  capsule.confidence = Math.max(0, Math.min(1, capsule.confidence + delta));
  capsule.outcome = { status: outcomeStatus, score: validationScore };
  capsule.metadata.updated_at = new Date().toISOString();
  await this.capsuleStore.update(capsule);
}
```

2. 确保 `CapsuleStore.add()` 不再静默跳过已存在的胶囊（当前逻辑：已存在则 skip），否则更新后的胶囊无法通过 `add` 保存

### 跨模块问题：系统反馈回路完整性评估

**核心发现**：整个系统**没有任何有效的"从执行结果到选择权重"的闭环反馈机制**。

#### 数值更新时机追踪

| 数值 | 写入时机 | 是否持久化 | 读取时机 | 闭环状态 |
|------|---------|-----------|---------|---------|
| Gene.epigenetic_marks | 每次进化后 `applyEpigeneticMarks()` | ✅ `geneStore.upsert()` | ❌ `scoreGenes()` 从不调用 `getEpigeneticBoost()` | **断裂** |
| Gene.fitness / weight | — | — | — | **字段不存在** |
| Capsule.confidence | 仅创建时硬编码 `0.7` | ✅ `capsuleStore.add()` | ✅ 选择/复用时读取 | **只读不写** |
| Capsule.outcome.score | 仅创建时硬编码 `0.9` | ✅ `capsuleStore.add()` | ✅ 选择评分时读取 | **只读不写** |
| CapsuleStore.update() | 仅外部 API（`PUT /api/v1/capsules/:id`）调用 | ✅ | — | **内部无调用** |

#### 反馈路径设计 vs 实现

```
设计意图：
  进化成功 → 基因加分 + 胶囊提升置信度 → 下次优先选择 → 正反馈 ✓
  进化失败 → 基因减分 + 胶囊降低置信度 → 下次避开选择 → 负反馈 ✓
  反复失败 → 基因被禁止 → 不再被选择 → 淘汰机制 ✓

实际实现：
  进化成功 → 基因写入 epigenetic mark（+0.05）→ 选择时不读取 ❌ → 无影响
           → 胶囊 confidence 不变 ❌ → 无影响
  进化失败 → 基因写入 epigenetic mark（-0.1）→ 选择时不读取 ❌ → 无影响
           → 胶囊 confidence 不变 ❌ → 无影响
           → failedCapsules 记录 → ban 计算因命名空间不一致而失效（2.6）❌
```

**结论**：系统实质上处于"无记忆"状态——无论一个基因/胶囊过去表现如何，对其未来被选中的概率没有任何影响。当前唯一起作用的选择因素是**信号模式匹配计数 + 随机漂移**，这两个都是无状态的。

**修复路线**（建议按顺序实施）：

1. **P0**：`scoreGenes()` 中接入 `getEpigeneticBoost()`（修复 2.8），立即激活基因正负反馈
2. **P0**：修复 `banGenesFromFailedCapsules` 的 Jaccard 计算（修复 2.6），激活基因淘汰
3. **P0**：进化引擎中增加对已使用胶囊的 confidence/outcome 更新并调用 `capsuleStore.update()`（修复 3.5），激活胶囊正负反馈
4. **P1**：考虑增加基因自动淘汰机制——当 epigenetic 累积惩罚超过阈值时标记基因为 deprecated

---

## 模块 4：Validation Gate（安全校验门）

文件：`core/validation-gate.ts`

> **总体评价**：安全校验由四个功能块组成——命令白名单、影响范围估算、审批决策、验证执行。总体设计思路正确（白名单 → 影响评估 → 审批 → 执行），但在安全边界定义、功能接入完整性和失败恢复方面存在较多问题。作为安全关键模块，缺少测试文件是最大的风险点。

### 问题 4.1 🔴 命令白名单存在多个绕过路径

**位置**：`core/validation-gate.ts:27-55`

**描述**：

`isValidationCommandAllowed()` 的安全规则存在多个绕过漏洞：

**4.1a — `node -e` 可执行任意代码**：
```
"node -e \"require('child_process').execSync('cat /etc/passwd')\""
"node -e \"process.env\""   // 泄露环境变量
```
通过白名单检查（以 `node` 开头，无 shell 操作符），但可以执行任何 Node.js 代码。

**4.1b — `npx` 可下载并执行任意 npm 包**：
```
"npx some-malicious-package"
```
白名单允许 `npx` 前缀，但 `npx` 会自动下载并执行任何 npm 包，等于绕过了整个安全机制。

**4.1c — `rm -rf` 检测可被绕过**：
```
"rm\t-rf"           // 用 tab 代替空格
"rm --recursive --force"  // 用长参数名
```
正则 `/rm\s+-rf/` 要求 `rm` 后跟 `\s+`（一个或多个空白字符），但 tab 字符也属于 `\s`，这个其实能匹配到。真正能绕过的是长参数格式 `--recursive --force`。

**影响评估**：实际风险取决于 `gene.validation` 的来源。种子基因（`seed-genes.json`）由人工编写，当前都是 `"npm test"` 或 `"npm run build"` 这种安全命令。但如果蒸馏基因（`skill-distiller.ts`）或外部 Hub 导入的基因包含恶意 validation 命令，白名单无法拦截。

**建议修复**：

1. 增加 `node -e` / `node --eval` 检查：

```typescript
if (/^node\s+(-e|--eval)\b/.test(command)) {
  return false;
}
```

2. 将 `npx` 限制为已知安全的包名白名单，或要求包名匹配特定前缀：

```typescript
const allowedNpxPackages = ['jest', 'vitest', 'eslint', 'prettier', 'tsc'];
if (/^npx\s/.test(command)) {
  const pkg = command.split(/\s+/)[1];
  if (!allowedNpxPackages.includes(pkg)) return false;
}
```

3. 增加 `rm --recursive` 等长参数名检测

---

### 问题 4.2 🟡 `checkPathSafety` 已完整实现但从未被调用

**位置**：
- 实现：`core/validation-gate.ts:236-281`
- 进化引擎实际使用：`core/evolution-engine.ts:441-444`

**描述**：

`checkPathSafety()` 提供了三层检查：
1. 路径遍历检测（`../../../etc/passwd`）
2. 禁止路径检查
3. 敏感文件警告（`.env`, `.pem`, `.key`, `secrets.json`, `credentials`）

但进化引擎中使用的路径检查是自己写的简化版，只做 `forbidden_paths` 子串匹配，**缺少路径遍历检测和敏感文件警告**。

`checkPathSafety` 实际上是死代码。

**建议修复**：

在 `validateChanges()` 中用 `checkPathSafety()` 替换手写的简化检查：

```typescript
const pathCheck = checkPathSafety(
  changes.map(c => c.file),
  process.cwd(),
  this.config.forbidden_paths
);
if (!pathCheck.safe) return false;
if (pathCheck.warnings.length > 0) {
  console.warn('[Security] Sensitive files accessed:', pathCheck.warnings);
}
```

---

### 问题 4.3 🟡 路径检查重复三遍且逻辑不一致

**位置**：
- 第一次：`evolution-engine.ts:386-394`（LLM 生成后过滤，静默移除）
- 第二次：`evolution-engine.ts:441-444`（validateChanges 中，整体失败）
- 第三次：`validation-gate.ts:236-281`（checkPathSafety，从未调用）

**描述**：

| 检查点 | 方式 | 行为 | 问题 |
|--------|------|------|------|
| 步骤6 LLM后过滤 | `includes()` 子串匹配 | 静默移除变更 | 步骤9检查冗余 |
| 步骤9 validateChanges | `includes()` 子串匹配 | 返回 false | 步骤6已过滤，永远不会触发 |
| checkPathSafety | 路径遍历 + 禁止路径 + 敏感文件 | 返回详细报告 | 从未被调用 |

**实际问题**：

1. 步骤9的检查是冗余的——步骤6已经过滤掉了所有 forbidden_paths 的文件
2. `includes()` 匹配 `".git"` 会误拦 `.github/` 或 `.gitignore` 相关路径
3. 最完善的检查函数（`checkPathSafety`）反而没被使用

**建议修复**：

1. 合并为一次检查，使用 `checkPathSafety` 作为统一入口
2. `forbidden_paths` 改用精确匹配或路径前缀匹配，避免 `includes()` 的误拦

---

### 问题 4.4 🟡 审批被拒后直接抛异常，LLM 结果全部丢弃

**位置**：`core/evolution-engine.ts:195-197`

**描述**：

```typescript
if (needsApproval) {
  throw new Error(`Approval required: ${blastRadius.riskLevel} risk level`);
}
```

当影响范围超限时，进化引擎直接抛异常。此时 LLM 已经完成了生成（步骤6，消耗了 API 调用和时间），生成的变更被全部丢弃，没有：
- 暂存变更等待人工审批
- 让 LLM 重新生成更小范围变更的重试
- 将变更拆分为多个小批次

更严重的是，这个异常进入 `catch` 块后会被记录为失败事件，并把基因加入 `failedCapsules` 列表（第 247-252 行）。一个因为"改动太大"而被拒绝的进化，本质上不是基因策略问题，但会被错误地归因为基因失败。

**建议修复**：

1. 区分"需要审批"和"执行失败"两种异常类型
2. 审批异常不应记入 failedCapsules
3. 考虑支持暂存/排队机制

```typescript
export class ApprovalRequiredError extends Error {
  constructor(
    public readonly blastRadius: BlastRadiusEstimate,
    public readonly pendingChanges: EvolutionChange[]
  ) {
    super(`Approval required: ${blastRadius.riskLevel} risk level`);
    this.name = 'ApprovalRequiredError';
  }
}

// catch 块中区分处理
} catch (error) {
  if (error instanceof ApprovalRequiredError) {
    // 不记入 failedCapsules，返回待审批状态
    return { status: 'pending_approval', changes: error.pendingChanges, blastRadius: error.blastRadius };
  }
  // 真正的失败才记录
  this.failedCapsules.push({ ... });
}
```

---

### 问题 4.5 🟢 风险评级忽略文件重要性，`testFilesOnly` / `configFilesOnly` 计算了但未使用

**位置**：`core/validation-gate.ts:156-176`

**描述**：

`estimateBlastRadius` 计算了 `testFilesOnly` 和 `configFilesOnly` 标志，但风险评级（`riskLevel`）只看文件数和行数。修改 20 个测试文件 = `critical`，修改 1 个核心配置 = `low`——实际风险与评级不符。

**建议修复**：

`testFilesOnly` 为 true 时降一级风险评级，`configFilesOnly` 为 true 时升一级：

```typescript
if (testFilesOnly && riskLevel !== 'low') {
  riskLevel = riskLevel === 'critical' ? 'high' : riskLevel === 'high' ? 'medium' : 'low';
}
if (configFilesOnly && riskLevel !== 'critical') {
  riskLevel = riskLevel === 'low' ? 'medium' : riskLevel === 'medium' ? 'high' : 'critical';
}
```

---

### 问题 4.6 🟢 `executeValidation` 忽略了 `maxConcurrent` 配置

**位置**：`core/validation-gate.ts:298-302, 351-362`

**描述**：

`ValidationExecutorConfig` 接口定义了 `maxConcurrent: number`，默认值为 3。但 `executeValidation` 中命令执行使用纯串行的 `for...of` + `await`，没有任何并发控制逻辑。`maxConcurrent` 是个完全无效的配置项。

**建议修复**：

要么实现并发控制（使用 `Promise.allSettled` + 分批），要么从接口中删除 `maxConcurrent` 字段，避免给调用者造成虚假的配置信心。

---

### 问题 4.7 🟡 安全关键模块缺少测试文件

**描述**：

`validation-gate.ts` 没有对应的 `validation-gate.test.ts`。作为安全关键模块，以下边界情况需要测试覆盖：
- 命令白名单的各种绕过路径（`node -e`、`npx malicious-pkg`、Unicode 编码等）
- `forbidden_paths` 包含 `.git` 时对 `.github/` 路径的误拦
- 路径遍历检测（`../../etc/passwd`）
- 空输入/极端输入的处理

---

## 模块 5：Epigenetic（表观遗传标记）

文件：`core/epigenetic.ts`

> **总体评价**：项目中代码质量最高、设计最清晰的模块。177 行，三个核心函数各司其职，常量命名和注释都很规范。核心问题不在模块自身，而在于与系统的集成——`getEpigeneticBoost` 未被调用（问题 2.8 已记录）、`pruneExpiredMarks` 未接入流程。模块自身存在一些参数设计和环境指纹精度的问题。

### 问题 5.1 🟡 最大标记数过小，且按全局时间淘汰导致跨环境失真

**位置**：`core/epigenetic.ts:30, 101-104`

**描述**：

`EPIGENETIC_MAX_MARKS = 10`，超出后移除最旧的标记。但淘汰是全局的，不区分环境。

假设一个基因在 3 个环境中使用（linux/x64、darwin/arm64、win32/x64）：
- 平均每个环境只有 ~3 个标记
- linux 上如果用了 8 次（最早的 linux 标记很旧），win32 只用了 2 次
- 淘汰时 linux 的早期标记先被删除，win32 的标记完整保留
- 结果：linux 环境下的适应度判断只基于最近 2-3 次，而 win32 保留了全部历史

**建议修复**：

按 `env_hash` 分组淘汰，每个环境保留最近 N 条（如 5 条）：

```typescript
function pruneMarks(marks: EpigeneticMark[], maxPerEnv: number = 5): EpigeneticMark[] {
  const byEnv = new Map<string, EpigeneticMark[]>();
  for (const m of marks) {
    const list = byEnv.get(m.env_hash) || [];
    list.push(m);
    byEnv.set(m.env_hash, list);
  }
  const result: EpigeneticMark[] = [];
  for (const [, list] of byEnv) {
    result.push(...list.slice(-maxPerEnv));
  }
  return result;
}
```

---

### 问题 5.2 🟡 环境指纹哈希与实际采集的字段不匹配

**位置**：
- 哈希计算：`core/epigenetic.ts:40-55`（使用 `platform, arch, node_version, git_branch`）
- 实际采集：`core/evolution-engine.ts:580-587`（设置 `platform, arch, node_version, working_dir`，无 `git_branch`）

**描述**：

哈希函数使用四个因子：`platform + arch + node_version + git_branch`。但进化引擎的 `getEnvFingerprint()` 从未设置 `git_branch`（使用默认空字符串），却设置了 `working_dir`（不参与哈希）。

**结果**：
- 同一台机器、不同项目目录产生**相同**的环境哈希
- 同一目录、不同 git 分支也产生**相同**的环境哈希（因为 `git_branch` 始终为空）
- 环境区分度退化为 `platform + arch + node_version`

**建议修复**：

1. `getEnvFingerprint()` 中增加 `git_branch` 采集（通过 `git rev-parse --abbrev-ref HEAD`）
2. `hashEnvFingerprint()` 中加入 `working_dir`
3. 或者简化：让哈希函数遍历所有非 undefined 的字段，而非硬编码特定字段

---

### 问题 5.3 🟢 成功/失败惩罚不对称，缺乏设计说明和可配置性

**位置**：`core/epigenetic.ts:15-18`

**描述**：

- 成功 `+0.05`，失败 `-0.1`（惩罚 = 奖励 × 2）
- 需连续成功 2 次才能抵消 1 次失败
- 结合 `MAX_MARKS = 10`：10 次全成功 = `+0.5`（上限），5 次失败就 = `-0.5`（下限）
- 平衡点约在 67% 成功率

这种非对称设计可能是有意的保守策略，但没有注释说明理由。参数完全硬编码，不同场景下可能需要不同的惩罚比例。

**建议修复**：

将常量移入可配置对象，并补充设计理由注释。

---

### 问题 5.4 🟡 `pruneExpiredMarks` 从未在核心流程中被调用

**位置**：
- 实现：`core/epigenetic.ts:164-176`
- 导出：`index.ts:25, 668`
- 核心流程调用：**无**

**描述**：

`pruneExpiredMarks` 只在 `index.ts` 中导出供外部使用，进化引擎内部从未调用。过期标记会一直留在基因数据中，占据 `MAX_MARKS = 10` 的名额。虽然 `getEpigeneticBoost` 在计算时跳过过期标记，但过期标记占位会导致有效标记被挤掉。

**示例场景**：

```
基因有 10 个标记，其中 7 个已过期（>90天）、3 个有效
  → 新进化完成，applyEpigeneticMarks 追加第 11 个标记
  → 触发 MAX_MARKS 淘汰，移除最旧的（第1个已过期标记）
  → 结果：仍有 6 个过期标记占位，有效标记只有 4 个
  → 如果先清理过期标记：只有 3 个有效 + 1 个新标记 = 4 个，远未触及上限
```

**建议修复**：

在 `applyEpigeneticMarks` 内先清理过期标记再追加：

```typescript
export function applyEpigeneticMarks(gene, envFingerprint, outcome) {
  // 先清理过期标记
  pruneExpiredMarks(gene);
  // 再追加新标记
  // ...
}
```

---

### 问题 5.5 🟡 无测试文件

**描述**：

缺少 `epigenetic.test.ts`。需要测试覆盖的关键场景：
- 衰减计算在边界时间点（0 天 / 45 天 / 90 天 / 91 天）的正确性
- 多环境标记在 MAX_MARKS 淘汰时的公平性
- `hashEnvFingerprint` 的碰撞概率（不同环境是否产生不同哈希）
- `pruneExpiredMarks` 只移除过期标记、不影响有效标记
- boost 上下限（-0.5 / +0.5）是否正确 clamp

## 模块 6：Skill Distiller（知识蒸馏）

文件：`core/skill-distiller.ts`

> **总体评价**：设计思路最有野心的模块——从成功胶囊中自动发现新模式并创建新基因。两阶段架构（prepare → LLM → complete）解耦合理，数据收集和模式分析逻辑清晰。但存在未接入主循环、分析方法粗糙、LLM 输出验证不充分等问题。蒸馏基因的永久 8 折惩罚与表观遗传反馈断裂叠加，导致创新成果几乎无法在竞争中胜出。

### 问题 6.1 🟡 蒸馏未接入进化引擎主循环，仅有 API 手动触发

**位置**：
- 占位代码：`core/evolution-engine.ts:237-240`
- API 入口：`server.ts:469-482`

**描述**：

进化引擎第 15 步只有一行 `console.log('[EvolutionEngine] distiller check would run here')` 占位。蒸馏只能通过外部 API（`POST /api/v1/distill/prepare` 和 `/api/v1/distill/complete`）手动触发。

如果没有外部运维脚本或 agent 定期调用这些 API，系统永远不会自动产生新基因。

**建议修复**：

在进化成功后自动执行 `shouldDistill` 检查，满足条件时自动进入蒸馏流程：

```typescript
if (validationPassed && this.llmProvider) {
  const distillResult = await prepareDistillation(capsules, genes, outputDir);
  if (distillResult) {
    const response = await this.llmProvider.generateObject({ prompt: distillResult.prompt });
    const newGene = completeDistillation(response, existingGenes, sourceCapsuleIds);
    if (newGene.success) await this.geneStore.upsert(newGene.gene);
  }
}
```

---

### 问题 6.2 🟡 策略漂移检测只比较首尾两个胶囊，且未按时间排序

**位置**：`core/skill-distiller.ts:190-203`

**描述**：

漂移检测用"第一个胶囊 vs 最后一个胶囊"的 Jaccard 相似度判断。存在三个子问题：

1. **胶囊未排序**——`collectDistillationData` 中胶囊按遍历顺序收集，"第一个"和"最后一个"不一定是时间最早和最晚的
2. **只看两端**——中间的变化被完全忽略。如果基因先处理 A 类问题 → 中间转向 B 类 → 又回到 A 类，首尾 Jaccard 很高但实际存在漂移
3. **继承 `computeSignalOverlap` 的精确匹配问题**——`"error_timeout"` 和 `"timeout"` 不算重叠（问题 2.6）

**建议修复**：

1. 按时间排序胶囊
2. 使用滑动窗口计算相邻胶囊对之间的平均 Jaccard，更准确地反映漂移趋势

---

### 问题 6.3 🟡 覆盖缺口检测使用精确匹配，与基因选择的 `includes()` 不一致

**位置**：`core/skill-distiller.ts:214-228`

**描述**：

覆盖缺口检测用 `Set.has()`（精确匹配）检查信号是否被基因覆盖。但基因选择用 `includes()`（子串匹配）。

示例：基因 `gene_repair_general` 有 pattern `"error"`，信号 `"error_timeout"` 在基因选择时**会被匹配到**（`"error_timeout".includes("error")`），但覆盖缺口检测中 `coveredSignals.has("error_timeout")` 返回 `false`。

结果：蒸馏器会为已经被子串匹配覆盖的信号创建新基因，产生不必要的冗余。

**建议修复**：

覆盖检查应使用与 `matchPatternToSignals` 一致的匹配逻辑：

```typescript
const isSignalCovered = (signal: string) =>
  existingGenes.some(gene =>
    gene.signals_match.some(pattern =>
      signal.toLowerCase().includes(pattern.toLowerCase())
    )
  );
```

---

### 问题 6.4 🟡 `validateSynthesizedGene` 对 LLM 输出缺少基本结构验证

**位置**：`core/skill-distiller.ts:349-440`

**描述**：

函数接收 `any` 类型输入，只验证了 4 个条件（ID 前缀、max_files、forbidden_paths、信号重叠），但**缺少 Gene 基本结构验证**：

| 字段 | 是否验证 | 缺失时行为 |
|------|---------|-----------|
| `type` | ❌ | 强制设为 `'Gene'` |
| `category` | ❌ | 默认 `'repair'` |
| `signals_match` | ❌ | 默认 `[]`（空数组 = 永远不匹配 = 死基因）|
| `strategy` | ❌ | 默认 `[]`（空策略 = 没有指导）|
| `schema_version` | ❌ | 未设置 |

一个 `signals_match: []` 的蒸馏基因会通过验证但永远不被选中，占据基因池空间。

**建议修复**：

增加基本结构检查：

```typescript
if (!Array.isArray(gene.signals_match) || gene.signals_match.length === 0) {
  errors.push('signals_match must be a non-empty array');
}
if (!Array.isArray(gene.strategy) || gene.strategy.length === 0) {
  errors.push('strategy must be a non-empty array');
}
const validCategories = ['repair', 'optimize', 'feature', 'security', 'performance', 'refactor', 'test'];
if (!validCategories.includes(gene.category)) {
  errors.push(`category must be one of: ${validCategories.join(', ')}`);
}
```

项目已有 `zod`，也可以用 zod schema 做完整验证。

---

### 问题 6.5 🟡 蒸馏基因永久 8 折惩罚 + 表观遗传断裂 = 创新死亡

**关联**：问题 2.7（折扣硬编码）、2.8（表观遗传不生效）

**描述**：

蒸馏基因在选择时永远被打 `DISTILLED_SCORE_FACTOR = 0.8` 折。正常情况下，表观遗传加成（如果生效的话）可以通过反复成功来弥补这个 20% 的劣势。但由于 2.8（加成不被读取），蒸馏基因**永远**无法通过"证明自己"来消除折扣。

从系统进化的角度看：
- 蒸馏是系统的唯一创新来源
- 创新产物永远被打压，无法通过表现提升地位
- 构成**创新惩罚**——系统越创新越不利

**建议修复**：

1. 优先修复 2.8（接入表观遗传加成），使蒸馏基因可以通过成功积累优势
2. 考虑设置折扣衰减：随着蒸馏基因成功次数增加，折扣逐渐减小直至消除

```typescript
function getDistilledFactor(gene: Gene): number {
  if (!gene.id.startsWith(DISTILLED_PREFIX)) return 1.0;
  const successCount = gene.epigenetic_marks?.filter(m => m.outcome === 'success').length || 0;
  return Math.min(1.0, DISTILLED_SCORE_FACTOR + successCount * 0.04);
}
```

---

### 问题 6.6 🟢 模块级全局状态 `lastDistillationTime`，多实例不安全

**位置**：`core/skill-distiller.ts:52`

**描述**：

`lastDistillationTime` 是模块级全局变量。多个 `LocalEvomap` 实例共享同一个冷却时间——一个实例蒸馏后，所有实例都要等 24 小时。虽然当前是单实例部署，但如果扩展到多租户场景会出问题。

**建议修复**：

将 `lastDistillationTime` 移入 `LocalEvomap` 实例或蒸馏器实例中。

---

### 问题 6.7 🟡 无测试文件

**描述**：

缺少 `skill-distiller.test.ts`。关键需要覆盖的场景：
- `shouldDistill` 各条件组合（环境变量、间隔、胶囊数、成功率）
- `analyzePatterns` 的策略漂移检测和覆盖缺口检测
- `validateSynthesizedGene` 对各种畸形 LLM 输出的处理（空 JSON、缺字段、类型错误等）
- `extractJsonFromResponse` 的各种 JSON 提取场景（纯 JSON、markdown 包裹、前后文本）

## 模块 7：Evolution Engine（进化引擎主循环）

文件：`core/evolution-engine.ts`（607 行）、测试：`core/evolution-engine.test.ts`

> **总体评价**：作为全系统的中枢编排器，15 步进化循环的设计清晰、步骤间职责分明。测试覆盖度在所有模块中最高（10 个测试用例）。大部分严重问题已在上游模块中记录（信号匹配 2.1、表观遗传断裂 2.8、反馈回路断裂 3.5、路径检查重复 4.3、审批异常 4.4 等），以下聚焦引擎自身的设计问题。

### 问题 7.1 🟡 基因池和胶囊池在初始化后不自动刷新

**位置**：
- 初始化：`index.ts:117-123`（`init()` 中一次性加载）
- 进化引擎：`evolution-engine.ts:91-92, 127-136`

**描述**：

`genePool` 和 `capsulePool` 在 `init()` 时从存储加载一次，之后进化引擎使用的是内存中的快照。虽然 `addGene()` 和 `addCapsule()` 会刷新基因池（通过重新 `getAll()`），但以下场景中池不会刷新：

1. **进化成功创建新胶囊后**（第 12 步 `createCapsuleFromSuccess`）——新胶囊被持久化到 `capsuleStore`，但 `capsulePool` **没有更新**。下一次 `selectCapsule()` 看不到刚创建的胶囊。
2. **表观遗传标记更新后**——基因通过 `geneStore.upsert()` 持久化，但其他可能持有相同基因引用的代码不一定看到最新数据。
3. **外部通过 API 删除/更新基因或胶囊后**——进化引擎的内存池不变。

**影响**：

进化成功后产出的胶囊，下一次进化时无法被选中复用，需要等到系统重启或外部调用 `addCapsule` 才能进入池。

**建议修复**：

在 `createCapsuleFromSuccess` 成功后更新 `capsulePool`：

```typescript
if (this.capsuleStore) {
  await this.capsuleStore.add(capsule);
  this.capsulePool.push(capsule);  // ← 增加这一行
}
```

或在每次 `evolve()` 开始时从存储重新加载（会增加 I/O 开销，可通过缓存策略缓解）。

---

### 问题 7.2 🟡 `rollbackEnabled`、`rollbackStrategy`、`cacheEnabled`、`cacheTtlMs` 配置项定义了但完全未实现

**位置**：`core/evolution-engine.ts:39-46`

**描述**：

```typescript
export interface EvolutionEngineConfig extends EvolutionConfig {
  rollbackEnabled: boolean;
  rollbackStrategy: 'full' | 'partial' | 'none';
  cacheEnabled: boolean;
  cacheTtlMs: number;
}
```

这四个配置项在接口中定义为必填（非 optional），测试中也必须传入（`rollbackEnabled: false, cacheEnabled: false`），但整个引擎代码中**从未读取或使用**这些字段。

**影响**：
- 配置者以为设置了回滚策略，实际没有任何回滚机制
- 测试中为满足类型约束传入的 `rollbackEnabled: false` 给人"回滚可关闭"的假象
- 增加了每个 config 构造的样板代码

**建议修复**：

要么实现回滚和缓存功能，要么将这些字段改为 optional 并标注为 `@planned` / `@todo`，避免误导使用者。

---

### 问题 7.3 🟡 `outcome.score` 硬编码为 0.9 或 0.0，无实际评分逻辑

**位置**：`core/evolution-engine.ts:479-480, 551-553`

**描述**：

进化事件和新胶囊的 `outcome.score` 只有两种值：
- 验证通过 → `score: 0.9`
- 验证失败 → `score: 0.0`

没有任何中间值，没有基于变更质量、LLM 置信度、信号匹配精确度的评分。LLM 返回的 `confidence` 字段虽然被打印（第 384 行），但**没有参与评分**。

这个 `0.9` 还会影响下游：
- 胶囊选择中 `outcome.score` 参与评分权重
- 蒸馏器的 `collectDistillationData` 按 `outcome.score` 排序取 top-5 样本——但所有成功胶囊的 score 都是 0.9，排序等于无效

**建议修复**：

利用 LLM 返回的 `confidence` 和变更的影响范围综合计算：

```typescript
const score = validationPassed
  ? Math.min(0.95, (llmConfidence * 0.6 + validationScore * 0.4))
  : 0.0;
```

---

### 问题 7.4 🟡 验证失败时仍记录为正常事件而非触发重试或降级

**位置**：`core/evolution-engine.ts:199-210`

**描述**：

当 `validateChanges()` 返回 `false` 时（验证命令不通过或路径不安全），引擎的行为是：
- 设置 `validationPassed = false`
- 构建事件（`status: 'failed'`）
- 记录事件
- 创建失败的表观遗传标记
- 正常返回结果

没有：
- 重试机制（让 LLM 基于验证失败信息重新生成）
- 降级策略（缩小变更范围后重试）
- 回滚（配置项存在但未实现，见 7.2）

一次 LLM 调用的成本（时间 + API 费用）在验证失败时被完全浪费。

**建议修复**：

至少支持简单重试：将验证失败的信息反馈给 LLM，限制最多重试 N 次。

---

### 问题 7.5 🟢 新胶囊的 trigger 截取前 5 个信号，丢失完整上下文

**位置**：`core/evolution-engine.ts:542`

```typescript
trigger: signals.slice(0, 5),
```

创建胶囊时只保留前 5 个信号。如果 `prioritizeSignals` 的排序是合理的（P0 在前），这样做有一定道理。但如果关键信号在位置 6+，它们会被丢弃，导致后续胶囊匹配时无法被相同场景检索到。

**建议**：至少确保截取基于优先级排序后的结果（当前确实如此），并考虑根据信号优先级动态决定截取数量。

---

### 问题 7.6 🟢 `capsule_created` 仅在无已有胶囊时创建，复用场景下不记录

**位置**：`core/evolution-engine.ts:216-218`

```typescript
const capsule_created = (validationPassed && !capsule)
  ? await this.createCapsuleFromSuccess(gene, changes, this.state.signals)
  : null;
```

当选择了已有胶囊（`capsule !== null`）且验证通过时，**不创建新胶囊**。这意味着：
- 如果 LLM 基于已有胶囊做了改进/适配，改进后的版本不会被记录
- 结合 3.5（胶囊 confidence 不更新），复用成功也不会强化原胶囊

**建议**：复用成功时至少更新原胶囊的 confidence 和 outcome（已在 3.5 中建议）。

---

### 问题 7.7 🟢 `llmApiKey` 明文存储在配置对象中

**位置**：`core/evolution-engine.ts:36`

```typescript
llmApiKey?: string;
```

API Key 以明文 string 存在于 config 对象中，可能被日志、序列化或错误堆栈泄露。虽然这在很多项目中是常见做法，但作为安全敏感系统应尽量避免。

**建议**：通过环境变量读取而非配置传入，或使用 secrets manager 封装。

---

### 跨模块总结：进化引擎 15 步流程的完整健康度评估

| 步骤 | 功能 | 健康度 | 关联问题 |
|------|------|--------|---------|
| 1 | 信号提取 | ⚠️ | 1.1 无 schema 校验、1.3 误触发 |
| 2 | 基因选择 | ❌ | 2.1 子串污染、2.8 表观遗传断裂 |
| 3 | 胶囊匹配 | ⚠️ | 3.1 继承匹配问题、3.2 不过滤失败 |
| 4 | 复用决策 | ✅ | 基本正常 |
| 5 | 构建提示 | ✅ | 基本正常 |
| 6 | 执行进化（LLM）| ⚠️ | 路径过滤用 includes() |
| 7 | 影响范围估算 | ⚠️ | 4.5 不考虑文件重要性 |
| 8 | 审批检查 | ⚠️ | 4.4 拒绝后无恢复 |
| 9 | 验证 | ⚠️ | 4.1 白名单可绕过、4.2 checkPathSafety 死代码 |
| 10 | 构建事件 | ⚠️ | 7.3 score 硬编码 |
| 11 | 记录事件 | ✅ | 正常 |
| 12 | 创建胶囊 | ⚠️ | 7.1 不更新内存池、7.5 trigger 截断 |
| 13 | 表观遗传标记 | ⚠️ | 写入正常，但无读取端（2.8） |
| 14 | 持久化基因 | ✅ | 正常 |
| 15 | 蒸馏检查 | ❌ | 6.1 仅占位未实现 |

**总结**：15 步中只有 4 步（4, 5, 11, 14）完全健康，7 步存在不同程度的问题，2 步（基因选择、蒸馏）处于严重失效状态。

---

## 修复优先级建议

| 优先级 | 问题编号 | 描述 | 工作量 |
|--------|---------|------|-------|
| P0 | 1.1 | evolve 接口无 schema 校验 | 小 |
| P0 | 1.7 | 客户端/服务端信号命名不一致 | 中 |
| P0 | 2.1 | includes() 子串匹配导致基因交叉污染 | 中 |
| P0 | 2.6 | 基因禁止机制因命名空间不一致而失效 | 中 |
| P0 | 2.8 | 表观遗传标记写入但选择时未读取，适应度回路断裂 | 中 |
| P0 | 3.5 | 胶囊置信度静态不更新，复用反馈回路断裂 | 小 |
| P0 | 4.1 | 命令白名单可被 `node -e` / `npx` 绕过 | 中 |
| P1 | 1.2 | Signal 类型化 | 中 |
| P1 | 1.3 | 用户输入信号提取改进 | 中-大 |
| P1 | 1.6 | 信号置信度 | 大 |
| P1 | 2.2 | 评分计数无区分度，大数组基因占优 | 中 |
| P1 | 2.3 | 漂移不可测试不可复现 | 小 |
| P1 | 2.4 | preconditions 未参与选择 | 小 |
| P1 | 3.2 | selectCapsule 不过滤已删除和失败胶囊 | 小 |
| P1 | 3.3 | selectCapsule 与 shouldReuseCapsule 环境检查不一致 | 小 |
| P1 | 4.2 | checkPathSafety 完整实现但从未调用（死代码） | 小 |
| P1 | 4.3 | 路径检查重复三遍且逻辑不一致 | 小 |
| P1 | 4.4 | 审批拒绝后 LLM 结果丢弃且错误归因 | 中 |
| P1 | 4.7 | 安全关键模块缺少测试文件 | 中 |
| P1 | 5.1 | 表观遗传标记全局淘汰导致跨环境失真 | 小 |
| P1 | 5.2 | 环境指纹哈希字段与实际采集不匹配 | 小 |
| P1 | 5.4 | pruneExpiredMarks 从未在核心流程中调用 | 极小 |
| P1 | 5.5 | 表观遗传模块缺少测试文件 | 中 |
| P1 | 6.1 | 蒸馏未接入主循环，仅有 API 手动触发 | 中 |
| P1 | 6.2 | 策略漂移检测只比较首尾两个胶囊且未排序 | 小 |
| P1 | 6.3 | 覆盖缺口检测精确匹配与基因选择的 includes() 不一致 | 小 |
| P1 | 6.4 | 蒸馏基因验证缺少基本结构检查（空 signals_match 可通过）| 小 |
| P1 | 6.5 | 蒸馏基因永久 8 折 + 表观遗传断裂 = 创新死亡 | 中 |
| P1 | 6.7 | 蒸馏模块缺少测试文件 | 中 |
| P1 | 7.1 | 新胶囊创建后不更新内存池，下次进化看不到 | 小 |
| P1 | 7.3 | outcome.score 硬编码 0.9/0.0，无实际评分逻辑 | 中 |
| P1 | 7.4 | 验证失败无重试/降级，LLM 调用白白浪费 | 中 |
| P2 | 1.4 | 动态信号去重逻辑 | 小 |
| P2 | 1.5 | 性能阈值校验与配置化 | 小 |
| P2 | 2.5 | 错误处理依赖字符串匹配 | 小 |
| P2 | 4.5 | 风险评级忽略文件重要性 | 小 |
| P2 | 4.6 | maxConcurrent 配置无效 | 极小 |
| P3 | 1.8 | 冗余函数清理 | 极小 |
| P3 | 2.7 | 蒸馏基因折扣系数硬编码 | 极小 |
| P3 | 3.4 | capsuleHealth/analyzeCapsules 未接入核心流程 | 极小 |
| P3 | 5.3 | 成功/失败惩罚不对称且缺乏设计说明 | 极小 |
| P3 | 6.6 | 蒸馏冷却时间用模块级全局变量，多实例不安全 | 极小 |
| P3 | 7.2 | rollback/cache 配置项定义了但完全未实现 | 极小 |
| P3 | 7.5 | 新胶囊 trigger 截取前 5 个信号可能丢失上下文 | 极小 |
| P3 | 7.6 | 复用成功时不创建新胶囊也不更新原胶囊 | 极小 |
| P3 | 7.7 | llmApiKey 明文存储在配置对象中 | 极小 |
