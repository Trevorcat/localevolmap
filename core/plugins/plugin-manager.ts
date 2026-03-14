import { loadPluginDefinitions } from './plugin-registry';
import { PythonSidecarRuntime } from './python-sidecar-runtime';
import type { PluginRuntimeHandle, PluginRuntimeStatus, ResolvedPluginDefinition } from './types';

interface PluginManagerOptions {
  definitions: ResolvedPluginDefinition[];
  runtimeFactory?: (plugin: ResolvedPluginDefinition) => PluginRuntimeHandle;
}

export class PluginManager {
  private readonly definitions: ResolvedPluginDefinition[];
  private readonly runtimeFactory: (plugin: ResolvedPluginDefinition) => PluginRuntimeHandle;
  private readonly runtimes = new Map<string, PluginRuntimeHandle>();
  private readonly statuses = new Map<string, PluginRuntimeStatus>();
  private initialized = false;

  constructor(options: PluginManagerOptions) {
    this.definitions = options.definitions;
    this.runtimeFactory = options.runtimeFactory ?? (plugin => new PythonSidecarRuntime(plugin));
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    for (const definition of this.definitions) {
      if (!definition.enabled) {
        this.statuses.set(definition.id, {
          id: definition.id,
          enabled: false,
          state: 'disabled',
          requestTimeoutMs: definition.config.requestTimeoutMs,
          capabilities: {
            mcp: [...definition.manifest.capabilities.mcp],
            http: definition.manifest.capabilities.http.map(item => item.publicBase)
          }
        });
        continue;
      }

      const runtime = this.runtimeFactory(definition);
      this.runtimes.set(definition.id, runtime);
      try {
        await runtime.start();
        this.statuses.set(definition.id, runtime.getStatus());
      } catch (error) {
        const current = runtime.getStatus();
        this.statuses.set(definition.id, {
          ...current,
          id: definition.id,
          enabled: true,
          state: 'failed',
          error: (error as Error).message,
          requestTimeoutMs: definition.config.requestTimeoutMs,
          capabilities: {
            mcp: [...definition.manifest.capabilities.mcp],
            http: definition.manifest.capabilities.http.map(item => item.publicBase)
          }
        });
      }
    }

    this.initialized = true;
  }

  getStatus(pluginId: string): PluginRuntimeStatus | undefined {
    const runtime = this.runtimes.get(pluginId);
    if (runtime) {
      return runtime.getStatus();
    }
    return this.statuses.get(pluginId);
  }

  getStatuses(): PluginRuntimeStatus[] {
    return this.definitions.map(definition => this.getStatus(definition.id)).filter(Boolean) as PluginRuntimeStatus[];
  }

  async stopAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      await runtime.stop();
    }
  }
}

export async function createProjectPluginManager(projectRoot: string): Promise<PluginManager> {
  const definitions = await loadPluginDefinitions({ projectRoot });
  return new PluginManager({ definitions });
}
