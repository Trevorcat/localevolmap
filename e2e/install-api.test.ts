/**
 * E2E tests for install API endpoints
 * Tests /api/v1/install/plan and /api/v1/install/detect
 */

import * as http from 'http';
import { createHttpServer } from '../server';

interface InstallPlanResponse {
    success: boolean;
    detectedClient: string;
    detectedOS: string;
    plan: {
        skill?: {
            action: string;
            url: string;
            targetPath: string;
            description: string;
        };
        mcp?: {
            action: string;
            config: {
                mcpServers: {
                    localevomap: {
                        command: string;
                        args: string[];
                        env: {
                            LOCAL_EVOMAP_SERVER_URL: string;
                            LOCAL_EVOMAP_API_KEY: string;
                            LOCAL_EVOMAP_CLIENT: string;
                        };
                    };
                };
            };
            targetPath: string;
        };
        verification: {
            steps: Array<{ description: string; command?: string; endpoint?: string }>;
        };
    };
}

interface InstallDetectResponse {
    os: 'windows' | 'macos' | 'linux';
    shell: string;
    detectedClients: string[];
    preferredClient: string;
}

interface ErrorResponse {
    error: string;
    supportedClients?: string[];
}

interface SkillManifest {
    name: string;
    version: string;
}

describe('Install API endpoints', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = createHttpServer();
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address() as { port: number };
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    describe('POST /api/v1/install/plan', () => {
        it('returns install plan with default claude client', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.success).toBe(true);
            expect(data.detectedClient).toBe('claude');
            expect(data.detectedOS).toBeDefined();
            expect(data.plan).toBeDefined();
            expect(data.plan.skill).toBeDefined();
            expect(data.plan.mcp).toBeDefined();
            expect(data.plan.verification).toBeDefined();
            expect(Array.isArray(data.plan.verification.steps)).toBe(true);
        });

        it('respects client parameter', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client: 'cursor' })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.detectedClient).toBe('cursor');
            expect(data.plan.skill!.targetPath).toContain('cursor');
        });

        it('detects client from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 Cursor/1.0'
                },
                body: JSON.stringify({ client: 'auto' })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.detectedClient).toBe('cursor');
        });

        it('supports project scope', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope: 'project' })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.plan.skill!.targetPath).toContain('.claude/');
            expect(data.plan.skill!.targetPath).not.toContain('~/.claude/');
        });

        it('allows selecting features', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ features: ['skill'] })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.plan.skill).toBeDefined();
            expect(data.plan.mcp).toBeUndefined();
        });

        it('returns error for unsupported client', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client: 'unknown-client' })
            });

            expect(response.status).toBe(400);
            const data = await response.json() as ErrorResponse;

            expect(data.error).toContain('Unsupported client');
            expect(data.supportedClients).toContain('claude');
            expect(data.supportedClients).toContain('cursor');
        });

        it('returns error for invalid JSON body', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid json {'
            });

            expect(response.status).toBe(400);
            const data = await response.json() as ErrorResponse;

            expect(data.error).toContain('Invalid JSON');
        });

        it('detects codex client from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 Codex/1.0'
                },
                body: JSON.stringify({ client: 'auto' })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.detectedClient).toBe('codex');
        });

        it('detects opencode client from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 OpenCode/1.0'
                },
                body: JSON.stringify({ client: 'auto' })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.detectedClient).toBe('opencode');
        });

        it('allows selecting only mcp feature', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client: 'claude', features: ['mcp'] })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.plan.mcp).toBeDefined();
            expect(data.plan.skill).toBeUndefined();
        });

        it('uses custom serverUrl when provided', async () => {
            const customUrl = 'http://custom-server:8080';
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverUrl: customUrl })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.plan.skill!.url).toContain(customUrl);
            expect(data.plan.mcp!.config.mcpServers.localevomap.env.LOCAL_EVOMAP_SERVER_URL).toBe(customUrl);
        });

        it('includes MCP config with correct structure', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client: 'claude' })
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallPlanResponse;

            expect(data.plan.mcp).toBeDefined();
            expect(data.plan.mcp!.action).toBe('configure');
            expect(data.plan.mcp!.config).toBeDefined();
            expect(data.plan.mcp!.config.mcpServers).toBeDefined();
            expect(data.plan.mcp!.config.mcpServers.localevomap).toBeDefined();
            expect(data.plan.mcp!.config.mcpServers.localevomap.command).toBe('npx');
            expect(data.plan.mcp!.config.mcpServers.localevomap.args).toContain('@trevorcat/localevomap-mcp@latest');
            expect(data.plan.mcp!.config.mcpServers.localevomap.env).toBeDefined();
            expect(data.plan.mcp!.config.mcpServers.localevomap.env.LOCAL_EVOMAP_SERVER_URL).toBe(baseUrl);
        });
    });

    describe('GET /api/v1/install/detect', () => {
        it('returns environment detection results', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`);

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.os).toBeDefined();
            expect(['windows', 'macos', 'linux']).toContain(data.os);
            expect(data.shell).toBeDefined();
            expect(Array.isArray(data.detectedClients)).toBe(true);
            expect(data.detectedClients.length).toBeGreaterThan(0);
            expect(data.preferredClient).toBeDefined();
        });

        it('respects X-Client-Hint header', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`, {
                headers: { 'X-Client-Hint': 'cursor' }
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.preferredClient).toBe('cursor');
            expect(data.detectedClients).toContain('cursor');
        });

        it('detects Windows from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.os).toBe('windows');
            expect(data.shell).toBe('powershell');
        });

        it('detects macOS from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.os).toBe('macos');
        });

        it('detects Linux by default', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' }
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.os).toBe('linux');
            expect(data.shell).toBe('bash');
        });

        it('detects codex from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`, {
                headers: { 'User-Agent': 'Mozilla/5.0 Codex/1.0' }
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.detectedClients).toContain('codex');
        });

        it('detects opencode from User-Agent', async () => {
            const response = await fetch(`${baseUrl}/api/v1/install/detect`, {
                headers: { 'User-Agent': 'Mozilla/5.0 OpenCode/1.0' }
            });

            expect(response.status).toBe(200);
            const data = await response.json() as InstallDetectResponse;

            expect(data.detectedClients).toContain('opencode');
        });
    });

    describe('GET /skill/:client', () => {
        it('returns skill file for claude client', async () => {
            const response = await fetch(`${baseUrl}/skill/claude`);

            expect(response.status).toBe(200);
            const content = await response.text();

            expect(content).toContain('# LocalEvomap MCP Skill');
            expect(content.length).toBeGreaterThan(100);
        });

        it('returns skill file for cursor client', async () => {
            const response = await fetch(`${baseUrl}/skill/cursor`);

            expect(response.status).toBe(200);
            const content = await response.text();

            expect(content).toContain('# LocalEvomap MCP Skill');
        });

        it('returns 404 for unknown client', async () => {
            const response = await fetch(`${baseUrl}/skill/unknown-client`);

            expect(response.status).toBe(404);
        });

        it('returns skill.json manifest at /skill', async () => {
            const response = await fetch(`${baseUrl}/skill`);

            expect(response.status).toBe(200);
            const data = await response.json() as SkillManifest;

            expect(data.name).toBeDefined();
            expect(data.version).toBeDefined();
        });
    });
});
