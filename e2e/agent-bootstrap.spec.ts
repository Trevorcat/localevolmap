import { test, expect } from '@playwright/test';

test.describe('Agent bootstrap API E2E', () => {
  test('returns the full agent bootstrap checklist', async ({ request }) => {
    const response = await request.get('/api/v1/agent/bootstrap');
    const body = await response.json();

    expect(response.ok()).toBeTruthy();
    expect(body.project.preferred_runtime).toBe('local-mcp');
    expect(body.server.bootstrap_url).toBe('/api/v1/agent/bootstrap');
    expect(body.clients.codex.mcp_config.server_name).toBe('local-evomap');
    expect(body.clients.cursor.automation_level).toBe('full');
    expect(body.clients.kimi.automation_level).toBe('partial');
  });

  test('filters the bootstrap checklist to a requested client', async ({ request }) => {
    const response = await request.get('/api/v1/agent/bootstrap?client=codex');
    const body = await response.json();

    expect(response.ok()).toBeTruthy();
    expect(Object.keys(body.clients)).toEqual(['codex']);
    expect(body.clients.codex.skill.target_path).toBe('~/.codex/AGENTS.md');
  });
});
