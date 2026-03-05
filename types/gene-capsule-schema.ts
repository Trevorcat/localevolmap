/**
 * Capability Evolver - Gene/Capsule Schema Definitions
 * 
 * 基于 EvoMap/evolver 的核心数据结构定义
 * 用于本地实现 evomap 系统的类型基础
 */

// ============================================================================
// 基础类型
// ============================================================================

export type Signal = string;

export type Category = 
  | 'repair'
  | 'optimize'
  | 'feature'
  | 'security'
  | 'performance'
  | 'refactor'
  | 'test';

export type OutcomeStatus = 'success' | 'failed' | 'partial' | 'skipped';

export interface BlastRadius {
  files: number;
  lines: number;
  directories?: string[];
}

export interface EnvFingerprint {
  node_version?: string;
  platform: 'linux' | 'darwin' | 'win32';
  arch: 'x64' | 'arm64' | 'ia32';
  working_dir?: string;
  git_branch?: string;
  git_commit?: string;
  [key: string]: unknown;
}

// ============================================================================
// Gene (基因) - 抽象的知识模式
// ============================================================================

export interface Gene {
  /** 类型标识 */
  type: 'Gene';
  
  /** 唯一标识符 */
  id: string;
  
  /** 分类 */
  category: Category;
  
  /** 信号匹配模式 - 支持多语言别名 "error|错误 | エラー" */
  signals_match: Signal[];
  
  /** 前置条件 */
  preconditions: string[];
  
  /** 执行策略 - 步骤描述 */
  strategy: string[];
  
  /** 约束条件 */
  constraints: {
    max_files?: number;
    max_lines?: number;
    forbidden_paths?: string[];
    required_paths?: string[];
    timeout_ms?: number;
  };
  
  /** 验证命令列表 */
  validation?: string[];
  
  /** 元数据 */
  metadata?: {
    author?: string;
    created_at?: string;
    updated_at?: string;
    version?: string;
    description?: string;
    tags?: string[];
  };
  
  /** 软删除标记 (internal use) */
  _deleted?: boolean;
  _deleted_at?: string;
}

// ============================================================================
// Capsule (胶囊) - 具体、已验证的解决方案
// ============================================================================

export interface Capsule {
  /** 类型标识 */
  type: 'Capsule';
  
  /** Schema 版本 */
  schema_version: string;
  
  /** 唯一标识符 */
  id: string;
  
  /** 触发信号 */
  trigger: Signal[];
  
  /** 关联的基因 ID */
  gene: string;
  
  /** 摘要描述 */
  summary: string;
  
  /** 置信度 (0-1) */
  confidence: number;
  
  /** 影响范围 */
  blast_radius: BlastRadius;
  
  /** 执行结果 */
  outcome: {
    status: OutcomeStatus;
    score: number;
    duration_ms?: number;
    error_message?: string;
  };
  
  /** 环境指纹 */
  env_fingerprint: EnvFingerprint;
  
  /** 元数据 */
  metadata?: {
    created_at: string;
    applied_at?: string;
    session_id?: string;
    user_id?: string;
    source?: 'local' | 'external' | 'hub';
    validated?: boolean;
  };
  
  /** 软删除标记 (internal use) */
  _deleted?: boolean;
  _deleted_at?: string;
}

// ============================================================================
// EvolutionEvent (进化事件) - 审计轨迹
// ============================================================================

export interface EvolutionEvent {
  /** 事件 ID */
  id: string;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 触发信号 */
  signals: Signal[];
  
  /** 选择的基因 */
  selected_gene: string;
  
  /** 使用的胶囊 (可选) */
  used_capsule?: string;
  
  /** 执行结果 */
  outcome: {
    status: OutcomeStatus;
    score: number;
    changes: {
      files_modified: number;
      lines_added: number;
      lines_removed: number;
    };
  };
  
  /** 验证结果 */
  validation: {
    passed: boolean;
    commands_run: number;
    errors?: string[];
  };
  
