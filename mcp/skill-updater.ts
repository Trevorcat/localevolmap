import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { AgentClient } from '../types/agent-bootstrap-schema';
import { computeStableBootstrapHash } from '../core/agent-manifest';

const AUTO_UPDATE_CLIENTS = new Set<AgentClient>(['codex', 'claude-code', 'cursor']);

export interface AutoUpdateSkillOptions {
  client: AgentClient;
  downloadUrl: string;
  expectedHash: string;
  targetPath?: string;
}

export interface AutoUpdateSkillResult {
  updated: boolean;
  reason: string;
  targetPath?: string;
  hash?: string;
}

export function isAutoUpdateSupported(client: AgentClient): boolean {
  return AUTO_UPDATE_CLIENTS.has(client);
}

export function resolveSkillTargetPath(client: AgentClient): string | undefined {
  const home = os.homedir();
  switch (client) {
    case 'codex':
      return path.join(home, '.codex', 'AGENTS.md');
    case 'claude-code':
      return path.join(home, '.claude', 'CLAUDE.md');
    case 'cursor':
      return path.join(home, '.cursor', 'rules', 'localevomap.mdc');
    default:
      return undefined;
  }
}

export async function autoUpdateSkill(options: AutoUpdateSkillOptions): Promise<AutoUpdateSkillResult> {
  if (!isAutoUpdateSupported(options.client)) {
    return { updated: false, reason: `unsupported client: ${options.client}` };
  }

  const targetPath = options.targetPath ?? resolveSkillTargetPath(options.client);
  if (!targetPath) {
    return { updated: false, reason: `no writable skill path for client: ${options.client}` };
  }

  const response = await fetch(options.downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download skill from ${options.downloadUrl}: ${response.status}`);
  }

  const content = await response.text();
  const actualHash = computeStableBootstrapHash(content);
  if (actualHash !== options.expectedHash) {
    throw new Error(`Downloaded skill hash mismatch for ${options.client}`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, targetPath);

  return {
    updated: true,
    reason: 'updated',
    targetPath,
    hash: actualHash,
  };
}
