/**
 * Validation Gate - 安全验证门控
 * 
 * 负责命令执行安全验证和影响范围估算
 * 防止恶意的或高风险的进化操作
 */

import * as path from 'path';
import type { BlastRadius } from '../types/gene-capsule-schema';

// ============================================================================
// 命令安全验证
// ============================================================================

/**
 * 命令白名单验证
 * 
 * 安全规则：
 * 1. 只允许 node/npm/npx 前缀
 * 2. 禁止命令替换 $(...) 和 `...`
 * 3. 禁止 shell 操作符 &;|<>
 */
export function isValidationCommandAllowed(command: string): boolean {
  // 1. 前缀白名单
  if (!/^(node|npm|npx)\s/.test(command)) {
    return false;
  }
  
  // 2. 禁止命令替换
  if (/\$(\(|`)/.test(command)) {
    return false;
  }
  
  // 3. 禁止 shell 操作符（剥离引号后检查）
  const stripped = command.replace(/'[^']*'|"[^"]*"/g, '');
  if (/[;&|<>]/.test(stripped)) {
    return false;
  }
  
  // 4. 禁止危险路径
  if (command.includes('/etc/') || command.includes('C:\\Windows\\System32')) {
    return false;
  }
  
  // 5. 禁止删除操作
  if (/rm\s+-rf|del\s+/i.test(command)) {
    return false;
  }
  
  return true;
}

/**
 * 验证命令列表
 */
export function validateCommands(commands: string[]): {
  valid: string[];
  invalid: string[];
  reasons: Map<string, string>;
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const reasons = new Map<string, string>();
  
  for (const cmd of commands) {
    if (!isValidationCommandAllowed(cmd)) {
      invalid.push(cmd);
      
      // 确定拒绝原因
      if (!/^(node|npm|npx)\s/.test(cmd)) {
        reasons.set(cmd, 'Invalid command prefix');
      } else if (/\$(\(|`)/.test(cmd)) {
        reasons.set(cmd, 'Command substitution not allowed');
      } else if (/[;&|<>]/.test(cmd.replace(/'[^']*'|"[^"]*"/g, ''))) {
        reasons.set(cmd, 'Shell operators not allowed');
      } else {
        reasons.set(cmd, 'Security violation');
      }
    } else {
      valid.push(cmd);
    }
  }
  
  return { valid, invalid, reasons };
}

// ============================================================================
// 影响范围估算
// ============================================================================

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

/**
 * 估算影响范围
 * 
 * 风险评估：
 * - low: < 5 files, < 50 lines
 * - medium: 5-10 files, 50-200 lines
 * - high: 10-20 files, 200-500 lines
 * - critical: > 20 files, > 500 lines
 */
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
    // 检查是否触碰禁止路径
    if (forbiddenPaths.some(fp => file.includes(fp))) {
      forbiddenAccess = true;
      break;
    }
    
    // 统计行数
    totalLines += linesPerFile.get(file) || 0;
    
    // 提取目录
    const dir = file.split(/[\\/]/).slice(0, -1).join('/');
    if (dir) directories.add(dir);
    
    // 分类
    if (/\/__tests__\/|\.test\.|\.spec\./.test(file)) {
      testFiles.push(file);
    }
    if (/\/config\/|\.config\.|tsconfig|package\.json/.test(file)) {
      configFiles.push(file);
    }
  }
  
  // 风险评估
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  if (forbiddenAccess) {
    riskLevel = 'critical';
  } else if (filesToModify.length > 20 || totalLines > 500) {
    riskLevel = 'critical';
  } else if (filesToModify.length > 10 || totalLines > 200) {
    riskLevel = 'high';
  } else if (filesToModify.length > 5 || totalLines > 100) {
    riskLevel = 'medium';
  }
  
  return {
    files: filesToModify.length,
    lines: totalLines,
    directories: Array.from(directories),
    riskLevel,
    details: {
      forbiddenAccess,
      testFilesOnly: testFiles.length === filesToModify.length,
      configFilesOnly: configFiles.length === filesToModify.length
    }
  };
}

/**
 * 检查是否需要人工审批
 */
