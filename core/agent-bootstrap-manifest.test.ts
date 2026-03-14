import * as path from 'path';
import { buildAgentBootstrapChecklist } from './agent-bootstrap-manifest';
import type { AgentBootstrapClientChecklist } from './types/agent-bootstrap-schema';

describe('agent bootstrap checklist builder', () => {
  test('builds an agent-readable install checklist for supported clients', async () => {
    const payload = await buildAgentBootstrapChecklist({
      projectRoot: path.resolve(__dirname, '..'),
      baseUrl: 'http://localhost:3000',
    });

    const codex = payload.clients.codex!;
    const cursor = payload.clients.cursor!;
    const claudeCode = payload.clients['claude-code']!;
    const opencode = payload.clients.opencode!;
    const kimi = payload.clients.kimi!;

    expect(payload.schema_version).toBeTruthy();
    expect(payload.project.preferred_runtime).toBe('local-mcp');
    expect(payload.server.bootstrap_url).toBe('/api/v1/agent/bootstrap');
    expect(payload.server.manifest_url).toBe('/api/v1/agent-manifest');
    expect(payload.server.check_url).toBe('/api/v1/agent/check');
    expect(codex.skill.download_url).toBe('/skill/codex');
    expect(codex.mcp_config.server_name).toBe('local-evomap');
    expect(codex.mcp_config.config_path).toBe('~/.codex/config.toml');
    expect(codex.skill.target_path).toBe('~/.codex/AGENTS.md');
    expect(cursor.automation_level).toBe('full');
    expect(claudeCode.automation_level).toBe('full');
    expect(opencode.automation_level).toBe('partial');
    expect(kimi.automation_level).toBe('partial');
    expect(codex.steps.length).toBeGreaterThan(0);
    expect(payload.verification.runtime_tool).toBe('get_runtime_status');
  });

  test('filters checklist output to a single client while keeping shared metadata', async () => {
    const payload = await buildAgentBootstrapChecklist({
      projectRoot: path.resolve(__dirname, '..'),
      baseUrl: 'http://localhost:3000',
      client: 'codex',
    });

    expect(Object.keys(payload.clients)).toEqual(['codex']);
    expect(payload.clients.codex!.enabled).toBe(true);
    expect(payload.server.base_url).toBe('http://localhost:3000');
  });

  test('keeps every client entry structurally complete', async () => {
    const payload = await buildAgentBootstrapChecklist({
      projectRoot: path.resolve(__dirname, '..'),
      baseUrl: 'http://localhost:3000',
    });

    for (const client of Object.values(payload.clients) as AgentBootstrapClientChecklist[]) {
      expect(client.skill).toBeDefined();
      expect(client.mcp_config).toBeDefined();
      expect(client.steps.length).toBeGreaterThan(0);
      expect(client.post_install_checks.length).toBeGreaterThan(0);
      expect(
        client.post_install_checks.some(check => (
          (check.kind === 'http_post' && check.target === '/api/v1/agent/check')
          || (check.kind === 'mcp_call' && check.target === 'get_runtime_status')
        ))
      ).toBe(true);
    }
  });
});
