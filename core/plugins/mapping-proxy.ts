import type { PluginRuntimeStatus } from './types';

export interface PluginManagerLike {
  getStatus(pluginId: string): PluginRuntimeStatus | undefined;
}

export interface MappingProxyLike {
  getStatus(): Promise<Record<string, unknown>>;
  ingestProfiles(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  queryCandidates(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface MappingProxyOptions {
  pluginManager: PluginManagerLike;
  fetchImpl?: typeof fetch;
}

export class MappingProxyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class MappingProxy implements MappingProxyLike {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MappingProxyOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const status = this.getPluginStatus();
    if (!status.enabled) {
      throw new MappingProxyError(404, 'capability_not_enabled', 'cloud_mapping is disabled');
    }

    if (status.state !== 'ready' || !status.baseUrl) {
      return { ...status, upstream: null };
    }

    const upstream = await this.requestReadyPlugin('GET', '/health');
    return { ...status, upstream };
  }

  async ingestProfiles(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.requestReadyPlugin('POST', '/api/v1/ingest/profiles', payload);
  }

  async queryCandidates(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.requestReadyPlugin('POST', '/api/v1/query/candidates', payload);
  }

  private getPluginStatus(): PluginRuntimeStatus {
    const status = this.options.pluginManager.getStatus('cloud_mapping');
    if (!status) {
      throw new MappingProxyError(404, 'capability_not_enabled', 'cloud_mapping is not configured');
    }
    return status;
  }

  private async requestReadyPlugin(method: 'GET' | 'POST', pathname: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const status = this.getPluginStatus();
    if (!status.enabled) {
      throw new MappingProxyError(404, 'capability_not_enabled', 'cloud_mapping is disabled');
    }
    if (status.state !== 'ready' || !status.baseUrl) {
      throw new MappingProxyError(503, 'plugin_unavailable', status.error || 'cloud_mapping is not ready');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), status.requestTimeoutMs ?? 30000);
    try {
      const response = await this.fetchImpl(`${status.baseUrl}${pathname}`, {
        method,
        headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await response.text();
      const data = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      if (!response.ok) {
        throw new MappingProxyError(502, 'plugin_upstream_error', `${method} ${pathname} failed with ${response.status}`);
      }
      return data;
    } catch (error) {
      if (error instanceof MappingProxyError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new MappingProxyError(504, 'plugin_timeout', `Timed out calling ${pathname}`);
      }
      throw new MappingProxyError(502, 'plugin_upstream_error', (error as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
}
