import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { LocalEvomap, DEFAULT_CONFIG } from '../index';
import { EvolutionService } from '../core/evolution-service';
import { TaskSessionStore } from '../storage/task-session-store';

export interface CreateMcpServerOptions {
  evolutionService: EvolutionService;
}

type ToolSchema = z.ZodTypeAny;

interface ToolDefinition<TSchema extends ToolSchema = ToolSchema> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (args: z.infer<TSchema>) => Promise<unknown>;
}

interface ResourceDefinition {
  name: string;
  description: string;
  match(uri: string): boolean;
  handler(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;
}

export class LocalEvomapMcpServer {
  private readonly sdkServer: McpServer;
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly resources: ResourceDefinition[] = [];

  constructor(private readonly options: CreateMcpServerOptions) {
    this.sdkServer = new McpServer(
      { name: 'local-evomap-mcp', version: '0.1.0' },
      {
        capabilities: {
          tools: {},
          resources: {}
        },
        instructions: 'Use task-centered tools to start work, record knowledge usage, and finalize with a retrospective.'
      }
    );

    this.registerTools();
    this.registerResources();
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }

  async callTool<TArgs extends Record<string, unknown>>(name: string, args: TArgs): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown MCP tool: ${name}`);
    }

    const parsed = tool.schema.parse(args);
    return tool.handler(parsed);
  }

  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    const resource = this.resources.find(item => item.match(uri));
    if (!resource) {
      throw new Error(`Unknown MCP resource: ${uri}`);
    }
    return resource.handler(uri);
  }

  getSdkServer(): McpServer {
    return this.sdkServer;
  }

  async connectStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.sdkServer.connect(transport);
  }

  private registerTools(): void {
    const startTaskSchema = z.object({
      goal: z.string().min(1),
      workspace: z.string().min(1),
      client: z.string().min(1),
      initialSignals: z.array(z.string()).optional()
    });

    const searchKnowledgeSchema = z.object({
      taskId: z.string().optional(),
      signals: z.array(z.string()).optional(),
      query: z.string().optional(),
      workspace: z.string().optional(),
      limit: z.number().int().positive().optional()
    });

    const recordUsageSchema = z.object({
      taskId: z.string().min(1),
      knowledge: z.array(z.object({
        kind: z.enum(['gene', 'capsule']),
        id: z.string().min(1),
        phase: z.enum(['plan', 'implement', 'validate']),
        note: z.string().optional()
      })).min(1)
    });

    const getTaskContextSchema = z.object({
      taskId: z.string().min(1)
    });

    const finalizeTaskSchema = z.object({
      taskId: z.string().min(1),
      summary: z.string().min(1),
      outcome: z.object({
        status: z.enum(['success', 'partial', 'failed']),
        score: z.number().min(0).max(1)
      }),
      retrospective: z.object({
        signals: z.array(z.string()),
        selfMistakes: z.array(z.string()).default([]),
        userCorrections: z.array(z.string()).default([]),
        validations: z.array(z.object({
          command: z.string().min(1),
          passed: z.boolean(),
          notes: z.string().optional()
        })).default([])
      }),
      createCapsule: z.boolean().default(true)
    });

    this.registerTool('start_task', 'Create a task session and return the first knowledge recommendations.', startTaskSchema, async args => {
      return this.options.evolutionService.startTask(args);
    });

    this.registerTool('search_knowledge', 'Search genes and capsules for the current task signals.', searchKnowledgeSchema, async args => {
      return this.options.evolutionService.searchKnowledge(args);
    });

    this.registerTool('record_usage', 'Record the genes and capsules actually used by the agent.', recordUsageSchema, async args => {
      return this.options.evolutionService.recordUsage(args);
    });

    this.registerTool('get_task_context', 'Read the current task session state and retrospective draft.', getTaskContextSchema, async args => {
      return this.options.evolutionService.getTaskContext(args);
    });

    this.registerTool('finalize_task', 'Finalize a task and feed the retrospective back into LocalEvomap.', finalizeTaskSchema, async args => {
      return this.options.evolutionService.finalizeTask(args);
    });
  }

  private registerResources(): void {
    const workspacePlaybookTemplate = new ResourceTemplate('evomap://workspace/{workspace}/playbook', {
      list: undefined
    });

    const playbookHandler = async (uri: string) => {
      const workspace = this.extractWorkspaceFromPlaybookUri(uri);
      const payload = await this.options.evolutionService.getWorkspacePlaybook(workspace);
      return this.buildJsonResource(uri, payload);
    };

    const recentSuccessesTemplate = new ResourceTemplate('evomap://workspace/{workspace}/recent-successes', {
      list: undefined
    });

    const recentSuccessesHandler = async (uri: string) => {
      const workspace = this.extractWorkspaceFromRecentSuccessesUri(uri);
      const payload = await this.options.evolutionService.getWorkspaceRecentSuccesses(workspace);
      return this.buildJsonResource(uri, payload);
    };

    this.resources.push({
      name: 'workspace_playbook',
      description: 'Aggregated workspace-specific guidance from finalized tasks.',
      match: uri => /^evomap:\/\/workspace\/[^/]+\/playbook$/i.test(uri),
      handler: playbookHandler
    });

    this.sdkServer.registerResource('workspace_playbook', workspacePlaybookTemplate, {
      description: 'Aggregated workspace-specific guidance from finalized tasks.',
      mimeType: 'application/json'
    }, (async (uri: URL) => {
      return playbookHandler(uri.toString());
    }) as any);

    this.resources.push({
      name: 'workspace_recent_successes',
      description: 'Recent successful finalized tasks for the workspace.',
      match: uri => /^evomap:\/\/workspace\/[^/]+\/recent-successes$/i.test(uri),
      handler: recentSuccessesHandler
    });

    this.sdkServer.registerResource('workspace_recent_successes', recentSuccessesTemplate, {
      description: 'Recent successful finalized tasks for the workspace.',
      mimeType: 'application/json'
    }, (async (uri: URL) => {
      return recentSuccessesHandler(uri.toString());
    }) as any);
  }

  private registerTool<TSchema extends ToolSchema>(name: string, description: string, schema: TSchema, handler: (args: z.infer<TSchema>) => Promise<unknown>): void {
    const definition: ToolDefinition<TSchema> = {
      name,
      description,
      schema,
      handler
    };

    this.tools.set(name, definition);
    this.sdkServer.registerTool(name, {
      description,
      inputSchema: schema as any
    }, (async (args: any) => {
      const result = await handler(args as z.infer<TSchema>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>
      };
    }) as any);
  }

  private extractWorkspaceFromPlaybookUri(uri: string): string {
    const match = uri.match(/^evomap:\/\/workspace\/([^/]+)\/playbook$/i);
    if (!match) {
      throw new Error(`Invalid workspace playbook URI: ${uri}`);
    }

    return decodeURIComponent(match[1]);
  }

  private extractWorkspaceFromRecentSuccessesUri(uri: string): string {
    const match = uri.match(/^evomap:\/\/workspace\/([^/]+)\/recent-successes$/i);
    if (!match) {
      throw new Error(`Invalid workspace recent successes URI: ${uri}`);
    }

    return decodeURIComponent(match[1]);
  }

  private buildJsonResource(uri: string, payload: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2)
      }]
    };
  }
}

export function createMcpServer(options: CreateMcpServerOptions): LocalEvomapMcpServer {
  return new LocalEvomapMcpServer(options);
}

function loadEnvFile(envPath: string): void {
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) {
        continue;
      }

      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing .env files.
  }
}

function resolveProjectRoot(): string {
  const distSuffix = `${path.sep}dist${path.sep}mcp`;
  return __dirname.endsWith(distSuffix)
    ? path.resolve(__dirname, '..', '..')
    : path.resolve(__dirname, '..');
}

export async function createDefaultMcpServer(): Promise<LocalEvomapMcpServer> {
  const projectRoot = resolveProjectRoot();
  loadEnvFile(path.join(projectRoot, '.env'));

  const genesPath = process.env.GENES_PATH || DEFAULT_CONFIG.genes_path;
  const capsulesPath = process.env.CAPSULES_PATH || DEFAULT_CONFIG.capsules_path;
  const eventsPath = process.env.EVENTS_PATH || DEFAULT_CONFIG.events_path;
  const tasksPath = process.env.TASKS_PATH || path.join(path.dirname(eventsPath), 'tasks');

  const evomap = new LocalEvomap({
    ...DEFAULT_CONFIG,
    genes_path: genesPath,
    capsules_path: capsulesPath,
    events_path: eventsPath,
    review_mode: process.env.EVOMAP_REVIEW_MODE !== undefined
      ? process.env.EVOMAP_REVIEW_MODE === 'true'
      : DEFAULT_CONFIG.review_mode
  });
  await evomap.init();

  const taskStore = new TaskSessionStore(tasksPath);
  await taskStore.init();

  return createMcpServer({
    evolutionService: new EvolutionService({ evomap, taskStore })
  });
}

if (require.main === module) {
  createDefaultMcpServer()
    .then(server => server.connectStdio())
    .catch(error => {
      console.error('[LocalEvomap MCP] Failed to start:', error);
      process.exit(1);
    });
}
