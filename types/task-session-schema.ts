export type TaskSessionStatus = 'active' | 'finalized';

export type KnowledgeRefKind = 'gene' | 'capsule';

export type KnowledgeUsagePhase = 'plan' | 'implement' | 'validate';

export interface ValidationResult {
  command: string;
  passed: boolean;
  notes?: string;
}

export interface TaskOutcome {
  status: 'success' | 'partial' | 'failed';
  score: number;
}

export interface TaskRetrospective {
  summary: string;
  signals: string[];
  selfMistakes: string[];
  userCorrections: string[];
  validations: ValidationResult[];
}

export interface TaskFinalization {
  eventId: string;
  capsuleId: string | null;
  distillReady: boolean;
  genesUpdated: string[];
  capsulesUpdated: string[];
}

export interface KnowledgeUsageRef {
  kind: KnowledgeRefKind;
  id: string;
  phase: KnowledgeUsagePhase;
  usedAt: string;
  note?: string;
}

export interface TaskSession {
  taskId: string;
  goal: string;
  workspace: string;
  client: string;
  status: TaskSessionStatus;
  openedAt: string;
  finalizedAt?: string;
  signals: string[];
  knowledgeRefs: KnowledgeUsageRef[];
  retrospective?: TaskRetrospective;
  outcome?: TaskOutcome;
  finalization?: TaskFinalization;
}

export interface CreateTaskSessionInput {
  goal: string;
  workspace: string;
  client: string;
  signals?: string[];
}

export interface RecordKnowledgeUsageInput {
  kind: KnowledgeRefKind;
  id: string;
  phase: KnowledgeUsagePhase;
  note?: string;
}

export interface FinalizeTaskSessionInput extends TaskRetrospective {
  outcome: TaskOutcome;
  finalization?: TaskFinalization;
}
