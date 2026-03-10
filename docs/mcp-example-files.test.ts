import * as fs from 'fs/promises';
import * as path from 'path';

describe('MCP example config files', () => {
  test('provide Cursor, Claude Code, Codex, Kimi, and OpenCode example files', async () => {
    const root = path.resolve(__dirname, '..');
    const cursorPath = path.join(root, 'examples', '.cursor', 'mcp.json');
    const claudePath = path.join(root, 'examples', '.mcp.json');
    const codexPath = path.join(root, 'examples', 'codex.config.toml');
    const kimiPath = path.join(root, 'examples', 'kimi.localevomap.json');
    const opencodePath = path.join(root, 'opencode', 'localevomap.remote.example.json');

    const [cursorContent, claudeContent, codexContent, kimiContent, opencodeContent] = await Promise.all([
      fs.readFile(cursorPath, 'utf-8'),
      fs.readFile(claudePath, 'utf-8'),
      fs.readFile(codexPath, 'utf-8'),
      fs.readFile(kimiPath, 'utf-8'),
      fs.readFile(opencodePath, 'utf-8')
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

    expect(kimiContent).toContain('localevomap');
    expect(kimiContent).toContain('YOUR_API_KEY');
    expect(kimiContent).toContain('your-server.example.com');

    expect(opencodeContent).toContain('YOUR_API_KEY');
    expect(opencodeContent).toContain('your-server.example.com');
    expect(opencodeContent).toContain('/api/v1');
  });
});
