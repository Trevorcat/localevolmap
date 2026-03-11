import * as fs from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { AddressInfo } from 'net';
import type { AgentManifest } from '../types/agent-bootstrap-schema';
import { initializeBootstrapState } from './bootstrap';

function hash(text: string): string {
  return `sha256-${createHash('sha256').update(text).digest('base64')}`;
}

describe('bootstrap initialization', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-bootstrap-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test('returns unreachable when the server cannot be reached', async () => {
    const state = await initializeBootstrapState({
      client: 'codex',
      serverUrl: 'http://127.0.0.1:9',
      mcpVersion: '0.1.0',
      runtimeHash: 'sha256-local',
    });

    expect(state.status).toBe('unreachable');
    expect(state.availableTools).toEqual(['get_runtime_status']);
  });

  test('auto-updates supported client skills before becoming ready', async () => {
    const nextSkillContent = '# updated codex skill\n';
    const targetPath = path.join(root, 'AGENTS.md');
    await fs.writeFile(targetPath, '# old codex skill\n', 'utf-8');

    const manifest: AgentManifest = {
      manifest_version: '2026.03.11.1',
      generated_at: '2026-03-11T00:00:00.000Z',
      mcp: {
        runtime: {
          version: '0.1.0',
          breaking: true,
          auto_update_supported: false,
          hash: 'sha256-runtime',
          download_url: '/api/v1/agent-manifest',
          source_path: 'mcp/server.ts',
        },
      },
      skills: {
        codex: {
          version: '1.1.0',
          breaking: true,
          auto_update_supported: true,
          hash: hash(nextSkillContent),
          download_url: '/skill/codex',
          source_path: 'opencode/localevomap-skill/codex-agents.md',
        },
        'claude-code': {
          version: '1.1.0',
          breaking: true,
          auto_update_supported: true,
          hash: hash('# claude\n'),
          download_url: '/skill/claude-code',
          source_path: 'opencode/localevomap-skill/claude-code.md',
        },
        cursor: {
          version: '1.1.0',
          breaking: true,
          auto_update_supported: true,
          hash: hash('# cursor\n'),
          download_url: '/skill/cursor',
          source_path: 'opencode/localevomap-skill/cursor.md',
        },
        opencode: {
          version: '1.1.0',
          breaking: false,
          auto_update_supported: false,
          hash: hash('# opencode\n'),
          download_url: '/skill/opencode',
          source_path: 'opencode/localevomap-skill/opencode-skill.md',
        },
        kimi: {
          version: '1.1.0',
          breaking: false,
          auto_update_supported: false,
          hash: hash('# kimi\n'),
          download_url: '/skill/kimi',
          source_path: 'opencode/localevomap-skill/kimi.md',
        },
      },
    };

    const server = http.createServer((req, res) => {
      if (req.url === '/api/v1/agent-manifest') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(manifest));
        return;
      }

      if (req.url === '/api/v1/agent/check' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
          const payload = JSON.parse(body);
          const ready = payload.skill_hash === manifest.skills.codex.hash;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: ready ? 'ready' : 'blocked',
            blocking: !ready,
            manifest_current: true,
            client: 'codex',
            runtime: { current: true, local: { version: '0.1.0', hash: 'sha256-runtime' }, target: manifest.mcp.runtime },
            skill: { current: ready, local: { version: ready ? '1.1.0' : '0.0.1', hash: payload.skill_hash }, target: manifest.skills.codex },
            reasons: ready ? [] : ['skill_outdated'],
          }));
        });
        return;
      }

      if (req.url === '/skill/codex') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(nextSkillContent);
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const state = await initializeBootstrapState({
        client: 'codex',
        serverUrl: `http://127.0.0.1:${port}`,
        mcpVersion: '0.1.0',
        runtimeHash: 'sha256-runtime',
        skillVersion: '0.0.1',
        skillHash: 'sha256-old',
        skillPath: targetPath,
      });

      expect(state.status).toBe('ready');
      expect(await fs.readFile(targetPath, 'utf-8')).toBe(nextSkillContent);
      expect(state.details).toContain('skill_auto_updated');
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
