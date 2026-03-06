/**
 * LocalEvomap API 类型定义
 */

export interface EvomapConfig {
  baseUrl: string;
  apiKey: string;
  minConfidence: number;
}

export interface CapsuleSearchResult {
  total: number;
  capsules: Capsule[];
  tags: string[];
  genes: string[];
}

export interface GenesListResult {
  total: number;
  genes: Gene[];
  categories: string[];
  signals: string[];
}

export interface EventsListResult {
  total: number;
  events: EvolutionEvent[];
}

export interface Capsule {
  type: 'Capsule';
  schema_version: string;
  id: string;
  trigger: string[];
  gene: string;
  summary: string;
  confidence: number;
  blast_radius: {
    files: number;
    lines: number;
  };
  outcome: {
    status: string;
    score: number;
    duration_ms?: number;
  };
  env_fingerprint?: {
    platform: string;
    node_version: string;
    working_dir: string;
  };
  metadata?: {
    created_at: string;
    source: string;
    validated: boolean;
  };
  _deleted?: boolean;
  _deleted_at?: string;
}

export interface Gene {
  type: 'Gene';
  id: string;
  category: string;
  signals_match: string[];
  preconditions: string[];
  strategy: string[];
  constraints: {
    max_files?: number;
    max_lines?: number;
  };
  _deleted?: boolean;
  _deleted_at?: string;
}

export interface EvolutionEvent {
  type: 'event';
  id: string;
  timestamp: string;
  signals: Signal[];
  selected_gene_id: string | null;
  selected_capsule_id: string | null;
  action: string;
  outcome: {
    status: string;
    score: number;
  };
  blast_radius?: {
    files: number;
    lines: number;
  };
  validation?: {
    command: string;
    allowed: boolean;
    requires_approval: boolean;
  };
}

export interface Signal {
  text: string;
  priority: number;
}

export interface EvolutionAssistantResult {
  type: 'capsule_found' | 'gene_found' | 'no_match';
  capsule?: Capsule;
  gene?: Gene;
  confidence?: number;
  message: string;
  suggestion: string;
  preconditions?: string[];
  constraints?: Gene['constraints'];
}

export interface SearchCapsulesOptions {
  minConfidence?: number;
  limit?: number;
}

export interface ErrorInfo {
  message?: string;
  logs?: any[];
  context?: string;
}
