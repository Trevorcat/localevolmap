import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TaskSessionStore } from './task-session-store';

describe('TaskSessionStore', () => {
  async function createTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'localevomap-task-session-'));
  }

  afterEach(async () => {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('localevomap-task-session-'))
      .map(entry => fs.rm(path.join(tmpRoot, entry.name), { recursive: true, force: true })));
  });

  test('creates an active task session', async () => {
    const root = await createTempRoot();
    const store = new TaskSessionStore(path.join(root, 'tasks'));
    await store.init();

    const task = await store.create({
      goal: 'wire MCP integration',
      workspace: 'capability',
      client: 'codex',
      signals: ['mcp', 'task-session', 'mcp']
    });

    expect(task.taskId).toMatch(/^task_/);
    expect(task.status).toBe('active');
    expect(task.goal).toBe('wire MCP integration');
    expect(task.workspace).toBe('capability');
    expect(task.client).toBe('codex');
    expect(task.signals).toEqual(['mcp', 'task-session']);
    expect(task.knowledgeRefs).toEqual([]);
    expect(task.openedAt).toBeTruthy();

    const loaded = await store.get(task.taskId);
    expect(loaded).toEqual(task);
  });

  test('deduplicates repeated knowledge usage', async () => {
    const root = await createTempRoot();
    const store = new TaskSessionStore(path.join(root, 'tasks'));
    await store.init();

    const task = await store.create({
      goal: 'track reused knowledge',
      workspace: 'capability',
      client: 'codex',
      signals: ['mcp']
    });

    await store.recordUsage(task.taskId, {
      kind: 'gene',
      id: 'gene_feature_add',
      phase: 'implement',
      note: 'adopted the suggested workflow'
    });

    const updated = await store.recordUsage(task.taskId, {
      kind: 'gene',
      id: 'gene_feature_add',
      phase: 'implement',
      note: 'duplicate record should collapse'
    });

    expect(updated.knowledgeRefs).toHaveLength(1);
    expect(updated.knowledgeRefs[0]).toEqual(expect.objectContaining({
      kind: 'gene',
      id: 'gene_feature_add',
      phase: 'implement',
      note: 'adopted the suggested workflow'
    }));
    expect(updated.knowledgeRefs[0].usedAt).toBeTruthy();
  });

  test('finalizes a task session with outcome and retrospective', async () => {
    const root = await createTempRoot();
    const store = new TaskSessionStore(path.join(root, 'tasks'));
    await store.init();

    const task = await store.create({
      goal: 'close the loop',
      workspace: 'capability',
      client: 'codex',
      signals: ['task-complete']
    });

    const finalized = await store.finalize(task.taskId, {
      summary: 'Replaced direct HTTP usage with task-oriented MCP flow.',
      signals: ['task-complete', 'mcp'],
      selfMistakes: ['Initially left one HTTP helper in place'],
      userCorrections: ['User requested no compatibility path'],
      validations: [{ command: 'npm run build', passed: true }],
      outcome: { status: 'success', score: 0.95 }
    });

    expect(finalized.status).toBe('finalized');
    expect(finalized.finalizedAt).toBeTruthy();
    expect(finalized.retrospective).toEqual(expect.objectContaining({
      summary: 'Replaced direct HTTP usage with task-oriented MCP flow.',
      signals: ['task-complete', 'mcp']
    }));
    expect(finalized.outcome).toEqual({ status: 'success', score: 0.95 });
  });
});
