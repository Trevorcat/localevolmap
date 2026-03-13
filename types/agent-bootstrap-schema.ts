export const AGENT_CLIENTS = ['codex', 'claude-code', 'cursor', 'opencode', 'kimi'] as const;

export type AgentClient = typeof AGENT_CLIENTS[number];

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

export type AgentBootstrapAutomationLevel = 'full' | 'partial';

export type AgentBootstrapStepKind =
  | 'download_file'
  | 'verify_file_exists'
  | 'run_command'
  | 'upsert_mcp_server'
  | 'copy_template'
  | 'restart_or_reload'
  | 'http_post'
  | 'mcp_call'
  | 'manual_step';

export interface AgentBootstrapEnvVar {
  name: string;
  required: boolean;
  secret?: boolean;
  description: string;
  example?: string;
  applies_to?: AgentClient[];
}

export interface AgentBootstrapCommand {
  program: string;
  args: string[];
  cwd?: string;
  shell?: 'powershell' | 'bash';
}

export interface AgentBootstrapStep {
  id: string;
  title: string;
  kind: AgentBootstrapStepKind;
  description: string;
  target?: string;
  source_path?: string;
  config_path?: string;
  server_name?: string;
  command?: AgentBootstrapCommand;
  env?: string[];
  body?: Record<string, unknown>;
  expected?: string;
  optional?: boolean;
}

export interface AgentBootstrapPostInstallCheck {
  id: string;
  title: string;
  kind: 'http_post' | 'mcp_call' | 'verify_file_exists';
  target: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  success_signal: string;
}

export interface AgentBootstrapSkillInstall {
  version: string;
  hash: string;
  download_url: string;
  target_path: string;
  auto_update_supported: boolean;
}

export interface AgentBootstrapMcpConfig {
  server_name: string;
  transport: 'stdio' | 'http';
  config_path: string;
  template_path?: string;
  command?: string;
  args?: string[];
  env_names: string[];
}

export interface AgentBootstrapClientChecklist {
  enabled: boolean;
  automation_level: AgentBootstrapAutomationLevel;
  skill: AgentBootstrapSkillInstall;
  mcp_config: AgentBootstrapMcpConfig;
  env: AgentBootstrapEnvVar[];
  steps: AgentBootstrapStep[];
  post_install_checks: AgentBootstrapPostInstallCheck[];
  limitations: string[];
}

export interface AgentBootstrapProjectInfo {
  name: string;
  preferred_runtime: 'local-mcp';
  skill_entry: string;
  local_runtime_entry: string;
}

export interface AgentBootstrapServerInfo {
  base_url: string;
  bootstrap_url: string;
  manifest_url: string;
  check_url: string;
}

export interface AgentBootstrapRuntimeInfo {
  server_name: string;
  transport: 'stdio';
  command: 'node';
  args_template: string[];
  entrypoint: string;
  install_command: string[];
  build_command: string[];
}

export interface AgentBootstrapVerificationInfo {
  runtime_tool: string;
  workspace_playbook: string;
  required_tools: string[];
}

export interface AgentBootstrapChecklist {
  schema_version: string;
  project: AgentBootstrapProjectInfo;
  server: AgentBootstrapServerInfo;
  runtime: AgentBootstrapRuntimeInfo;
  shared_env: AgentBootstrapEnvVar[];
  clients: Partial<Record<AgentClient, AgentBootstrapClientChecklist>>;
  verification: AgentBootstrapVerificationInfo;
}

export interface BuildAgentBootstrapChecklistOptions {
  baseUrl: string;
  projectRoot?: string;
  client?: AgentClient;
}

export function isAgentClient(value: string): value is AgentClient {
  return (AGENT_CLIENTS as readonly string[]).includes(value);
}
