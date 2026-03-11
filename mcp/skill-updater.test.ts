import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { AddressInfo } from 'net';
import { autoUpdateSkill } from './skill-updater';

function hash(text: string): string {
  return `sha256-${createHash('sha256').update(text).digest('base64')}`;
}

describe('skill updater', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-skill-updater-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test('downloads and atomically replaces supported client skill files', async () => {
    const nextContent = '# updated codex skill\n';
    const server = http.createServer((req, res) => {
      if (req.url === '/skill/codex') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(nextContent);
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const targetPath = path.join(root, 'AGENTS.md');
      await fs.writeFile(targetPath, '# old\n', 'utf-8');

      const result = await autoUpdateSkill({
        client: 'codex',
        downloadUrl: `http://127.0.0.1:${port}/skill/codex`,
        expectedHash: hash(nextContent),
        targetPath,
      });

      expect(result.updated).toBe(true);
      expect(await fs.readFile(targetPath, 'utf-8')).toBe(nextContent);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  test('skips unsupported clients without mutating files', async () => {
    const targetPath = path.join(root, 'kimi.md');
    await fs.writeFile(targetPath, '# old kimi\n', 'utf-8');

    const result = await autoUpdateSkill({
      client: 'kimi',
      downloadUrl: 'http://127.0.0.1:9/skill/kimi',
      expectedHash: hash('# new kimi\n'),
      targetPath,
    });

    expect(result.updated).toBe(false);
    expect(result.reason).toContain('unsupported');
    expect(await fs.readFile(targetPath, 'utf-8')).toBe('# old kimi\n');
  });
});
