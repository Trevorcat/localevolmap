import * as path from 'path';
import { evaluateAgentCompatibility, loadAgentManifest } from './agent-manifest';

describe('agent compatibility evaluation', () => {
  test('returns ready when local versions and hashes match manifest', async () => {
    const manifest = await loadAgentManifest(path.resolve(__dirname, '..'));

    const result = evaluateAgentCompatibility(manifest, {
      client: 'codex',
      manifest_version_seen: manifest.manifest_version,
      mcp_version: manifest.mcp.runtime.version,
      mcp_hash: manifest.mcp.runtime.hash,
      skill_version: manifest.skills.codex.version,
      skill_hash: manifest.skills.codex.hash,
    });

    expect(result.status).toBe('ready');
    expect(result.blocking).toBe(false);
    expect(result.runtime.current).toBe(true);
    expect(result.skill.current).toBe(true);
  });

  test('reports update_available for non-breaking skill mismatch', async () => {
    const manifest = await loadAgentManifest(path.resolve(__dirname, '..'));

    const result = evaluateAgentCompatibility(manifest, {
      client: 'codex',
      manifest_version_seen: manifest.manifest_version,
      mcp_version: manifest.mcp.runtime.version,
      mcp_hash: manifest.mcp.runtime.hash,
      skill_version: '0.0.1',
      skill_hash: 'sha256-old',
    });

    expect(result.status).toBe('update_available');
    expect(result.blocking).toBe(false);
    expect(result.skill.current).toBe(false);
    expect(result.skill.target.breaking).toBe(false);
  });
});
