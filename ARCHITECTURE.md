# 本地 Evomap 实现架构设计

## 1. 核心模块划分

```
capability/
├── core/
│   ├── gene-selector.ts      # 基因选择算法（群体遗传学）
│   ├── capsule-manager.ts    # 胶囊存储与检索
│   ├── signal-extractor.ts   # 信号提取引擎
│   ├── evolution-engine.ts   # 进化循环主控
│   └── validation-gate.ts    # 安全验证门控
├── storage/
│   ├── gene-store.ts         # 基因持久化
│   ├── capsule-store.ts      # 胶囊持久化
│   └── event-logger.ts       # 事件审计日志
├── prompts/
│   └── gep-prompt.ts         # 进化提示模板
├── types/
│   └── gene-capsule-schema.ts # 类型定义
├── config/
│   └── evolution-config.ts   # 配置管理
└── index.ts                  # 主入口
```

---

## 2. 核心算法实现要点

### 2.1 基因选择算法

```typescript
// core/gene-selector.ts

import type { Gene, SelectionOptions, SelectionResult, Signal } from '../types';

/**
 * 计算漂移强度
 * 小群体 = 更多探索，大群体 = 更多利用
 */
export function computeDriftIntensity(opts: SelectionOptions): number {
  const effectivePopulationSize = opts.effectivePopulationSize || opts.genePoolSize || 1;
  
  if (opts.driftEnabled) {
    return effectivePopulationSize > 1 
      ? Math.min(1, 1 / Math.sqrt(effectivePopulationSize) + 0.3) 
      : 0.7;
  }
  
  return Math.min(1, 1 / Math.sqrt(effectivePopulationSize));
}

/**
 * 多语言信号匹配
 * 支持 "error|错误 |エラー" 格式
 */
export function matchPatternToSignals(pattern: string, signals: Signal[]): boolean {
  if (pattern.includes('|')) {
    const branches = pattern.split('|').map(b => b.trim().toLowerCase());
    return branches.some(needle => 
      signals.some(s => s.toLowerCase().includes(needle))
    );
  }
  return signals.some(s => s.toLowerCase().includes(pattern.toLowerCase()));
}

/**
 * 根据信号选择最佳基因
 */
export function selectGene(
  genes: Gene[],
  signals: Signal[],
  opts: SelectionOptions
): SelectionResult<Gene> {
  // 评分
  const scored = genes.map(g => ({
    gene: g,
    score: g.signals_match.reduce((acc, pat) => 
      matchPatternToSignals(pat, signals) ? acc + 1 : acc, 0)
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  
  if (scored.length === 0) {
    throw new Error('No matching genes found for signals');
  }
  
  // 漂移控制下的选择
  const driftIntensity = computeDriftIntensity(opts);
  let selectedIdx = 0;
  
  if (driftIntensity > 0 && scored.length > 1 && Math.random() < driftIntensity) {
    const topN = Math.min(
      scored.length, 
      Math.ceil(scored.length * driftIntensity)
    );
    selectedIdx = Math.floor(Math.random() * topN);
  }
  
  const allScores = new Map<string, number>();
  scored.forEach(({ gene, score }) => allScores.set(gene.id, score));
  
  return {
    selected: scored[selectedIdx].gene,
    alternatives: scored.slice(1, opts.alternativesCount || 5).map(s => s.gene),
    scoring: {
      selected_score: scored[selectedIdx].score,
      all_scores: allScores
    }
  };
}
```

---

### 2.2 信号提取引擎

```typescript
// core/signal-extractor.ts

import type { Signal } from '../types';

interface LogEntry {
  type: 'tool_result' | 'user_input' | 'agent_output' | 'system';
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
  latency?: number;
  user_input?: string;
  content?: string;
  timestamp: string;
}

export interface SignalContext {
  logs: LogEntry[];
  history?: EvolutionEvent[];
}

/**
 * 从日志和历史中提取信号
 */
export function extractSignals(context: SignalContext): Signal[] {
  const signals: Signal[] = [];
  
  context.logs.forEach(entry => {
    // 错误信号
    if (entry.type === 'tool_result' && entry.error) {
      signals.push('log_error');
      
      // 精确错误签名（截断）
      const errorSig = JSON.stringify(entry.error).slice(0, 200);
      signals.push(`errsig:${errorSig}`);
      
      // 特定错误类型
      if (entry.error.code) {
        signals.push(`error_code:${entry.error.code}`);
      }
    }
    
    // 性能信号
    if (entry.latency && entry.latency > 5000) {
      signals.push('perf_bottleneck');
      if (entry.latency > 10000) {
        signals.push('perf_critical');
      }
    }
    
    // 用户请求信号
    if (entry.user_input) {
      const input = entry.user_input.toLowerCase();
      if (/feature|improvement|add|new/i.test(input)) {
        signals.push('user_feature_request');
      }
      if (/bug|fix|broken|error/i.test(input)) {
        signals.push('user_bug_report');
      }
      if (/slow|fast|performance|optimize/i.test(input)) {
        signals.push('performance_concern');
      }
    }
    
    // 系统级信号
    if (entry.type === 'system') {
      if (entry.content?.includes('timeout')) {
        signals.push('system_timeout');
      }
      if (entry.content?.includes('memory')) {
        signals.push('memory_pressure');
      }
    }
  });
  
  // 从历史中提取模式信号
  if (context.history && context.history.length > 0) {
    const recentFailures = context.history
      .slice(-10)
      .filter(e => e.outcome.status === 'failed').length;
    
    if (recentFailures > 5) {
      signals.push('recurring_failures');
    }
  }
  
  return signals;
}

/**
 * 信号去重和优先级排序
 */
export function prioritizeSignals(signals: Signal[]): Signal[] {
  const priorityOrder = [
    'log_error', 'errsig:', 'error_code:',
    'perf_critical', 'perf_bottleneck',
    'user_feature_request', 'user_bug_report',
    'recurring_failures', 'system_timeout'
  ];
  
  return signals.sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a);
    const bIdx = priorityOrder.indexOf(b);
    
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}
```

