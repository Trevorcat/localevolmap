/**
 * Evolution Engine - 进化引擎
 * 
 * 核心进化循环控制器
 * 编排信号提取、基因选择、胶囊匹配、验证和事件记录
 */

import type { 
  EvolutionConfig, 
  Signal, 
  EvolutionEvent, 
  Gene, 
  Capsule,
  EnvFingerprint 
} from '../types/gene-capsule-schema';
import { extractSignals, prioritizeSignals } from './signal-extractor';
import { selectGene } from './gene-selector';
import { selectCapsule, shouldReuseCapsule } from './capsule-manager';
import { isValidationCommandAllowed, estimateBlastRadius, requiresApproval, executeValidation } from './validation-gate';
import { LLMProvider } from './llm-provider';
import type { CapsuleStore } from '../storage/capsule-store';

// ============================================================================
// 进化引擎配置
// ============================================================================

export interface EvolutionEngineConfig extends EvolutionConfig {
  // LLM 相关配置（实际实现需要）
  llmProvider?: 'openai' | 'anthropic' | 'local';
  llmModel?: string;
  llmApiKey?: string;
  llmBaseURL?: string;  // 本地模型端点（Ollama/LM Studio）
  
  // 回滚策略
  rollbackEnabled: boolean;
  rollbackStrategy: 'full' | 'partial' | 'none';
  
  // 缓存策略
  cacheEnabled: boolean;
  cacheTtlMs: number;
}

// ============================================================================
// 进化状态
// ============================================================================

export interface EvolutionChange {
  file: string;
  operation: 'create' | 'modify' | 'delete';
  content: string;
  reasoning: string;
}

export interface EvolutionState {
  sessionId: string;
  iteration: number;
  signals: Signal[];
  selectedGene: Gene | null;
  selectedCapsule: Capsule | null;
  changes: EvolutionChange[];
  validationPassed: boolean;
  startTime: number;
  endTime?: number;
}

export interface EvolutionResult {
  event: EvolutionEvent;
  changes: EvolutionChange[];
  capsule_created: string | null;
}

export class LLMProviderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

// ============================================================================
// 进化引擎
// ============================================================================

export class EvolutionEngine {
  private state: EvolutionState;
  private genePool: Gene[] = [];
  private capsulePool: Capsule[] = [];
  private llmProvider?: LLMProvider;
  
  constructor(
    private config: EvolutionEngineConfig,
    private eventLogger: EventLogger,
    private capsuleStore?: CapsuleStore  // 可选：用于持久化胶囊
  ) {
    this.state = {
      sessionId: config.session_scope || `session_${Date.now()}`,
      iteration: 0,
      signals: [],
      selectedGene: null,
      selectedCapsule: null,
      changes: [],
      validationPassed: false,
      startTime: Date.now()
    };
    
    // 初始化 LLM Provider（如果配置了）
    if (config.llmProvider && config.llmModel) {
      this.llmProvider = new LLMProvider({
        provider: config.llmProvider,
        model: config.llmModel,
        apiKey: config.llmApiKey,
        baseURL: config.llmBaseURL
      });
    }
  }
  
  /**
   * 设置基因池
   */
  setGenePool(genes: Gene[]): void {
    this.genePool = genes;
  }
  
  /**
   * 设置胶囊池
   */
  setCapsulePool(capsules: Capsule[]): void {
    this.capsulePool = capsules;
  }
  
