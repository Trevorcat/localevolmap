import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import type {
  AgentCheckRequest,
  AgentCheckResponse,
  AgentClient,
  AgentManifest,
  BootstrapStatus,
} from '../types/agent-bootstrap-schema';
import { autoUpdateSkill } from './skill-updater';

export interface BootstrapRuntimeState {
  status: BootstrapStatus;
  client: AgentClient;
  checkedAt: string;
  availableTools: string[];
  availableResources: string[];
  manifestVersion?: string;
  details: string[];
}

export interface InitializeBootstrapOptions {
  client: AgentClient;
  serverUrl: string;
  mcpVersion: string;
  runtimeHash: string;
  skillVersion?: string;
  skillHash?: string;
  skillPath?: string;
}

function computeHash(content: string): string {
  return `sha256-${createHash('sha256').update(content).digest('base64')}`;
}

async function readSkillHash(skillPath?: string): Promise<string | undefined> {
  if (!skillPath) return undefined;

  try {
    const content = await fs.readFile(skillPath, 'utf-8');
    return computeHash(content);
  } catch {
    return undefined;
  }
}

function buildAbsoluteUrl(serverUrl: string, relativeOrAbsoluteUrl: string): string {
  return new URL(relativeOrAbsoluteUrl, serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`).toString();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${url} -> ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function initializeBootstrapState(options: InitializeBootstrapOptions): Promise<BootstrapRuntimeState> {
  try {
    const manifest = await fetchJson<AgentManifest>(buildAbsoluteUrl(options.serverUrl, '/api/v1/agent-manifest'));
    const currentSkillHash = options.skillHash ?? await readSkillHash(options.skillPath);
    const initialRequest: AgentCheckRequest = {
      client: options.client,
      manifest_version_seen: manifest.manifest_version,
      mcp_version: options.mcpVersion,
      mcp_hash: options.runtimeHash,
      skill_version: options.skillVersion,
      skill_hash: currentSkillHash,
    };

    let check = await fetchJson<AgentCheckResponse>(buildAbsoluteUrl(options.serverUrl, '/api/v1/agent/check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialRequest),
    });

    const details = [...check.reasons];

    if (check.status !== 'ready' && !check.skill.current && check.skill.target.auto_update_supported && options.skillPath) {
      try {
        const updateResult = await autoUpdateSkill({
          client: options.client,
          downloadUrl: buildAbsoluteUrl(options.serverUrl, check.skill.target.download_url),
          expectedHash: check.skill.target.hash,
          targetPath: options.skillPath,
        });

        if (updateResult.updated) {
          details.push('skill_auto_updated');
          check = await fetchJson<AgentCheckResponse>(buildAbsoluteUrl(options.serverUrl, '/api/v1/agent/check'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...initialRequest,
              skill_version: check.skill.target.version,
              skill_hash: await readSkillHash(options.skillPath),
            } satisfies AgentCheckRequest),
          });
        }
      } catch (error) {
        return createStatusOnlyBootstrapState('update_failed', options.client, [
          ...details,
          `skill_update_failed:${(error as Error).message}`,
        ]);
      }
    }

    if (check.status === 'ready' || check.status === 'update_available') {
      return {
        status: check.status,
        client: options.client,
        checkedAt: new Date().toISOString(),
        availableTools: [
          'get_runtime_status',
          'start_task',
          'search_knowledge',
          'record_usage',
          'get_task_context',
          'finalize_task',
        ],
        availableResources: ['workspace_playbook', 'workspace_recent_successes'],
        manifestVersion: manifest.manifest_version,
        details,
      };
    }

    return createStatusOnlyBootstrapState(check.status, options.client, details);
  } catch (error) {
    return createStatusOnlyBootstrapState('unreachable', options.client, [(error as Error).message]);
  }
}

export function createStatusOnlyBootstrapState(
  status: Extract<BootstrapStatus, 'booting' | 'updating' | 'blocked' | 'unreachable' | 'update_failed'>,
  client: AgentClient,
  details: string[] = [],
): BootstrapRuntimeState {
  return {
    status,
    client,
    checkedAt: new Date().toISOString(),
    availableTools: ['get_runtime_status'],
    availableResources: [],
    details,
  };
}

export function createReadyBootstrapState(
  client: AgentClient,
  manifestVersion?: string,
  status: Extract<BootstrapStatus, 'ready' | 'update_available'> = 'ready',
): BootstrapRuntimeState {
  return {
    status,
    client,
    checkedAt: new Date().toISOString(),
    availableTools: [
      'get_runtime_status',
      'start_task',
      'search_knowledge',
      'record_usage',
      'get_task_context',
      'finalize_task',
    ],
    availableResources: ['workspace_playbook', 'workspace_recent_successes'],
    manifestVersion,
    details: [],
  };
}
