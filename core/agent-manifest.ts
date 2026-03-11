import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import type {
  AgentCheckRequest,
  AgentCheckResponse,
  AgentClient,
  AgentManifest,
  ManifestEntry,
  RawAgentManifest,
  RawManifestEntry,
} from '../types/agent-bootstrap-schema';

function buildHash(content: string): string {
  return `sha256-${createHash('sha256').update(content).digest('base64')}`;
}

async function hydrateEntry(projectRoot: string, entry: RawManifestEntry): Promise<ManifestEntry> {
  const sourcePath = path.resolve(projectRoot, entry.source.path);
  const content = await fs.readFile(sourcePath, 'utf-8');

  return {
    version: entry.version,
    breaking: entry.breaking ?? false,
    auto_update_supported: entry.auto_update_supported ?? false,
    hash: buildHash(content),
    download_url: entry.source.download_url,
    source_path: entry.source.path,
  };
}

export async function loadAgentManifest(projectRoot: string = path.resolve(__dirname, '..')): Promise<AgentManifest> {
  const manifestPath = path.resolve(projectRoot, 'config', 'agent-manifest.json');
  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as RawAgentManifest;

  const clients: AgentClient[] = ['codex', 'claude-code', 'cursor', 'opencode', 'kimi'];
  const hydratedSkills = await Promise.all(clients.map(async client => [client, await hydrateEntry(projectRoot, raw.skills[client])] as const));

  return {
    manifest_version: raw.manifest_version,
    generated_at: raw.generated_at ?? new Date(0).toISOString(),
    mcp: {
      runtime: await hydrateEntry(projectRoot, raw.mcp.runtime),
    },
    skills: Object.fromEntries(hydratedSkills) as AgentManifest['skills'],
  };
}

function isCurrent(expected: ManifestEntry, actualVersion?: string, actualHash?: string): boolean {
  return expected.version === actualVersion && expected.hash === actualHash;
}

export function evaluateAgentCompatibility(manifest: AgentManifest, request: AgentCheckRequest): AgentCheckResponse {
  const skillTarget = manifest.skills[request.client];
  const runtimeCurrent = isCurrent(manifest.mcp.runtime, request.mcp_version, request.mcp_hash);
  const skillCurrent = isCurrent(skillTarget, request.skill_version, request.skill_hash);
  const manifestCurrent = request.manifest_version_seen === manifest.manifest_version;
  const reasons: string[] = [];

  if (!manifestCurrent) reasons.push('manifest_version_outdated');
  if (!runtimeCurrent) reasons.push('mcp_runtime_outdated');
  if (!skillCurrent) reasons.push('skill_outdated');

  const blocking = (!runtimeCurrent && manifest.mcp.runtime.breaking) || (!skillCurrent && skillTarget.breaking);
  const status = blocking ? 'blocked' : (runtimeCurrent && skillCurrent && manifestCurrent ? 'ready' : 'update_available');

  return {
    status,
    blocking,
    manifest_current: manifestCurrent,
    client: request.client,
    runtime: {
      current: runtimeCurrent,
      local: {
        version: request.mcp_version,
        hash: request.mcp_hash,
      },
      target: manifest.mcp.runtime,
    },
    skill: {
      current: skillCurrent,
      local: {
        version: request.skill_version,
        hash: request.skill_hash,
      },
      target: skillTarget,
    },
    reasons,
  };
}