---

### 2.3 胶囊管理器

```typescript
// core/capsule-manager.ts

import type { Capsule, Signal, EnvFingerprint } from '../types';
import { matchPatternToSignals } from './gene-selector';

export interface CapsuleStore {
  get(id: string): Capsule | undefined;
  getAll(): Capsule[];
  add(capsule: Capsule): void;
  update(capsule: Capsule): void;
  remove(id: string): void;
  searchBySignals(signals: Signal[]): Capsule[];
  searchByGene(geneId: string): Capsule[];
}

/**
 * 根据信号和环境匹配最佳胶囊
 */
export function selectCapsule(
  capsules: Capsule[],
  signals: Signal[],
  currentEnv: EnvFingerprint
): Capsule | undefined {
  const scored = capsules.map(c => {
    // 信号匹配得分
    let signalScore = 0;
    c.trigger.forEach(trigger => {
      if (matchPatternToSignals(trigger, signals)) {
        signalScore++;
      }
    });
    
    // 环境匹配度
    let envScore = 0;
    if (c.env_fingerprint.platform === currentEnv.platform) envScore += 2;
    if (c.env_fingerprint.arch === currentEnv.arch) envScore += 1;
    if (c.env_fingerprint.node_version === currentEnv.node_version) envScore += 1;
    
    // 成功率加权
    const successWeight = c.outcome.status === 'success' ? 1.5 : 0.5;
    
    // 综合得分
    const totalScore = (signalScore + envScore) * c.confidence * successWeight;
    
    return { capsule: c, score: totalScore, signalScore, envScore };
  }).filter(x => x.signalScore > 0).sort((a, b) => b.score - a.score);
  
  return scored.length > 0 ? scored[0].capsule : undefined;
}

/**
 * 胶囊复用决策
 */
export function shouldReuseCapsule(
  capsule: Capsule,
  signals: Signal[],
  minConfidence: number = 0.6
): boolean {
  // 置信度检查
  if (capsule.confidence < minConfidence) return false;
  
  // 历史成功率检查
  if (capsule.outcome.status === 'failed') return false;
  
  // 信号匹配检查
  const matchCount = capsule.trigger.filter(t => 
    matchPatternToSignals(t, signals)
  ).length;
  
  return matchCount >= 2; // 至少 2 个信号匹配
}
```

---

### 2.4 验证门控

```typescript
// core/validation-gate.ts

/**
 * 命令白名单验证
 */
export function isValidationCommandAllowed(command: string): boolean {
  // 1. 前缀白名单
  if (!/^(node|npm|npx)\s/.test(command)) return false;
  
  // 2. 禁止命令替换
  if (/\$(\(|`)/.test(command)) return false;
  
  // 3. 禁止 shell 操作符（剥离引号后）
  const stripped = command.replace(/'[^']*'|"[^"]*"/g, '');
  if (/[;&|<>]/.test(stripped)) return false;
  
  return true;
}

/**
 * 影响范围估算
 */
export interface BlastRadiusEstimate {
  files: number;
  lines: number;
  directories: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export function estimateBlastRadius(
  filesToModify: string[],
  linesPerFile: Map<string, number>,
  forbiddenPaths: string[]
): BlastRadiusEstimate {
  let totalLines = 0;
  const directories = new Set<string>();
  
  for (const file of filesToModify) {
    // 检查是否触碰禁止路径
    if (forbiddenPaths.some(fp => file.includes(fp))) {
      throw new Error(`Forbidden path accessed: ${file}`);
    }
    
    totalLines += linesPerFile.get(file) || 0;
    directories.add(file.split('/').slice(0, -1).join('/'));
  }
  
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (filesToModify.length > 10 || totalLines > 200) {
    riskLevel = 'high';
  } else if (filesToModify.length > 5 || totalLines > 100) {
    riskLevel = 'medium';
  }
  
  return {
    files: filesToModify.length,
    lines: totalLines,
    directories: Array.from(directories),
    riskLevel
  };
}

/**
 * 高风险突变审批
 */
export function requiresApproval(
  blastRadius: BlastRadiusEstimate,
  reviewMode: boolean,
  maxBlastRadius: { files: number; lines: number }
): boolean {
  if (reviewMode) return true;
  if (blastRadius.riskLevel === 'high') return true;
  if (blastRadius.files > maxBlastRadius.files) return true;
  if (blastRadius.lines > maxBlastRadius.lines) return true;
  
  return false;
}
```

---

## 3. 存储层设计

### 3.1 文件系统存储

```typescript
// storage/gene-store.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Gene } from '../types';

export class GeneStore {
  constructor(private basePath: string) {}
  
  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }
  
