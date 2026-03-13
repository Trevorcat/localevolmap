export type {
  FinalizeTaskRequest,
  FinalizeTaskResult,
  GetTaskContextRequest,
  GetTaskContextResult,
  RecordUsageRequest,
  RecordUsageResult,
  SearchKnowledgeInput,
  SearchKnowledgeResult,
  StartTaskInput,
  StartTaskResult,
  WorkspacePlaybook,
  WorkspaceRecentSuccesses,
} from './evolution-service';

import type {
  FinalizeTaskRequest,
  FinalizeTaskResult,
  GetTaskContextRequest,
  GetTaskContextResult,
  RecordUsageRequest,
  RecordUsageResult,
  SearchKnowledgeInput,
  SearchKnowledgeResult,
  StartTaskInput,
  StartTaskResult,
  WorkspacePlaybook,
  WorkspaceRecentSuccesses,
} from './evolution-service';

export interface EvolutionBackend {
  startTask(input: StartTaskInput): Promise<StartTaskResult>;
  searchKnowledge(input: SearchKnowledgeInput): Promise<SearchKnowledgeResult>;
  recordUsage(input: RecordUsageRequest): Promise<RecordUsageResult>;
  getTaskContext(input: GetTaskContextRequest): Promise<GetTaskContextResult>;
  finalizeTask(input: FinalizeTaskRequest): Promise<FinalizeTaskResult>;
  getWorkspacePlaybook(workspace: string): Promise<WorkspacePlaybook>;
  getWorkspaceRecentSuccesses(workspace: string): Promise<WorkspaceRecentSuccesses>;
}
