import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { CapsuleStore } from './capsule-store';
import type { Capsule } from '../types/gene-capsule-schema';

describe('CapsuleStore', () => {
  async function createTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-capsule-store-'));
  }

  afterEach(async () => {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('localevomap-capsule-store-'))
      .map(entry => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true })));
  });

  test('getAll skips legacy capsule files that do not satisfy the current schema', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const root = await createTempRoot();
    const store = new CapsuleStore(root);
    await store.init();

    const legacyCapsule = {
      type: 'Capsule',
      schema_version: '1.0',
      id: 'legacy-cap',
      trigger: ['test'],
      gene: 'gene-1',
      summary: 'Legacy capsule without outcome or env fingerprint',
      confidence: 0.9,
      changes: {
        files: [],
        post_commands: []
      }
    };

    const validCapsule: Capsule = {
      type: 'Capsule',
      schema_version: '1.5.0',
      id: 'valid-cap',
      trigger: ['test'],
      gene: 'gene-1',
      summary: 'Valid capsule',
      confidence: 0.9,
      blast_radius: { files: 1, lines: 1 },
      outcome: { status: 'success', score: 0.9 },
      env_fingerprint: { platform: 'win32', arch: 'x64', node_version: process.version }
    };

    await fs.writeFile(path.join(root, 'legacy-cap.json'), JSON.stringify(legacyCapsule, null, 2), 'utf-8');
    await store.add(validCapsule);

    await expect(store.get('legacy-cap')).resolves.toBeUndefined();
    await expect(store.getAll()).resolves.toEqual([validCapsule]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid capsule file'));

    warnSpy.mockRestore();
  });
});