  async get(id: string): Promise<Gene | undefined> {
    try {
      const content = await fs.readFile(
        path.join(this.basePath, `${id}.json`),
        'utf-8'
      );
      return JSON.parse(content) as Gene;
    } catch {
      return undefined;
    }
  }
  
  async getAll(): Promise<Gene[]> {
    const files = await fs.readdir(this.basePath);
    const genes = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const gene = await this.get(path.basename(file, '.json'));
        if (gene) genes.push(gene);
      }
    }
    
    return genes;
  }
  
  async add(gene: Gene): Promise<void> {
    const filePath = path.join(this.basePath, `${gene.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(gene, null, 2));
  }
  
  async update(gene: Gene): Promise<void> {
    await this.add(gene);
  }
}
```

---

## 4. 主入口

```typescript
// index.ts

import type { EvolutionConfig, Signal, EvolutionEvent } from './types';
import { extractSignals, prioritizeSignals } from './core/signal-extractor';
import { selectGene } from './core/gene-selector';
import { selectCapsule } from './core/capsule-manager';
import { isValidationCommandAllowed } from './core/validation-gate';
import { GeneStore } from './storage/gene-store';
import { CapsuleStore } from './storage/capsule-store';
import { EventLogger } from './storage/event-logger';

export class LocalEvomap {
  private geneStore: GeneStore;
  private capsuleStore: CapsuleStore;
  private eventLogger: EventLogger;
  
  constructor(private config: EvolutionConfig) {
    this.geneStore = new GeneStore(config.genes_path);
    this.capsuleStore = new CapsuleStore(config.capsules_path);
    this.eventLogger = new EventLogger(config.events_path);
  }
  
  async init(): Promise<void> {
    await this.geneStore.init();
    await this.capsuleStore.init();
    await this.eventLogger.init();
  }
  
  /**
   * 执行一次进化循环
   */
  async evolve(logs: any[]): Promise<EvolutionEvent> {
    // 1. 提取信号
    const signals = prioritizeSignals(extractSignals({ logs }));
    
    // 2. 获取所有基因
    const genes = await this.geneStore.getAll();
    
    // 3. 选择基因
    const { selected: gene, alternatives } = selectGene(genes, signals, this.config.selection);
    
    // 4. 查找胶囊
    const capsules = await this.capsuleStore.getAll();
    const capsule = selectCapsule(capsules, signals, this.getEnvFingerprint());
    
    // 5. 构建进化提示（这里调用 LLM）
    const prompt = this.buildGepPrompt({ signals, gene, capsule });
    
    // 6. 执行进化（伪代码）
    // const changes = await this.callLLM(prompt);
    
    // 7. 验证
    const validationPassed = gene.validation?.every(cmd => 
      isValidationCommandAllowed(cmd)
    ) ?? true;
    
    // 8. 记录事件
    const event: EvolutionEvent = {
      id: `event_${Date.now()}`,
      timestamp: new Date().toISOString(),
      signals,
      selected_gene: gene.id,
      used_capsule: capsule?.id,
      outcome: {
        status: validationPassed ? 'success' : 'failed',
        score: validationPassed ? 0.9 : 0.0,
        changes: { files_modified: 0, lines_added: 0, lines_removed: 0 }
      },
      validation: {
        passed: validationPassed,
        commands_run: gene.validation?.length || 0
      },
      metadata: { session_id: this.config.session_scope || 'default' }
    };
    
    await this.eventLogger.append(event);
    
    return event;
  }
  
  private getEnvFingerprint() {
    return {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      working_dir: process.cwd()
    };
  }
  
  private buildGepPrompt(opts: { signals: Signal[]; gene: any; capsule?: any }): string {
    return `
# Evolution Prompt

Signals: ${opts.signals.join(', ')}
Selected Gene: ${opts.gene.id}
${opts.capsule ? `Similar Capsule: ${opts.capsule.id} (${opts.capsule.summary})` : ''}

Strategy: ${opts.gene.strategy.join('\n')}
Constraints: ${JSON.stringify(opts.gene.constraints)}
`.trim();
  }
}

export { isValidationCommandAllowed, estimateBlastRadius } from './core/validation-gate';
export { selectGene, computeDriftIntensity } from './core/gene-selector';
export { extractSignals, prioritizeSignals } from './core/signal-extractor';
export { selectCapsule, shouldReuseCapsule } from './core/capsule-manager';
