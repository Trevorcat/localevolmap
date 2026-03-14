export type PluginState = 'discovered' | 'disabled' | 'starting' | 'ready' | 'degraded' | 'failed' | 'stopped';

export interface PluginHttpCapability {
  publicBase: string;
  upstreamBase: string;
}

export interface PluginManifest {
  id: string;
  displayName: string;
  version: string;
  runtime: {
    kind: 'python-sidecar';
    cwd: string;
    command: string[];
    pythonPathEntries?: string[];
  };
  health: {
    path: string;
  };
  capabilities: {
    http: PluginHttpCapability[];
    mcp: string[];
  };
}

export interface PluginConfig {
  enabled: boolean;
  port: number;
  startupTimeoutMs: number;
  requestTimeoutMs: number;
  dataDir: string;
  env?: Record<string, string>;
}

export interface ResolvedPluginDefinition {
  id: string;
  enabled: boolean;
  projectRoot?: string;
  rootDir: string;
  manifestPath: string;
  manifest: PluginManifest;
  config: PluginConfig;
}

export interface PluginRuntimeStatus {
  id: string;
  enabled: boolean;
  state: PluginState;
  baseUrl?: string;
  error?: string;
  requestTimeoutMs?: number;
  capabilities: {
    mcp: string[];
    http: string[];
  };
}

export interface PluginRuntimeHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): PluginRuntimeStatus;
}
