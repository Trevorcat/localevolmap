import { PluginManager } from './plugin-manager';
import type { PluginRuntimeHandle, ResolvedPluginDefinition } from './types';

function buildPlugin(enabled: boolean): ResolvedPluginDefinition {
  return {
    id: 'cloud_mapping',
    enabled,
    rootDir: '/repo/plugins/cloud_mapping',
    manifestPath: '/repo/plugins/cloud_mapping/plugin.json',
    manifest: {
      id: 'cloud_mapping',
      displayName: 'Cloud Mapping',
      version: '0.1.0',
      runtime: {
        kind: 'python-sidecar',
        cwd: '.',
        command: ['python', '-m', 'uvicorn', 'cloud_mapping.app.main:app'],
        pythonPathEntries: ['plugins']
      },
      health: { path: '/health' },
      capabilities: {
        http: [{ publicBase: '/api/v1/mapping', upstreamBase: '/api/v1' }],
        mcp: ['mapping_get_status']
      }
    },
    config: {
      enabled,
      port: 18110,
      startupTimeoutMs: 1000,
      requestTimeoutMs: 2000,
      dataDir: '/repo/data/plugins/cloud_mapping'
    }
  };
}

describe('plugin manager', () => {
  test('reports disabled plugins without starting them', async () => {
    const start = jest.fn();
    const manager = new PluginManager({
      definitions: [buildPlugin(false)],
      runtimeFactory: (): PluginRuntimeHandle => ({
        start,
        stop: jest.fn().mockResolvedValue(undefined),
        getStatus: () => ({ id: 'cloud_mapping', enabled: false, state: 'disabled', capabilities: { mcp: [], http: [] } })
      })
    });

    await manager.initialize();

    expect(start).not.toHaveBeenCalled();
    expect(manager.getStatus('cloud_mapping')?.state).toBe('disabled');
  });

  test('tracks ready state after a runtime starts successfully', async () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const manager = new PluginManager({
      definitions: [buildPlugin(true)],
      runtimeFactory: (): PluginRuntimeHandle => ({
        start,
        stop: jest.fn().mockResolvedValue(undefined),
        getStatus: () => ({
          id: 'cloud_mapping',
          enabled: true,
          state: 'ready',
          baseUrl: 'http://127.0.0.1:18110',
          requestTimeoutMs: 2000,
          capabilities: { mcp: ['mapping_get_status'], http: ['/api/v1/mapping'] }
        })
      })
    });

    await manager.initialize();

    expect(start).toHaveBeenCalledTimes(1);
    expect(manager.getStatus('cloud_mapping')?.state).toBe('ready');
  });

  test('marks plugin failed when runtime start throws', async () => {
    const manager = new PluginManager({
      definitions: [buildPlugin(true)],
      runtimeFactory: (): PluginRuntimeHandle => ({
        start: jest.fn().mockRejectedValue(new Error('sidecar boom')),
        stop: jest.fn().mockResolvedValue(undefined),
        getStatus: () => ({
          id: 'cloud_mapping',
          enabled: true,
          state: 'failed',
          error: 'sidecar boom',
          capabilities: { mcp: ['mapping_get_status'], http: ['/api/v1/mapping'] }
        })
      })
    });

    await manager.initialize();

    expect(manager.getStatus('cloud_mapping')?.state).toBe('failed');
    expect(manager.getStatus('cloud_mapping')?.error).toContain('sidecar boom');
  });
});
