import * as fs from 'fs/promises';
import * as path from 'path';

describe('MCP client configuration docs', () => {
  test('cover Cursor, Claude Code, Codex, Kimi, and OpenCode examples', async () => {
    const filePath = path.join(__dirname, 'MCP_CLIENT_CONFIG.md');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toContain('Cursor');
    expect(content).toContain('.cursor/mcp.json');
    expect(content).toContain('Claude Code');
    expect(content).toContain('.mcp.json');
    expect(content).toContain('OpenAI Codex');
    expect(content).toContain('~/.codex/config.toml');
    expect(content).toContain('Kimi');
    expect(content).toContain('examples/kimi.localevomap.json');
    expect(content).toContain('OpenCode');
    expect(content).toContain('opencode/localevomap.remote.example.json');
    expect(content).toContain('dist/mcp/server.js');
    expect(content).toContain('get_runtime_status');
    expect(content).toContain('/api/v1/agent-manifest');
    expect(content).toContain('/api/v1/agent/check');
    expect(content).toContain('server unreachable disables formal tools');
    expect(content).toContain('automatic skill updates');
  });
});