  /**
   * 执行一次进化循环
   */
  async evolve(
    logs: any[],
    overrides?: { dryRun?: boolean; strategy?: string }
  ): Promise<EvolutionResult> {
    // 保存原始配置，在 finally 中恢复
    const savedDryRun = this.config.dryRun;
    const savedStrategy = this.config.strategy;
    if (overrides?.dryRun !== undefined) this.config.dryRun = overrides.dryRun;
    if (overrides?.strategy !== undefined) {
      this.config.strategy = overrides.strategy as EvolutionConfig['strategy'];
    }
    
    this.state.iteration++;
    this.state.startTime = Date.now();
    
    try {
      // 1. 信号提取
      const { prioritySignals } = extractSignals({ logs });
      this.state.signals = prioritySignals;
      
      // 2. 基因选择
      const { selected: gene, alternatives } = this.selectGene();
      this.state.selectedGene = gene;
      
      // 3. 胶囊匹配
      const capsule = this.selectCapsule();
      this.state.selectedCapsule = capsule;
      
      // 4. 胶囊复用决策
      const shouldReuse = capsule ? shouldReuseCapsule(capsule, this.state.signals) : null;
      
      // 5. 构建进化提示
      const prompt = this.buildEvolutionPrompt({
        signals: this.state.signals,
        gene,
        capsule,
        shouldReuse,
        alternatives
      });
      
      // 6. 执行进化（调用 LLM）
      const changes = await this.executeEvolution(prompt);
      this.state.changes = changes;
      
      // 7. 影响范围估算
      const blastRadius = this.estimateBlastRadius(changes);
      
      // 8. 审批检查
      const needsApproval = requiresApproval(blastRadius, {
        reviewMode: this.config.review_mode,
        maxBlastRadius: this.config.max_blast_radius,
        autoApproveLowRisk: false
      });
      
      if (needsApproval) {
        throw new Error(`Approval required: ${blastRadius.riskLevel} risk level`);
      }
      
      // 9. 验证
      const validationPassed = await this.validateChanges(gene, changes);
      this.state.validationPassed = validationPassed;
      
      // 10. 构建事件
      const event = this.buildEvolutionEvent({
        gene,
        capsule,
        changes,
        blastRadius,
        validationPassed
      });
      
      // 11. 记录事件
      await this.eventLogger.append(event);
      
      // 12. 如果成功，创建新胶囊
      const capsule_created = (validationPassed && !capsule)
        ? await this.createCapsuleFromSuccess(gene, changes, this.state.signals)
        : null;
      
      this.state.endTime = Date.now();
      return { event, changes: this.state.changes, capsule_created };
      
    } catch (error) {
      // 失败事件
      const errorEvent = this.buildErrorEvent(error as Error);
      await this.eventLogger.append(errorEvent);
      throw error;
    } finally {
      // 恢复原始配置
      this.config.dryRun = savedDryRun;
      this.config.strategy = savedStrategy;
    }
  }
  
  /**
   * 选择基因
   */
  private selectGene() {
    return selectGene(this.genePool, this.state.signals, this.config.selection);
  }
  
  /**
   * 选择胶囊
   */
  private selectCapsule(): Capsule | null {
    const env = this.getEnvFingerprint();
    return selectCapsule(this.capsulePool, this.state.signals, env) || null;
  }
  
  /**
   * 构建进化提示
   */
  private buildEvolutionPrompt(opts: {
    signals: Signal[];
    gene: Gene;
    capsule: Capsule | null;
    shouldReuse: ReturnType<typeof shouldReuseCapsule> | null;
    alternatives: Gene[];
  }): string {
    const { signals, gene, capsule, shouldReuse, alternatives } = opts;
    
    let prompt = `# Evolution Task\n\n`;
    
    // 信号
    prompt += `## Detected Signals\n${signals.slice(0, 10).join(', ')}\n\n`;
    
    // 选择的基因
    prompt += `## Selected Gene: ${gene.id}\n`;
    prompt += `Category: ${gene.category}\n`;
    prompt += `Strategy:\n${gene.strategy.map(s => `- ${s}`).join('\n')}\n\n`;
    
    // 约束
    prompt += `## Constraints\n`;
    prompt += `Max files: ${gene.constraints.max_files || 'unlimited'}\n`;
    prompt += `Max lines: ${gene.constraints.max_lines || 'unlimited'}\n`;
    if (gene.constraints.forbidden_paths) {
      prompt += `Forbidden: ${gene.constraints.forbidden_paths.join(', ')}\n`;
    }
    prompt += `\n`;
    
    // 相似胶囊
    if (capsule) {
      prompt += `## Similar Capsule Available\n`;
      prompt += `ID: ${capsule.id}\n`;
      prompt += `Summary: ${capsule.summary}\n`;
      prompt += `Confidence: ${capsule.confidence}\n`;
      prompt += `Outcome: ${capsule.outcome.status} (score: ${capsule.outcome.score})\n`;
      
      if (shouldReuse?.shouldReuse) {
        prompt += `\n**RECOMMENDATION: Reuse this capsule**\n`;
        prompt += `Reason: ${shouldReuse.reason}\n`;
      }
      prompt += `\n`;
    }
    
    // 替代基因
    if (alternatives.length > 0) {
      prompt += `## Alternative Genes\n`;
      alternatives.forEach((alt, i) => {
        prompt += `${i + 1}. ${alt.id} (${alt.category})\n`;
      });
      prompt += `\n`;
    }
    
    // 任务
    prompt += `## Task\n`;
    prompt += `Based on the signals and selected gene strategy, generate the necessary code changes.\n`;
    prompt += `Follow the constraints strictly.\n`;
    prompt += `If a similar capsule exists and is recommended for reuse, prefer reusing it.\n`;
    
    return prompt.trim();
  }
  