  /** 元数据 */
  metadata?: {
    session_id: string;
    agent_version?: string;
    config_version?: string;
    iteration?: number;
    blast_radius?: {
      files: number;
      lines: number;
      risk_level: string;
    };
    error?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// SelectionOptions (选择算法配置)
// ============================================================================

export interface SelectionOptions {
  /** 是否启用漂移 */
  driftEnabled?: boolean;
  
  /** 有效群体大小 */
  effectivePopulationSize?: number;
  
  /** 基因池大小 */
  genePoolSize?: number;
  
  /** 随机种子 (用于可重复性) */
  randomSeed?: number;
  
  /** 最小置信度阈值 */
  minConfidence?: number;
  
  /** 返回的替代选项数量 */
  alternativesCount?: number;
}

// ============================================================================
// SelectionResult (选择结果)
// ============================================================================

export interface SelectionResult<T> {
  /** 选中的项 */
  selected: T;
  
  /** 替代选项 */
  alternatives: T[];
  
  /** 评分详情 */
  scoring: {
    selected_score: number;
    all_scores: Map<string, number>;
  };
}

// ============================================================================
// EvolutionConfig (进化系统配置)
// ============================================================================

export interface EvolutionConfig {
  /** 策略预设 */
  strategy: 'balanced' | 'innovate' | 'harden' | 'repair-only';
  
  /** 基因存储路径 */
  genes_path: string;
  
  /** 胶囊存储路径 */
  capsules_path: string;
  
  /** 事件日志路径 */
  events_path: string;
  
  /** 会话作用域隔离 */
  session_scope?: string;
  
  /** 高风险突变审批模式 */
  review_mode: boolean;
  
  /** 最大影响范围限制 */
  max_blast_radius: BlastRadius;
  
  /** 禁止路径 */
  forbidden_paths: string[];
  
  /** 选择算法配置 */
  selection: SelectionOptions;
  
  /** 外部胶囊源 */
  external_sources?: Array<{
    name: string;
    url: string;
    validated_only: boolean;
  }>;
  
  /** 回滚策略配置 */
  rollbackEnabled: boolean;
  rollbackStrategy: 'full' | 'partial' | 'none';
  
  /** 缓存策略配置 */
  cacheEnabled: boolean;
  cacheTtlMs: number;
  
  /** Dry-run 模式：只记录 changes 但不写磁盘 */
  dryRun?: boolean;
}

// ============================================================================
// 示例数据
// ============================================================================

export const EXAMPLE_GENE: Gene = {
  type: 'Gene',
  id: 'gene_gep_repair_from_errors',
  category: 'repair',
  signals_match: ['error', 'exception', 'failed', 'unstable', '错误', '失败'],
  preconditions: ['signals contains error-related indicators'],
  strategy: [
    '从日志中提取结构化信号',
    '根据信号匹配选择现有 Gene',
    '编辑前估算影响范围',
    '应用最小可逆补丁',
    '使用声明的验证步骤进行验证',
    '固化知识：追加 EvolutionEvent'
  ],
  constraints: {
    max_files: 20,
    max_lines: 100,
    forbidden_paths: ['.git', 'node_modules', 'dist', 'build'],
    timeout_ms: 60000
  },
  validation: [
    'node scripts/validate-modules.js ./src/evolve',
    'npm test -- --grep evolution'
  ],
  metadata: {
    author: 'evomap-system',
    version: '1.0.0',
    description: '从错误日志中自动修复问题的基因',
    tags: ['error-handling', 'auto-repair', 'production']
  }
};

export const EXAMPLE_CAPSULE: Capsule = {
  type: 'Capsule',
  schema_version: '1.5.0',
  id: 'capsule_1770477654236',
  trigger: ['log_error', 'windows_shell_incompatible'],
  gene: 'gene_gep_repair_from_errors',
  summary: 'Fixed shell command compatibility on Windows',
  confidence: 0.85,
  blast_radius: {
    files: 1,
    lines: 2,
    directories: ['src/evolve']
  },
  outcome: {
    status: 'success',
    score: 0.85,
    duration_ms: 1234
  },
  env_fingerprint: {
    node_version: 'v22.22.0',
    platform: 'win32',
    arch: 'x64',
    working_dir: 'E:\\projects\\test_model\\capability',
    git_branch: 'main'
  },
  metadata: {
    created_at: '2026-03-05T12:00:00Z',
    source: 'local',
    validated: true
  }
};

export const EXAMPLE_CONFIG: EvolutionConfig = {
  strategy: 'balanced',
  genes_path: './data/genes',
  capsules_path: './data/capsules',
  events_path: './data/events',
  session_scope: 'local-dev',
  review_mode: true,
  max_blast_radius: {
    files: 50,
    lines: 500
  },
  forbidden_paths: ['.git', 'node_modules', '.env', '*.key'],
  selection: {
    driftEnabled: true,
    effectivePopulationSize: 3,
    minConfidence: 0.5,
    alternativesCount: 5
  },
  rollbackEnabled: false,
  rollbackStrategy: 'none',
  cacheEnabled: false,
  cacheTtlMs: 3600000
};
