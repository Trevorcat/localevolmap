import * as fs from 'fs/promises';
import * as path from 'path';

describe('MCP client configuration docs', () => {
  test('cover Cursor, Claude Code, and Codex examples', async () => {
    const filePath = path.join(__dirname, 'MCP_CLIENT_CONFIG.md');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toContain('Cursor');
    expect(content).toContain('.cursor/mcp.json');
    expect(content).toContain('Claude Code');
    expect(content).toContain('.mcp.json');
    expect(content).toContain('OpenAI Codex');
    expect(content).toContain('~/.codex/config.toml');
    expect(content).toContain('dist/mcp/server.js');
  });
});