  /**
   * 执行进化（调用 LLM）
   * 
   * 实现：
   * 1. 调用 LLM Provider
   * 2. 解析结构化输出
   * 3. 路径安全验证
   * 4. dry-run 支持
   */
  private async executeEvolution(prompt: string): Promise<EvolutionChange[]> {
    // 如果没有配置 LLM，返回空变更（dry-run 模式）
    if (!this.llmProvider) {
      console.warn('[EvolutionEngine] No LLM provider configured, returning empty changes');
      return [];
    }

    try {
      // 调用 LLM 生成进化方案
      const output = await this.llmProvider.generateEvolution(prompt);
      
      console.log(`[EvolutionEngine] LLM generated ${output.changes.length} changes, confidence: ${output.confidence}`);
      
      // 路径安全验证：过滤掉 forbidden_paths
      const safeChanges = output.changes.filter(change => {
        const isSafe = !this.config.forbidden_paths.some(fp => 
          change.file.includes(fp)
        );
        if (!isSafe) {
          console.warn(`[Security] Blocked forbidden path: ${change.file}`);
        }
        return isSafe;
      });
      
      // dry-run 模式：只记录，不写磁盘
      if (this.config.dryRun) {
        console.log('[DryRun] Would apply changes:', safeChanges.map(c => `${c.operation} ${c.file}`));
      }
      
      return safeChanges;
    } catch (error) {
      console.error('[EvolutionEngine] LLM generation failed:', error);
      throw new LLMProviderError(
        `LLM generation failed: ${(error as Error).message || 'Unknown error'}`,
        error
      );
    }
  }
  
  /**
   * 估算影响范围
   */
  private estimateBlastRadius(changes: EvolutionChange[]) {
    const linesPerFile = new Map<string, number>();
    changes.forEach(c => {
      linesPerFile.set(c.file, c.content.split('\n').length);
    });
    
    return estimateBlastRadius(
      changes.map(c => c.file),
      linesPerFile,
      this.config.forbidden_paths
    );
  }
  
  /**
   * 验证更改
   */
  private async validateChanges(gene: Gene, changes: EvolutionChange[]): Promise<boolean> {
    // 1. 命令白名单检查
    if (gene.validation) {
      const allAllowed = gene.validation.every(cmd => 
        isValidationCommandAllowed(cmd)
      );
      if (!allAllowed) return false;
    }
    
    // 2. 路径安全检查
    const allPathsSafe = changes.every(c => 
      !this.config.forbidden_paths.some(fp => c.file.includes(fp))
    );
    if (!allPathsSafe) return false;
    
    // 3. 执行验证命令
    if (gene.validation && gene.validation.length > 0) {
      const result = await executeValidation(gene.validation, {
        timeoutMs: 30000,
        failFast: false
      });
      return result.passed;
    }
    
    return true;
  }
  
