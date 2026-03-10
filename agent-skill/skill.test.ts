import * as fs from 'fs/promises';
import * as path from 'path';

describe('agent MCP skill', () => {
  test('documents the MCP-first workflow and task completion responsibility', async () => {
    const skillPath = path.join(__dirname, 'SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');

    expect(content).toContain('start_task');
    expect(content).toContain('record_usage');
    expect(content).toContain('finalize_task');
    expect(content).toContain('agent decides when a task is complete');
  });
});
