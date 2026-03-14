import * as path from 'path';
import { loadAgentManifest } from './agent-manifest';
import type {
  AgentBootstrapChecklist,
  AgentBootstrapClientChecklist,
  AgentBootstrapEnvVar,
  AgentBootstrapPostInstallCheck,
  AgentBootstrapStep,
  AgentClient,
  BuildAgentBootstrapChecklistOptions,
} from './types/agent-bootstrap-schema';

const BOOTSTRAP_PATH = '/api/v1/agent/bootstrap';
const MANIFEST_PATH = '/api/v1/agent-manifest';
const CHECK_PATH = '/api/v1/agent/check';
const SERVER_NAME = 'local-evomap';
const REPO_ROOT_TOKEN = '{repo_root}';
const MCP_ENTRYPOINT = 'dist/mcp/server.js';
const MCP_ENTRYPOINT_TOKEN = `${REPO_ROOT_TOKEN}/${MCP_ENTRYPOINT}`;
const ALL_CLIENTS: AgentClient[] = ['codex', 'claude-code', 'cursor', 'opencode', 'kimi'];
const FULL_AUTOMATION_CLIENTS = new Set<AgentClient>(['codex', 'claude-code', 'cursor']);

const SHARED_ENV: AgentBootstrapEnvVar[] = [
  {
    name: 'LOCAL_EVOMAP_SERVER_URL',
    required: true,
    description: 'Base URL of the authoritative LocalEvomap server.',
    example: 'http://your-server.example.com:3000',
  },
  {
    name: 'LOCAL_EVOMAP_API_KEY',
    required: true,
    secret: true,
    description: 'Bearer token used by bootstrap, task, and finalize APIs.',
    example: 'YOUR_API_KEY',
  },
  {
    name: 'LOCAL_EVOMAP_CLIENT',
    required: true,
    description: 'Client identifier reported by the local MCP runtime during bootstrap.',
    example: 'codex',
  },
  {
    name: 'LOCAL_EVOMAP_SKILL_PATH',
    required: false,
    description: 'Local instruction file that should receive the downloaded LocalEvomap skill.',
  },
  {
    name: 'GENES_PATH',
    required: false,
    description: 'Optional local genes cache path for the stdio MCP runtime.',
    example: `${REPO_ROOT_TOKEN}/data/genes`,
  },
  {
    name: 'CAPSULES_PATH',
    required: false,
    description: 'Optional local capsules cache path for the stdio MCP runtime.',
    example: `${REPO_ROOT_TOKEN}/data/capsules`,
  },
  {
    name: 'EVENTS_PATH',
    required: false,
    description: 'Optional local events path for the stdio MCP runtime.',
    example: `${REPO_ROOT_TOKEN}/data/events`,
  },
  {
    name: 'TASKS_PATH',
    required: false,
    description: 'Optional local tasks path for the stdio MCP runtime.',
    example: `${REPO_ROOT_TOKEN}/data/tasks`,
  },
];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildCheckBody(client: AgentClient, manifestVersion: string, runtimeVersion: string, runtimeHash: string, skillVersion: string, skillHash: string): Record<string, unknown> {
  return {
    client,
    manifest_version_seen: manifestVersion,
    mcp_version: runtimeVersion,
    mcp_hash: runtimeHash,
    skill_version: skillVersion,
    skill_hash: skillHash,
  };
}

