import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import type { PluginConfig, PluginManifest, ResolvedPluginDefinition } from './types';

interface LoadPluginDefinitionsOptions {
  projectRoot: string;
  pluginsDir?: string;
  configPath?: string;
}

interface PluginConfigFile {
  plugins?: Record<string, Partial<PluginConfig>>;
}

function stripUtf8Bom(raw: string): string {
  return raw.charCodeAt(0) == 0xfeff ? raw.slice(1) : raw;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(stripUtf8Bom(raw)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function loadPluginDefinitions(options: LoadPluginDefinitionsOptions): Promise<ResolvedPluginDefinition[]> {
  const projectRoot = path.resolve(options.projectRoot);
  const pluginsDir = path.resolve(options.pluginsDir ?? path.join(projectRoot, 'plugins'));
  const configPath = path.resolve(options.configPath ?? path.join(projectRoot, 'plugins.json'));

  const config = (await readJsonFile<PluginConfigFile>(configPath)) ?? { plugins: {} };

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(pluginsDir, { withFileTypes: true }) as unknown as Dirent[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const definitions: ResolvedPluginDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rootDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(rootDir, 'plugin.json');
    const manifest = await readJsonFile<PluginManifest>(manifestPath);
    if (!manifest) continue;

    const rawConfig = config.plugins?.[manifest.id] ?? {};
    const mergedConfig: PluginConfig = {
      enabled: rawConfig.enabled ?? false,
      port: rawConfig.port ?? 18110,
      startupTimeoutMs: rawConfig.startupTimeoutMs ?? 15000,
      requestTimeoutMs: rawConfig.requestTimeoutMs ?? 30000,
      dataDir: path.resolve(projectRoot, rawConfig.dataDir ?? path.join('data', 'plugins', manifest.id)),
      env: rawConfig.env ?? {}
    };

    definitions.push({
      id: manifest.id,
      enabled: mergedConfig.enabled,
      projectRoot,
      rootDir,
      manifestPath,
      manifest,
      config: mergedConfig
    });
  }

  return definitions.sort((left, right) => left.id.localeCompare(right.id));
}
