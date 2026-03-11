export type AgentClient = 'codex' | 'claude-code' | 'cursor' | 'opencode' | 'kimi';

export type BootstrapStatus =
  | 'booting'
  | 'updating'
  | 'ready'
  | 'update_available'
  | 'blocked'
  | 'unreachable'
  | 'update_failed';

export interface ManifestEntrySource {
  path: string;
  download_url: string;
}

export interface ManifestEntry {
  version: string;
  breaking: boolean;
  auto_update_supported: boolean;
  hash: string;
  download_url: string;
  source_path: string;
}

export interface RawManifestEntry {
  version: string;
  breaking?: boolean;
  auto_update_supported?: boolean;
  source: ManifestEntrySource;
}

export interface AgentManifest {
  manifest_version: string;
  generated_at: string;
  mcp: {
    runtime: ManifestEntry;
  };
  skills: Record<AgentClient, ManifestEntry>;
}

export interface RawAgentManifest {
  manifest_version: string;
  generated_at?: string;
  mcp: {
    runtime: RawManifestEntry;
  };
  skills: Record<AgentClient, RawManifestEntry>;
}

export interface AgentCheckRequest {
  client: AgentClient;
  manifest_version_seen?: string;
  mcp_version?: string;
  mcp_hash?: string;
  skill_version?: string;
  skill_hash?: string;
}

export interface CompatibilitySubject {
  current: boolean;
  local: {
    version?: string;
    hash?: string;
  };
  target: ManifestEntry;
}

export interface AgentCheckResponse {
  status: Extract<BootstrapStatus, 'ready' | 'update_available' | 'blocked'>;
  blocking: boolean;
  manifest_current: boolean;
  client: AgentClient;
  runtime: CompatibilitySubject;
  skill: CompatibilitySubject;
  reasons: string[];
}