function buildStdioSteps(client: AgentClient, skillTargetPath: string, configPath: string, templatePath: string): AgentBootstrapStep[] {
  return [
    {
      id: 'download-skill',
      title: 'Download LocalEvomap skill',
      kind: 'download_file',
      description: 'Download the checked-in skill and save it to the client instruction file.',
      source_path: `/skill/${client}`,
      target: skillTargetPath,
    },
    {
      id: 'install-dependencies',
      title: 'Install repository dependencies',
      kind: 'run_command',
      description: 'Install npm dependencies before building the local MCP runtime.',
      command: {
        program: 'npm',
        args: ['install'],
        cwd: REPO_ROOT_TOKEN,
      },
    },
    {
      id: 'build-local-mcp',
      title: 'Build the local MCP runtime',
      kind: 'run_command',
      description: 'Compile the local stdio MCP server used by the supported coding agents.',
      command: {
        program: 'npm',
        args: ['run', 'build'],
        cwd: REPO_ROOT_TOKEN,
      },
      expected: MCP_ENTRYPOINT,
    },
    {
      id: 'upsert-mcp-config',
      title: 'Register the local-evomap MCP server',
      kind: 'upsert_mcp_server',
      description: 'Add or update the client MCP config with the shared stdio server definition.',
      config_path: configPath,
      server_name: SERVER_NAME,
      command: {
        program: 'node',
        args: [MCP_ENTRYPOINT_TOKEN],
      },
      env: ['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH'],
    },
    {
      id: 'copy-template',
      title: 'Use the checked-in MCP template as a fallback',
      kind: 'copy_template',
      description: 'If the client cannot patch config directly, copy the checked-in template and replace placeholders.',
      source_path: templatePath,
      target: configPath,
      optional: true,
    },
    {
      id: 'reload-client',
      title: 'Reload the client MCP runtime',
      kind: 'restart_or_reload',
      description: 'Reload the coding client so it reconnects to the updated local MCP server.',
      target: configPath,
    },
  ];
}

function buildPartialSteps(client: AgentClient, skillTargetPath: string, configPath: string, templatePath: string): AgentBootstrapStep[] {
  return [
    {
      id: 'download-skill',
      title: 'Download LocalEvomap skill',
      kind: 'download_file',
      description: 'Download the checked-in skill so the agent can load the LocalEvomap workflow instructions.',
      source_path: `/skill/${client}`,
      target: skillTargetPath,
    },
    {
      id: 'install-dependencies',
      title: 'Install repository dependencies',
      kind: 'run_command',
      description: 'Install npm dependencies before building the local MCP runtime.',
      command: {
        program: 'npm',
        args: ['install'],
        cwd: REPO_ROOT_TOKEN,
      },
    },
    {
      id: 'build-local-mcp',
      title: 'Build the local MCP runtime',
      kind: 'run_command',
      description: 'Compile the local MCP runtime even when the current client uses the HTTP helper path.',
      command: {
        program: 'npm',
        args: ['run', 'build'],
        cwd: REPO_ROOT_TOKEN,
      },
      expected: MCP_ENTRYPOINT,
    },
    {
      id: 'copy-helper-config',
      title: 'Copy the checked-in helper template',
      kind: 'copy_template',
      description: 'Copy the repository helper template and replace the server URL plus API key placeholders.',
      source_path: templatePath,
      target: configPath,
    },
    {
      id: 'manual-client-registration',
      title: 'Manually register the runtime in the client',
      kind: 'manual_step',
      description: 'This client currently exposes an HTTP-oriented helper flow, so stdio MCP attachment remains manual.',
      target: configPath,
    },
  ];
}

function buildPostInstallChecks(client: AgentClient, manifestVersion: string, runtimeVersion: string, runtimeHash: string, skillVersion: string, skillHash: string, skillTargetPath: string): AgentBootstrapPostInstallCheck[] {
  return [
    {
      id: 'verify-skill-file',
      title: 'Verify the skill file exists',
      kind: 'verify_file_exists',
      target: skillTargetPath,
      success_signal: 'skill_file_present',
    },
    {
      id: 'check-bootstrap-status',
      title: 'Confirm bootstrap compatibility on the server',
      kind: 'http_post',
      target: CHECK_PATH,
      method: 'POST',
      body: buildCheckBody(client, manifestVersion, runtimeVersion, runtimeHash, skillVersion, skillHash),
      success_signal: 'status=ready|update_available',
    },
    {
      id: 'call-runtime-status',
      title: 'Confirm the local MCP runtime is alive',
      kind: 'mcp_call',
      target: 'get_runtime_status',
      success_signal: 'runtime.status=ready',
    },
  ];
}

