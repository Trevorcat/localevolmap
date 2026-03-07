jest.mock('child_process', () => ({
  exec: jest.fn((command: string, options: unknown, callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
    const done = typeof options === 'function' ? options as typeof callback : callback;
    setTimeout(() => done(null, '', ''), command.includes('slow-1') ? 20 : 5);
    return {};
  })
}));

import {
  isValidationCommandAllowed,
  checkPathSafety,
  estimateBlastRadius,
  executeValidation,
  matchesForbiddenPath
} from './validation-gate';

describe('validation-gate', () => {
  test('blocks node eval and unsafe npx packages', () => {
    expect(isValidationCommandAllowed('node -e "process.exit(0)"')).toBe(false);
    expect(isValidationCommandAllowed('node --eval "console.log(1)"')).toBe(false);
    expect(isValidationCommandAllowed('npx some-malicious-package')).toBe(false);
    expect(isValidationCommandAllowed('npm test')).toBe(true);
  });

  test('matches forbidden path exactly without blocking .github', () => {
    expect(matchesForbiddenPath('.git/config', '.git')).toBe(true);
    expect(matchesForbiddenPath('.github/workflows/ci.yml', '.git')).toBe(false);
    expect(matchesForbiddenPath('secrets/private.key', '*.key')).toBe(true);
  });

  test('detects path traversal and sensitive warnings', () => {
    const result = checkPathSafety(['../../etc/passwd', '.env.local'], process.cwd(), ['.git']);
    expect(result.safe).toBe(false);
    expect(result.violations.some(message => message.includes('Path traversal'))).toBe(true);
    expect(result.warnings.some(message => message.includes('.env.local'))).toBe(true);
  });

  test('adjusts blast radius by file importance', () => {
    const lowRisk = estimateBlastRadius(['src/foo.test.ts'], new Map([['src/foo.test.ts', 200]]), ['.git']);
    const highRisk = estimateBlastRadius(['package.json'], new Map([['package.json', 5]]), ['.git']);
    expect(lowRisk.riskLevel).toBe('low');
    expect(highRisk.riskLevel).toBe('medium');
  });

  test('executes validation in batches respecting maxConcurrent', async () => {
    const result = await executeValidation(['npm test slow-1', 'npm test fast-2', 'npm test fast-3'], {
      maxConcurrent: 2,
      failFast: false,
      timeoutMs: 1000
    });

    expect(result.passed).toBe(true);
    expect(result.commandsRun).toBe(3);
    expect(result.successes).toHaveLength(3);
  });
});
