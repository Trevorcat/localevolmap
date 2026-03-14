import type { EvolutionBackend } from '../core/evolution-backend';
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
} from '../core/evolution-backend';

export interface MappingStatusResult {
  id: string;
  enabled: boolean;
  state: string;
  capabilities: {
    mcp: string[];
    http: string[];
  };
  upstream?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface MappingIngestProfilesInput {
  profiles: Array<Record<string, unknown>>;
}

export interface MappingIngestProfilesResult {
  ingested: number;
  table_profile_ids: number[];
  [key: string]: unknown;
}

export interface MappingQueryCandidatesInput {
  query_profile: Record<string, unknown>;
  limit?: number;
}

export interface MappingQueryCandidatesResult {
  initial_candidate_count: number;
  candidates: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface MappingCapabilityClient {
  getMappingStatus(): Promise<MappingStatusResult>;
  ingestMappingProfiles(input: MappingIngestProfilesInput): Promise<MappingIngestProfilesResult>;
  queryMappingCandidates(input: MappingQueryCandidatesInput): Promise<MappingQueryCandidatesResult>;
}

export interface RemoteEvolutionClientOptions {
  serverUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class RemoteEvolutionClient implements EvolutionBackend, MappingCapabilityClient {
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteEvolutionClientOptions) {
    this.serverUrl = options.serverUrl.endsWith('/') ? options.serverUrl.slice(0, -1) : options.serverUrl;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async startTask(input: StartTaskInput): Promise<StartTaskResult> {
    return this.requestJson<StartTaskResult>('POST', '/api/v1/tasks', input);
  }

  async searchKnowledge(input: SearchKnowledgeInput): Promise<SearchKnowledgeResult> {
    if (input.taskId) {
      const { taskId, ...body } = input;
      return this.requestJson<SearchKnowledgeResult>('POST', `/api/v1/tasks/${encodeURIComponent(taskId)}/search`, body);
    }

    return this.requestJson<SearchKnowledgeResult>('POST', '/api/v1/knowledge/search', input);
  }

  async recordUsage(input: RecordUsageRequest): Promise<RecordUsageResult> {
    return this.requestJson<RecordUsageResult>('POST', `/api/v1/tasks/${encodeURIComponent(input.taskId)}/usage`, {
      knowledge: input.knowledge
    });
  }

  async getTaskContext(input: GetTaskContextRequest): Promise<GetTaskContextResult> {
    return this.requestJson<GetTaskContextResult>('GET', `/api/v1/tasks/${encodeURIComponent(input.taskId)}`);
  }

  async finalizeTask(input: FinalizeTaskRequest): Promise<FinalizeTaskResult> {
    return this.requestJson<FinalizeTaskResult>('POST', `/api/v1/tasks/${encodeURIComponent(input.taskId)}/finalize`, {
      summary: input.summary,
      outcome: input.outcome,
      retrospective: input.retrospective,
      createCapsule: input.createCapsule
    });
  }

  async getWorkspacePlaybook(workspace: string): Promise<WorkspacePlaybook> {
    return this.requestJson<WorkspacePlaybook>('GET', `/api/v1/workspaces/${encodeURIComponent(workspace)}/playbook`);
  }

  async getWorkspaceRecentSuccesses(workspace: string): Promise<WorkspaceRecentSuccesses> {
    return this.requestJson<WorkspaceRecentSuccesses>('GET', `/api/v1/workspaces/${encodeURIComponent(workspace)}/recent-successes`);
  }

  async getMappingStatus(): Promise<MappingStatusResult> {
    return this.requestJson<MappingStatusResult>('GET', '/api/v1/mapping/health');
  }

  async ingestMappingProfiles(input: MappingIngestProfilesInput): Promise<MappingIngestProfilesResult> {
    return this.requestJson<MappingIngestProfilesResult>('POST', '/api/v1/mapping/ingest/profiles', input);
  }

  async queryMappingCandidates(input: MappingQueryCandidatesInput): Promise<MappingQueryCandidatesResult> {
    return this.requestJson<MappingQueryCandidatesResult>('POST', '/api/v1/mapping/query/candidates', input);
  }

  private async requestJson<T>(method: 'GET' | 'POST', pathname: string, body?: unknown): Promise<T> {
    const url = `${this.serverUrl}${pathname}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const rawText = await response.text();
    const payload = rawText ? JSON.parse(rawText) : null;

    if (!response.ok) {
      const detail = payload && typeof payload === 'object' && 'detail' in payload ? String((payload as { detail?: unknown }).detail) : rawText;
      throw new Error(`Remote request failed: ${method} ${pathname} -> ${response.status}${detail ? ` (${detail})` : ''}`);
    }

    return payload as T;
  }
}
