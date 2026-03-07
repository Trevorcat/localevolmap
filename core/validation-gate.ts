/**
 * Validation Gate - 安全验证门控
 */

import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SAFE_NPX_PACKAGES = new Set(['jest', 'vitest', 'eslint', 'prettier', 'tsc', 'ts-node', 'playwright']);

function tokenizeCommand(command: string): string[] {
  const matches = command.match(/(?:"[^"]*"|'[^']*'|[^\s"']+)/g) || [];
  return matches.map(token => token.replace(/^['"]|['"]$/g, ''));
}

export function matchesForbiddenPath(filePath: string, forbiddenPath: string): boolean {
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedForbidden = forbiddenPath.replace(/\\/g, '/');
  const basename = path.posix.basename(normalizedFile);
  const segments = normalizedFile.split('/').filter(Boolean);

  if (normalizedForbidden.startsWith('*.')) {
    return basename.endsWith(normalizedForbidden.slice(1));
  }

  if (normalizedForbidden.includes('/')) {
    return normalizedFile === normalizedForbidden || normalizedFile.startsWith(`${normalizedForbidden}/`);
  }

  return segments.includes(normalizedForbidden) || basename === normalizedForbidden;
}

export function isValidationCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  if (/\$(\(|`)/.test(trimmed)) return false;
  const stripped = trimmed.replace(/'[^']*'|"[^"]*"/g, '');
  if (/[;&|<>]/.test(stripped)) return false;
  if (trimmed.includes('/etc/') || trimmed.includes('C:\\Windows\\System32')) return false;

  const tokens = tokenizeCommand(trimmed);
  if (tokens.length === 0) return false;

  const executable = tokens[0];
  if (!['node', 'npm', 'npx'].includes(executable)) return false;

  if (/\brm\b/i.test(trimmed) && /(?:-rf|--recursive|--force)/i.test(trimmed)) return false;
  if (/\bdel\b/i.test(trimmed) || /\brmdir\b/i.test(trimmed)) return false;

  if (executable === 'node') {
    if (tokens.some(token => ['-e', '--eval', '-p', '--print'].includes(token))) return false;
    const scriptPath = tokens[1];
    if (!scriptPath) return false;
    if (['-v', '--version'].includes(scriptPath) && tokens.length === 2) return true;
    if (scriptPath.startsWith('-')) return false;
  }

  if (executable === 'npx') {
    const packageName = tokens[1];
    if (!packageName || !SAFE_NPX_PACKAGES.has(packageName)) return false;
  }

  return true;
}

export function validateCommands(commands: string[]): {
  valid: string[];
  invalid: string[];
  reasons: Map<string, string>;
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const reasons = new Map<string, string>();

  for (const command of commands) {
    if (!isValidationCommandAllowed(command)) {
      invalid.push(command);
      if (!command.trim()) reasons.set(command, 'Empty command');
      else reasons.set(command, 'Security violation');
    } else {
      valid.push(command);
    }
  }

  return { valid, invalid, reasons };
}

export interface BlastRadiusEstimate {
  files: number;
  lines: number;
  directories: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: {
    forbiddenAccess: boolean;
    testFilesOnly: boolean;
    configFilesOnly: boolean;
  };
}

function downgradeRisk(level: BlastRadiusEstimate['riskLevel']): BlastRadiusEstimate['riskLevel'] {
  return level === 'critical' ? 'high' : level === 'high' ? 'medium' : 'low';
}

function upgradeRisk(level: BlastRadiusEstimate['riskLevel']): BlastRadiusEstimate['riskLevel'] {
  return level === 'low' ? 'medium' : level === 'medium' ? 'high' : 'critical';
}

export function estimateBlastRadius(
  filesToModify: string[],
  linesPerFile: Map<string, number>,
  forbiddenPaths: string[]
): BlastRadiusEstimate {
  if (filesToModify.length === 0) {
    return {
      files: 0,
      lines: 0,
      directories: [],
      riskLevel: 'low',
      details: {
        forbiddenAccess: false,
        testFilesOnly: false,
        configFilesOnly: false
      }
    };
  }

  let totalLines = 0;
  const directories = new Set<string>();
  let forbiddenAccess = false;
  const testFiles: string[] = [];
  const configFiles: string[] = [];

  for (const file of filesToModify) {
    if (forbiddenPaths.some(forbiddenPath => matchesForbiddenPath(file, forbiddenPath))) {
      forbiddenAccess = true;
      break;
    }

    totalLines += linesPerFile.get(file) || 0;

    const dir = file.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    if (dir) directories.add(dir);

    if (/\/__tests__\/|\.test\.|\.spec\./.test(file)) testFiles.push(file);
    if (/\/config\/|\.config\.|tsconfig|package\.json/.test(file)) configFiles.push(file);
  }

  let riskLevel: BlastRadiusEstimate['riskLevel'] = 'low';
  if (forbiddenAccess) riskLevel = 'critical';
  else if (filesToModify.length > 20 || totalLines > 500) riskLevel = 'critical';
  else if (filesToModify.length > 10 || totalLines > 200) riskLevel = 'high';
  else if (filesToModify.length > 5 || totalLines > 100) riskLevel = 'medium';

  const testFilesOnly = testFiles.length === filesToModify.length;
  const configFilesOnly = configFiles.length === filesToModify.length;

  if (testFilesOnly && riskLevel !== 'low') riskLevel = downgradeRisk(riskLevel);
  if (configFilesOnly && riskLevel !== 'critical') riskLevel = upgradeRisk(riskLevel);

  return {
    files: filesToModify.length,
    lines: totalLines,
    directories: Array.from(directories),
    riskLevel,
    details: {
      forbiddenAccess,
      testFilesOnly,
      configFilesOnly
    }
  };
}

export function requiresApproval(
  blastRadius: BlastRadiusEstimate,
  config: {
    reviewMode: boolean;
    maxBlastRadius: { files: number; lines: number };
    autoApproveLowRisk: boolean;
    autoApproveMediumRisk?: boolean;
  }
): boolean {
  if (config.reviewMode) return true;
  if (blastRadius.riskLevel === 'critical') return true;
  if (blastRadius.details.forbiddenAccess) return true;
  if (blastRadius.files > config.maxBlastRadius.files) return true;
  if (blastRadius.lines > config.maxBlastRadius.lines) return true;
  if (config.autoApproveLowRisk && blastRadius.riskLevel === 'low') return false;
  if (config.autoApproveMediumRisk && blastRadius.riskLevel === 'medium') return false;
  return blastRadius.riskLevel !== 'low';
}

export interface PathSafetyCheck {
  safe: boolean;
  violations: string[];
  warnings: string[];
}

export function checkPathSafety(
  paths: string[],
  baseDir: string,
  forbiddenPaths: string[]
): PathSafetyCheck {
  const violations: string[] = [];
  const warnings: string[] = [];

  for (const candidatePath of paths) {
    const resolved = path.resolve(baseDir, candidatePath);
    const normalizedBase = path.resolve(baseDir);
    if (!resolved.startsWith(normalizedBase)) {
      violations.push(`Path traversal detected: ${candidatePath}`);
      continue;
    }

    for (const forbiddenPath of forbiddenPaths) {
      if (matchesForbiddenPath(candidatePath, forbiddenPath)) {
        violations.push(`Forbidden path accessed: ${candidatePath} (matches ${forbiddenPath})`);
      }
    }

    const sensitivePatterns = [/\.env(?:\..+)?$/i, /\.pem$/i, /\.key$/i, /secrets\.json$/i, /credentials/i];
    for (const pattern of sensitivePatterns) {
      if (pattern.test(candidatePath)) {
        warnings.push(`Sensitive file accessed: ${candidatePath}`);
      }
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    warnings
  };
}

export interface ValidationResult {
  passed: boolean;
  commandsRun: number;
  successes: string[];
  failures: Array<{ command: string; error: string }>;
  durationMs: number;
}

export interface ValidationExecutorConfig {
  timeoutMs: number;
  maxConcurrent: number;
  failFast: boolean;
}

export async function executeValidation(
  commands: string[],
  config: Partial<ValidationExecutorConfig> = {}
): Promise<ValidationResult> {
  const defaults: ValidationExecutorConfig = {
    timeoutMs: 30000,
    maxConcurrent: 3,
    failFast: false
  };

  const options = { ...defaults, ...config };
  const successes: string[] = [];
  const failures: Array<{ command: string; error: string }> = [];
  const startTime = Date.now();

  const { valid, invalid, reasons } = validateCommands(commands);
  for (const command of invalid) {
    failures.push({ command, error: reasons.get(command) || 'Security violation' });
  }

  if (invalid.length > 0 && options.failFast) {
    return {
      passed: false,
      commandsRun: invalid.length,
      successes,
      failures,
      durationMs: Date.now() - startTime
    };
  }

  for (let index = 0; index < valid.length; index += options.maxConcurrent) {
    const batch = valid.slice(index, index + options.maxConcurrent);
    const results = await Promise.allSettled(
      batch.map(async command => {
        await execAsync(command, { timeout: options.timeoutMs, cwd: process.cwd() });
        return command;
      })
    );

    results.forEach((result, batchIndex) => {
      const command = batch[batchIndex];
      if (result.status === 'fulfilled') {
        successes.push(command);
      } else {
        const reason = result.reason as { stderr?: string; message?: string };
        failures.push({ command, error: reason?.stderr || reason?.message || 'Command failed' });
      }
    });

    if (options.failFast && failures.length > 0) {
      break;
    }
  }

  return {
    passed: failures.length === 0,
    commandsRun: commands.length,
    successes,
    failures,
    durationMs: Date.now() - startTime
  };
}
