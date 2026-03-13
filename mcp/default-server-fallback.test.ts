import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createDefaultMcpServer } from './server';

describe('createDefaultMcpServer local fallback', () => {
  let root: string;
  const originalEnv = {
    GENES_PATH: process.env.GENES_PATH,
    CAPSULES_PATH: process.env.CAPSULES_PATH,
    EVENTS_PATH: process.env.EVENTS_PATH,
    TASKS_PATH: process.env.TASKS_PATH,
    LOCAL_EVOMAP_SERVER_URL: process.env.LOCAL_EVOMAP_SERVER_URL,
    LOCAL_EVOMAP_CLIENT: process.env.LOCAL_EVOMAP_CLIENT,
    LOCAL_EVOMAP_SKILL_PATH: process.env.LOCAL_EVOMAP_SKILL_PATH,
    LOCAL_EVOMAP_API_KEY: process.env.LOCAL_EVOMAP_API_KEY,
    HUB_API_KEY: process.env.HUB_API_KEY,
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-default-mcp-fallback-'));
    process.env.GENES_PATH = path.join(root, 'genes');
    process.env.CAPSULES_PATH = path.join(root, 'capsules');
    process.env.EVENTS_PATH = path.join(root, 'events');
    process.env.TASKS_PATH = path.join(root, 'tasks');
    process.env.LOCAL_EVOMAP_SERVER_URL = 'http://127.0.0.1:9';
    process.env.LOCAL_EVOMAP_CLIENT = 'codex';
    process.env.LOCAL_EVOMAP_SKILL_PATH = path.resolve('opencode/localevomap-skill/codex-agents.md');
    process.env.HUB_API_KEY = 'test-api-key';
    process.env.LOCAL_EVOMAP_API_KEY = 'test-api-key';
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  test('falls back to the embedded local backend when bootstrap cannot reach the remote server', async () => {
    const server = await createDefaultMcpServer();

    const status = await server.callTool('get_runtime_status', {});
    const tools = await server.listTools();
    const started = await server.callTool('start_task', {
      goal: 'verify local fallback startup',
      workspace: 'capability',
      client: 'codex',
      initialSignals: ['fallback', 'local']
    });
    const playbook = await server.readResource('evomap://workspace/capability/playbook');
    const payload = JSON.parse(playbook.contents[0].text);

    expect(status.status).toBe('update_available');
    expect(status.availableTools).toEqual(expect.arrayContaining(['start_task', 'finalize_task']));
    expect(status.details).toContain('local_backend_fallback:unreachable');
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'start_task',
      'search_knowledge',
      'record_usage',
      'get_task_context',
      'finalize_task'
    ]));
    expect(started.taskId).toMatch(/^task_/);
    expect(payload.workspace).toBe('capability');
  });
});