export function requiresApproval(
  blastRadius: BlastRadiusEstimate,
  config: {
    reviewMode: boolean;
    maxBlastRadius: { files: number; lines: number };
    autoApproveLowRisk: boolean;
  }
): boolean {
  // 审查模式：所有操作都需要审批
  if (config.reviewMode) return true;
  
  // 临界风险：总是需要审批
  if (blastRadius.riskLevel === 'critical') return true;
  
  // 触碰禁止路径
  if (blastRadius.details.forbiddenAccess) return true;
  
  // 超过最大影响范围
  if (blastRadius.files > config.maxBlastRadius.files) return true;
  if (blastRadius.lines > config.maxBlastRadius.lines) return true;
  
  // 低风险自动审批
  if (config.autoApproveLowRisk && blastRadius.riskLevel === 'low') {
    return false;
  }
  
  // 默认：medium 和 high 需要审批
  return blastRadius.riskLevel !== 'low';
}

// ============================================================================
// 路径安全
// ============================================================================

export interface PathSafetyCheck {
  safe: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * 路径安全检查
 */
export function checkPathSafety(
  paths: string[],
  baseDir: string,
  forbiddenPaths: string[]
): PathSafetyCheck {
  const violations: string[] = [];
  const warnings: string[] = [];
  
  for (const p of paths) {
    // 1. 检查路径遍历
    if (p.includes('..')) {
      const resolved = path.resolve(baseDir, p);
      if (!resolved.startsWith(baseDir)) {
        violations.push(`Path traversal detected: ${p}`);
      }
    }
    
    // 2. 检查禁止路径
    for (const forbidden of forbiddenPaths) {
      if (p.includes(forbidden)) {
        violations.push(`Forbidden path accessed: ${p} (contains ${forbidden})`);
      }
    }
    
    // 3. 敏感文件警告
    const sensitivePatterns = [
      /\.env$/,
      /\.pem$/,
      /\.key$/,
      /secrets\.json$/,
      /credentials/
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(p)) {
        warnings.push(`Sensitive file accessed: ${p}`);
      }
    }
  }
  
  return {
    safe: violations.length === 0,
    violations,
    warnings
  };
}

// ============================================================================
// 验证执行器
// ============================================================================

export interface ValidationResult {
  passed: boolean;
  commandsRun: number;
  successes: string[];
  failures: Array<{ command: string; error: string }>;
  durationMs: number;
}

/**
 * 验证执行配置
 */
export interface ValidationExecutorConfig {
  timeoutMs: number;
  maxConcurrent: number;
  failFast: boolean;
}

/**
 * 执行验证命令（需要配合 child_process 实现）
 * 
 * 这是一个框架，实际执行需要：
 * 1. 使用 node:child_process 或 node:exec
 * 2. 处理超时和错误
 * 3. 收集输出和退出码
 */
export async function executeValidation(
  commands: string[],
  config: Partial<ValidationExecutorConfig> = {}
): Promise<ValidationResult> {
  const defaults: ValidationExecutorConfig = {
    timeoutMs: 30000,
    maxConcurrent: 3,
    failFast: false
  };
  
  const opts = { ...defaults, ...config };
  
  const successes: string[] = [];
  const failures: Array<{ command: string; error: string }> = [];
  const startTime = Date.now();
  
  // 先验证命令安全性
  const { valid, invalid, reasons } = validateCommands(commands);
  
  if (invalid.length > 0) {
    for (const cmd of invalid) {
      failures.push({
        command: cmd,
        error: reasons.get(cmd) || 'Security violation'
      });
    }
    
    if (opts.failFast) {
      return {
        passed: false,
        commandsRun: invalid.length,
        successes: [],
        failures,
        durationMs: Date.now() - startTime
      };
    }
  }
  
  // 执行有效命令（这里简化为模拟）
  // 实际实现需要使用 child_process
  for (const cmd of valid) {
    // TODO: 实际执行命令
    // const { exec } = await import('node:child_process');
    // const result = await exec(cmd, { timeout: opts.timeoutMs });
    
    // 模拟成功
    successes.push(cmd);
  }
  
  return {
    passed: failures.length === 0,
    commandsRun: commands.length,
    successes,
    failures,
    durationMs: Date.now() - startTime
  };
}
