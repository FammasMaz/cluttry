/**
 * Tests for hooks.ts - hook runner utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runHooks, formatHookResults, type HookResult } from '../src/lib/hooks.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('runHooks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'cry-hooks-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns success for empty commands array', async () => {
    const result = await runHooks('test', [], { cwd: testDir });
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });

  it('runs a successful command', async () => {
    const result = await runHooks('test', ['echo "hello"'], {
      cwd: testDir,
      streamOutput: false,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].exitCode).toBe(0);
  });

  it('detects failed commands', async () => {
    const result = await runHooks('test', ['exit 1'], {
      cwd: testDir,
      streamOutput: false,
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].exitCode).toBe(1);
    expect(result.failedHook).toBe('exit 1');
  });

  it('stops on first failure with failFast=true (default)', async () => {
    const result = await runHooks(
      'test',
      ['echo "first"', 'exit 1', 'echo "third"'],
      { cwd: testDir, streamOutput: false }
    );

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2); // Stops after failure
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
  });

  it('continues on failure with failFast=false', async () => {
    const result = await runHooks(
      'test',
      ['echo "first"', 'exit 1', 'echo "third"'],
      { cwd: testDir, streamOutput: false, failFast: false }
    );

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(3); // Runs all commands
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[2].success).toBe(true);
  });

  it('uses correct working directory', async () => {
    // Create a test file in the test directory
    writeFileSync(path.join(testDir, 'testfile.txt'), 'hello');

    const result = await runHooks('test', ['ls testfile.txt'], {
      cwd: testDir,
      streamOutput: false,
    });

    expect(result.success).toBe(true);
  });

  it('passes environment variables', async () => {
    const result = await runHooks('test', ['echo $TEST_VAR'], {
      cwd: testDir,
      streamOutput: false,
      env: { TEST_VAR: 'test_value' },
    });

    expect(result.success).toBe(true);
  });

  it('tracks duration for each hook', async () => {
    const result = await runHooks('test', ['sleep 0.1'], {
      cwd: testDir,
      streamOutput: false,
    });

    expect(result.success).toBe(true);
    expect(result.results[0].duration).toBeGreaterThan(50); // At least 50ms
  });
});

describe('formatHookResults', () => {
  it('formats successful results', () => {
    const results: HookResult[] = [
      { command: 'npm test', success: true, exitCode: 0, duration: 1500 },
      { command: 'npm run lint', success: true, exitCode: 0, duration: 2300 },
    ];

    const output = formatHookResults(results);
    expect(output).toContain('npm test');
    expect(output).toContain('npm run lint');
    expect(output).toContain('1.5s');
    expect(output).toContain('2.3s');
  });

  it('formats failed results', () => {
    const results: HookResult[] = [
      { command: 'npm test', success: false, exitCode: 1, duration: 1000 },
    ];

    const output = formatHookResults(results);
    expect(output).toContain('npm test');
  });
});
