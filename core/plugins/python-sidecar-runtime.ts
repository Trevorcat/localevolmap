import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PluginRuntimeHandle, PluginRuntimeStatus, ResolvedPluginDefinition } from './types';

interface PythonSidecarRuntimeOptions {
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class PythonSidecarRuntime implements PluginRuntimeHandle {
  private readonly fetchImpl: typeof fetch;
  private readonly spawnImpl: typeof spawn;
  private childProcess?: ChildProcess;
  private status: PluginRuntimeStatus;

  constructor(private readonly plugin: ResolvedPluginDefinition, options: PythonSidecarRuntimeOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.status = {
      id: plugin.id,
      enabled: plugin.enabled,
      state: plugin.enabled ? 'discovered' : 'disabled',
      requestTimeoutMs: plugin.config.requestTimeoutMs,
      capabilities: {
        mcp: [...plugin.manifest.capabilities.mcp],
        http: plugin.manifest.capabilities.http.map(item => item.publicBase)
      }
    };
  }

  async start(): Promise<void> {
    if (!this.plugin.enabled) {
      this.status = { ...this.status, state: 'disabled' };
      return;
    }

    if (this.childProcess) {
      return;
    }

    this.status = { ...this.status, state: 'starting', error: undefined };
    await fs.mkdir(this.plugin.config.dataDir, { recursive: true });

    const [command, ...args] = this.plugin.manifest.runtime.command;
    const runtimeArgs = [...args, '--host', '127.0.0.1', '--port', String(this.plugin.config.port)];
    const cwd = path.resolve(this.plugin.rootDir, this.plugin.manifest.runtime.cwd || '.');
    const pythonPaths = (this.plugin.manifest.runtime.pythonPathEntries ?? []).map(entry => path.resolve(this.plugin.projectRoot ?? process.cwd(), entry));
    const env = {
      ...process.env,
      ...this.plugin.config.env,
      CLOUD_MAPPING_HOST: '127.0.0.1',
      CLOUD_MAPPING_PORT: String(this.plugin.config.port),
      CLOUD_MAPPING_DB_PATH: path.join(this.plugin.config.dataDir, 'mapping.db'),
      PYTHONPATH: [...pythonPaths, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
    };

    this.childProcess = this.spawnImpl(command, runtimeArgs, { cwd, env, stdio: 'ignore' });
    this.childProcess.once('exit', code => {
      if (this.status.state !== 'stopped') {
        this.status = {
          ...this.status,
          state: 'failed',
          error: `plugin process exited with code ${code ?? 'unknown'}`,
          baseUrl: undefined
        };
      }
      this.childProcess = undefined;
    });

    await this.waitForHealthy();
    this.status = {
      ...this.status,
      state: 'ready',
      baseUrl: `http://127.0.0.1:${this.plugin.config.port}`,
      requestTimeoutMs: this.plugin.config.requestTimeoutMs
    };
  }

  async stop(): Promise<void> {
    if (this.childProcess) {
      this.status = { ...this.status, state: 'stopped' };
      this.childProcess.kill();
      this.childProcess = undefined;
    }
  }

  getStatus(): PluginRuntimeStatus {
    return this.status;
  }

  private async waitForHealthy(): Promise<void> {
    const deadline = Date.now() + this.plugin.config.startupTimeoutMs;
    const healthUrl = `http://127.0.0.1:${this.plugin.config.port}${this.plugin.manifest.health.path}`;

    while (Date.now() < deadline) {
      try {
        const response = await this.fetchImpl(healthUrl);
        if (response.ok) {
          return;
        }
      } catch {
      }
      await delay(250);
    }

    throw new Error(`Timed out waiting for plugin health: ${this.plugin.id}`);
  }
}
