import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { loadPluginDefinitions } from './plugin-registry';

async function writeJson(filePath: string, value: unknown, withBom = false): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const prefix = withBom ? '﻿' : '';
  await fs.writeFile(filePath, `${prefix}${JSON.stringify(value, null, 2)}`, 'utf-8');
}

describe('plugin registry', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-plugin-registry-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function seedPlugin(enabled: boolean, options: { manifestWithBom?: boolean; configWithBom?: boolean } = {}): Promise<void> {
    await writeJson(path.join(root, 'plugins', 'cloud_mapping', 'plugin.json'), {
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
        mcp: ['mapping_get_status', 'mapping_ingest_profiles', 'mapping_query_candidates']
      }
    }, options.manifestWithBom);

    await writeJson(path.join(root, 'plugins.json'), {
      plugins: {
        cloud_mapping: {
          enabled,
          port: 18110,
          startupTimeoutMs: 12000,
          requestTimeoutMs: 30000,
          dataDir: 'data/plugins/cloud_mapping'
        }
      }
    }, options.configWithBom);
  }

  test('discovers plugin manifests and merges config', async () => {
    await seedPlugin(true);

    const definitions = await loadPluginDefinitions({ projectRoot: root });

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      id: 'cloud_mapping',
      enabled: true,
      rootDir: path.join(root, 'plugins', 'cloud_mapping'),
      manifestPath: path.join(root, 'plugins', 'cloud_mapping', 'plugin.json')
    });
    expect(definitions[0].config.port).toBe(18110);
    expect(definitions[0].config.dataDir).toBe(path.join(root, 'data', 'plugins', 'cloud_mapping'));
    expect(definitions[0].manifest.capabilities.mcp).toContain('mapping_query_candidates');
  });

  test('accepts config and manifest files saved with utf-8 bom', async () => {
    await seedPlugin(true, { manifestWithBom: true, configWithBom: true });

    const definitions = await loadPluginDefinitions({ projectRoot: root });

    expect(definitions).toHaveLength(1);
    expect(definitions[0].enabled).toBe(true);
    expect(definitions[0].manifest.displayName).toBe('Cloud Mapping');
  });

  test('keeps discovered plugins but marks them disabled by config', async () => {
    await seedPlugin(false);

    const definitions = await loadPluginDefinitions({ projectRoot: root });

    expect(definitions).toHaveLength(1);
    expect(definitions[0].enabled).toBe(false);
    expect(definitions[0].config.enabled).toBe(false);
  });
});
