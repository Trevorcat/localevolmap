import * as fs from 'fs/promises';
import * as path from 'path';

describe('MCP example config files', () => {
  test('provide Cursor, Claude Code, and Codex example files', async () => {
    const root = path.resolve(__dirname, '..');
    const cursorPath = path.join(root, 'examples', '.cursor', 'mcp.json');
    const claudePath = path.join(root, 'examples', '.mcp.json');
    const codexPath = path.join(root, 'examples', 'codex.config.toml');

    const [cursorContent, claudeContent, codexContent] = await Promise.all([
      fs.readFile(cursorPath, 'utf-8'),
      fs.readFile(claudePath, 'utf-8'),
      fs.readFile(codexPath, 'utf-8')
    ]);

    expect(cursorContent).toContain('mcpServers');
    expect(cursorContent).toContain('local-evomap');
    expect(cursorContent).toContain('dist/mcp/server.js');

    expect(claudeContent).toContain('mcpServers');
    expect(claudeContent).toContain('local-evomap');
    expect(claudeContent).toContain('dist/mcp/server.js');

    expect(codexContent).toContain('[mcp_servers.local-evomap]');
    expect(codexContent).toContain('command = "node"');
    expect(codexContent).toContain('dist/mcp/server.js');
  });
});