  /**
   * 构建进化事件
   */
  private buildEvolutionEvent(opts: {
    gene: Gene;
    capsule: Capsule | null;
    changes: EvolutionChange[];
    blastRadius: ReturnType<typeof estimateBlastRadius>;
    validationPassed: boolean;
  }): EvolutionEvent {
    const { gene, capsule, changes, blastRadius, validationPassed } = opts;
    
    const totalLinesAdded = changes.reduce((sum, c) => sum + c.content.split('\n').length, 0);
    
    return {
      id: `event_${Date.now()}_${this.state.iteration}`,
      timestamp: new Date().toISOString(),
      signals: this.state.signals,
      selected_gene: gene.id,
      used_capsule: capsule?.id,
      outcome: {
        status: validationPassed ? 'success' : 'failed',
        score: validationPassed ? 0.9 : 0.0,
        changes: {
          files_modified: changes.length,
          lines_added: totalLinesAdded,
          lines_removed: changes.filter(c => c.operation === 'delete').reduce((sum, c) => sum + c.content.split('\n').length, 0)
        }
      },
      validation: {
        passed: validationPassed,
        commands_run: gene.validation?.length || 0
      },
      metadata: {
        session_id: this.state.sessionId,
        iteration: this.state.iteration,
        blast_radius: {
          files: blastRadius.files,
          lines: blastRadius.lines,
          risk_level: blastRadius.riskLevel
        }
      }
    };
  }
  
  /**
   * 构建错误事件
   */
  private buildErrorEvent(error: Error): EvolutionEvent {
    return {
      id: `event_error_${Date.now()}`,
      timestamp: new Date().toISOString(),
      signals: this.state.signals,
      selected_gene: this.state.selectedGene?.id || 'unknown',
      outcome: {
        status: 'failed',
        score: 0.0,
        changes: { files_modified: 0, lines_added: 0, lines_removed: 0 }
      },
      validation: {
        passed: false,
        commands_run: 0,
        errors: [error.message]
      },
      metadata: {
        session_id: this.state.sessionId,
        iteration: this.state.iteration,
        error: error.message
      }
    };
  }
  
  /**
   * 从成功进化创建胶囊
   */
  private async createCapsuleFromSuccess(
    gene: Gene,
    changes: EvolutionChange[],
    signals: Signal[]
  ): Promise<string | null> {
    const capsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: `capsule_${Date.now()}`,
      trigger: signals.slice(0, 5),
      gene: gene.id,
      summary: `Auto-generated from successful evolution`,
      confidence: 0.7,
      blast_radius: {
        files: changes.length,
        lines: changes.reduce((sum, c) => sum + c.content.split('\n').length, 0)
      },
      outcome: {
        status: 'success',
        score: 0.9
      },
      env_fingerprint: this.getEnvFingerprint(),
      metadata: {
        created_at: new Date().toISOString(),
        source: 'local'
      }
    };
    
    // 实际持久化到胶囊存储
    if (this.capsuleStore) {
      try {
        await this.capsuleStore.add(capsule);
        console.log(`[EvolutionEngine] Capsule persisted: ${capsule.id}`);
        return capsule.id;
      } catch (error) {
        console.error(`[EvolutionEngine] Failed to persist capsule:`, error);
        return null;
      }
    } else {
      console.warn(`[EvolutionEngine] No capsule store configured, capsule not persisted: ${capsule.id}`);
      return null;
    }
  }
  
  /**
   * 获取环境指纹
   */
  private getEnvFingerprint(): EnvFingerprint {
    return {
      node_version: process.version,
      platform: process.platform as EnvFingerprint['platform'],
      arch: process.arch as EnvFingerprint['arch'],
      working_dir: process.cwd()
    };
  }
  
  /**
   * 获取当前状态
   */
  getState(): EvolutionState {
    return { ...this.state };
  }
}

// ============================================================================
// 事件日志器接口
// ============================================================================

export interface EventLogger {
  append(event: EvolutionEvent): Promise<void>;
  getAll(): Promise<EvolutionEvent[]>;
  getBySession(sessionId: string): Promise<EvolutionEvent[]>;
  getRecent(count: number): Promise<EvolutionEvent[]>;
}
