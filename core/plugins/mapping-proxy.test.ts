import { MappingProxy, MappingProxyError } from './mapping-proxy';
import type { PluginManagerLike } from './mapping-proxy';

describe('mapping proxy', () => {
  test('forwards candidate queries to the plugin sidecar', async () => {
    const manager: PluginManagerLike = {
      getStatus: () => ({
        id: 'cloud_mapping',
        enabled: true,
        state: 'ready',
        baseUrl: 'http://127.0.0.1:18110',
        requestTimeoutMs: 5000,
        capabilities: { mcp: ['mapping_query_candidates'], http: ['/api/v1/mapping'] }
      })
    };
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ initial_candidate_count: 8, candidates: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const proxy = new MappingProxy({ pluginManager: manager, fetchImpl: fetchImpl as typeof fetch });

    const result = await proxy.queryCandidates({ query_profile: { kind: 'xlsx' }, limit: 5 });

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:18110/api/v1/query/candidates', expect.objectContaining({ method: 'POST' }));
    expect(result).toEqual({ initial_candidate_count: 8, candidates: [] });
  });

  test('returns unified status from plugin health', async () => {
    const manager: PluginManagerLike = {
      getStatus: () => ({
        id: 'cloud_mapping',
        enabled: true,
        state: 'ready',
        baseUrl: 'http://127.0.0.1:18110',
        requestTimeoutMs: 5000,
        capabilities: { mcp: ['mapping_get_status'], http: ['/api/v1/mapping'] }
      })
    };
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', port: 18110 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const proxy = new MappingProxy({ pluginManager: manager, fetchImpl: fetchImpl as typeof fetch });

    const result = await proxy.getStatus();

    expect(result.state).toBe('ready');
    expect(result.upstream).toEqual({ status: 'ok', port: 18110 });
  });

  test('throws standardized error when plugin is unavailable', async () => {
    const manager: PluginManagerLike = {
      getStatus: () => ({
        id: 'cloud_mapping',
        enabled: true,
        state: 'failed',
        error: 'sidecar boom',
        capabilities: { mcp: ['mapping_get_status'], http: ['/api/v1/mapping'] }
      })
    };
    const proxy = new MappingProxy({ pluginManager: manager, fetchImpl: fetch as typeof fetch });

    await expect(proxy.queryCandidates({ query_profile: {}, limit: 3 })).rejects.toBeInstanceOf(MappingProxyError);
    await expect(proxy.queryCandidates({ query_profile: {}, limit: 3 })).rejects.toMatchObject({
      statusCode: 503,
      code: 'plugin_unavailable'
    });
  });
});