function pickEnv(names: string[]): AgentBootstrapEnvVar[] {
  return SHARED_ENV.filter(item => names.includes(item.name));
}

function buildClientChecklist(client: AgentClient, manifest: Awaited<ReturnType<typeof loadAgentManifest>>): AgentBootstrapClientChecklist {
  const skill = manifest.skills[client];
  const runtime = manifest.mcp.runtime;
  const automationLevel = FULL_AUTOMATION_CLIENTS.has(client) ? 'full' : 'partial';

  switch (client) {
    case 'codex':
      return {
        enabled: true,
        automation_level: automationLevel,
        skill: {
          version: skill.version,
          hash: skill.hash,
          download_url: skill.download_url,
          target_path: '~/.codex/AGENTS.md',
          auto_update_supported: skill.auto_update_supported,
        },
        mcp_config: {
          server_name: SERVER_NAME,
          transport: 'stdio',
          config_path: '~/.codex/config.toml',
          template_path: 'docs/examples/codex.config.toml',
          command: 'node',
          args: [MCP_ENTRYPOINT_TOKEN],
          env_names: ['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH'],
        },
        env: pickEnv(['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH']),
        steps: buildStdioSteps(client, '~/.codex/AGENTS.md', '~/.codex/config.toml', 'docs/examples/codex.config.toml'),
        post_install_checks: buildPostInstallChecks(client, manifest.manifest_version, runtime.version, runtime.hash, skill.version, skill.hash, '~/.codex/AGENTS.md'),
        limitations: [],
      };
    case 'cursor':
      return {
        enabled: true,
        automation_level: automationLevel,
        skill: {
          version: skill.version,
          hash: skill.hash,
          download_url: skill.download_url,
          target_path: '~/.cursor/rules/localevomap.mdc',
          auto_update_supported: skill.auto_update_supported,
        },
        mcp_config: {
          server_name: SERVER_NAME,
          transport: 'stdio',
          config_path: '.cursor/mcp.json',
          template_path: 'docs/examples/.cursor/mcp.json',
          command: 'node',
          args: [MCP_ENTRYPOINT_TOKEN],
          env_names: ['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH'],
        },
        env: pickEnv(['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH']),
        steps: buildStdioSteps(client, '~/.cursor/rules/localevomap.mdc', '.cursor/mcp.json', 'docs/examples/.cursor/mcp.json'),
        post_install_checks: buildPostInstallChecks(client, manifest.manifest_version, runtime.version, runtime.hash, skill.version, skill.hash, '~/.cursor/rules/localevomap.mdc'),
        limitations: [],
      };
    case 'claude-code':
      return {
        enabled: true,
        automation_level: automationLevel,
        skill: {
          version: skill.version,
          hash: skill.hash,
          download_url: skill.download_url,
          target_path: '~/.claude/CLAUDE.md',
          auto_update_supported: skill.auto_update_supported,
        },
        mcp_config: {
          server_name: SERVER_NAME,
          transport: 'stdio',
          config_path: '.mcp.json',
          template_path: 'docs/examples/.mcp.json',
          command: 'node',
          args: [MCP_ENTRYPOINT_TOKEN],
          env_names: ['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH'],
        },
        env: pickEnv(['LOCAL_EVOMAP_CLIENT', 'LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY', 'LOCAL_EVOMAP_SKILL_PATH', 'GENES_PATH', 'CAPSULES_PATH', 'EVENTS_PATH', 'TASKS_PATH']),
        steps: buildStdioSteps(client, '~/.claude/CLAUDE.md', '.mcp.json', 'docs/examples/.mcp.json'),
        post_install_checks: buildPostInstallChecks(client, manifest.manifest_version, runtime.version, runtime.hash, skill.version, skill.hash, '~/.claude/CLAUDE.md'),
        limitations: [],
      };
    case 'opencode':
      return {
        enabled: true,
        automation_level: automationLevel,
        skill: {
          version: skill.version,
          hash: skill.hash,
          download_url: skill.download_url,
          target_path: 'skill/SKILL.md',
          auto_update_supported: skill.auto_update_supported,
        },
        mcp_config: {
          server_name: SERVER_NAME,
          transport: 'http',
          config_path: 'docs/examples/localevomap.remote.json',
          template_path: 'docs/examples/localevomap.remote.example.json',
          env_names: ['LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY'],
        },
        env: pickEnv(['LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY']),
        steps: buildPartialSteps(client, 'skill/SKILL.md', 'docs/examples/localevomap.remote.json', 'docs/examples/localevomap.remote.example.json'),
        post_install_checks: buildPostInstallChecks(client, manifest.manifest_version, runtime.version, runtime.hash, skill.version, skill.hash, 'skill/SKILL.md'),
        limitations: ['Current OpenCode integration is helper-template based; stdio MCP registration is still manual.'],
      };
    case 'kimi':
      return {
        enabled: true,
        automation_level: automationLevel,
        skill: {
          version: skill.version,
          hash: skill.hash,
          download_url: skill.download_url,
          target_path: 'skill/SKILL.md',
          auto_update_supported: skill.auto_update_supported,
        },
        mcp_config: {
          server_name: SERVER_NAME,
          transport: 'http',
          config_path: '.kimi/localevolmap.json',
          template_path: 'docs/examples/kimi.localevomap.json',
          env_names: ['LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY'],
        },
        env: pickEnv(['LOCAL_EVOMAP_SERVER_URL', 'LOCAL_EVOMAP_API_KEY']),
        steps: buildPartialSteps(client, 'skill/SKILL.md', '.kimi/localevolmap.json', 'docs/examples/kimi.localevomap.json'),
        post_install_checks: buildPostInstallChecks(client, manifest.manifest_version, runtime.version, runtime.hash, skill.version, skill.hash, 'skill/SKILL.md'),
        limitations: ['Current Kimi integration is helper-template based; stdio MCP registration is still manual.'],
      };
  }
}

