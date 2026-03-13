import * as path from 'path';
import { computeStableBootstrapHash, loadAgentManifest } from './agent-manifest';

describe('agent manifest loader', () => {
  test('loads checked-in manifest and computes hashes for tracked files', async () => {
    const manifest = await loadAgentManifest(path.resolve(__dirname, '..'));

    expect(manifest.manifest_version).toBeTruthy();
    expect(manifest.mcp.runtime.hash).toMatch(/^sha256-/);
    expect(manifest.skills.codex.hash).toMatch(/^sha256-/);
    expect(manifest.skills['claude-code'].hash).toMatch(/^sha256-/);
  });

  test('marks supported auto-update clients correctly', async () => {
    const manifest = await loadAgentManifest(path.resolve(__dirname, '..'));

    expect(manifest.skills.codex.auto_update_supported).toBe(true);
    expect(manifest.skills['claude-code'].auto_update_supported).toBe(true);
    expect(manifest.skills.cursor.auto_update_supported).toBe(true);
    expect(manifest.skills.kimi.auto_update_supported).toBe(false);
    expect(manifest.skills.opencode.auto_update_supported).toBe(false);
  });

  test('normalizes line endings before computing bootstrap hashes', () => {
    const lf = 'line1\nline2\n';
    const crlf = 'line1\r\nline2\r\n';

    expect(computeStableBootstrapHash(lf)).toBe(computeStableBootstrapHash(crlf));
  });
});