export async function buildAgentBootstrapChecklist(options: BuildAgentBootstrapChecklistOptions): Promise<AgentBootstrapChecklist> {
  const projectRoot = options.projectRoot ?? path.resolve(__dirname, '..');
  const manifest = await loadAgentManifest(projectRoot);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const selectedClients = options.client ? [options.client] : ALL_CLIENTS;
  const absoluteRoot = path.resolve(projectRoot);

  const resolveTokens = (obj: unknown): unknown => {
    if (typeof obj === 'string') return obj.replace(/\{repo_root\}/g, absoluteRoot);
    if (Array.isArray(obj)) return obj.map(resolveTokens);
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveTokens(v)]));
    }
    return obj;
  };

  const checklist: AgentBootstrapChecklist = {
    schema_version: '2026-03-13.1',
    project: {
      name: 'LocalEvomap',
      repo_root: absoluteRoot,
      preferred_runtime: 'local-mcp',
      skill_entry: 'skill/SKILL.md',
      local_runtime_entry: MCP_ENTRYPOINT,
    },
    server: {
      base_url: baseUrl,
      bootstrap_url: BOOTSTRAP_PATH,
      manifest_url: MANIFEST_PATH,
      check_url: CHECK_PATH,
    },
    runtime: {
      server_name: SERVER_NAME,
      transport: 'stdio',
      command: 'node',
      args_template: [MCP_ENTRYPOINT_TOKEN],
      entrypoint: MCP_ENTRYPOINT,
      install_command: ['npm', 'install'],
      build_command: ['npm', 'run', 'build'],
    },
    shared_env: SHARED_ENV,
    clients: Object.fromEntries(selectedClients.map(client => [client, buildClientChecklist(client, manifest)])),
    verification: {
      runtime_tool: 'get_runtime_status',
      workspace_playbook: 'evomap://workspace/<workspace>/playbook',
      required_tools: ['start_task', 'search_knowledge', 'record_usage', 'get_task_context', 'finalize_task', 'get_runtime_status'],
    },
  };

  return resolveTokens(checklist) as AgentBootstrapChecklist;
}
