/**
 * Hook runner utility for cry
 *
 * Executes hook commands with proper streaming output, fail-fast behavior,
 * and structured result tracking.
 */

import { spawn } from 'node:child_process';
import * as out from './output.js';

export interface HookResult {
  command: string;
  success: boolean;
  exitCode: number;
  duration: number;
  stdout?: string;
  stderr?: string;
}

export interface HookRunnerOptions {
  /** Working directory to run commands in */
  cwd: string;
  /** Additional environment variables to inject */
  env?: Record<string, string>;
  /** Stop on first failure (default: true) */
  failFast?: boolean;
  /** Stream output in real-time (default: true) */
  streamOutput?: boolean;
}

export interface HookRunResult {
  success: boolean;
  results: HookResult[];
  /** First failed hook command, if any */
  failedHook?: string;
}

/**
 * Run a single hook command
 */
async function runSingleHook(
  command: string,
  options: HookRunnerOptions
): Promise<HookResult> {
  const startTime = Date.now();
  const { cwd, env = {}, streamOutput = true } = options;

  return new Promise((resolve) => {
    const mergedEnv = { ...process.env, ...env };

    // Use shell to support complex commands
    const child = spawn(command, {
      cwd,
      shell: true,
      env: mergedEnv,
      stdio: streamOutput ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    if (!streamOutput) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('error', (error) => {
      resolve({
        command,
        success: false,
        exitCode: 1,
        duration: Date.now() - startTime,
        stderr: error.message,
      });
    });

    child.on('close', (code) => {
      const exitCode = code ?? 0;
      resolve({
        command,
        success: exitCode === 0,
        exitCode,
        duration: Date.now() - startTime,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
      });
    });
  });
}

/**
 * Run multiple hook commands in sequence
 *
 * @param hookName - Display name for the hook stage (e.g., "preFinish")
 * @param commands - Array of shell commands to run
 * @param options - Runner options (cwd, env, failFast, streamOutput)
 */
export async function runHooks(
  hookName: string,
  commands: string[],
  options: HookRunnerOptions
): Promise<HookRunResult> {
  if (commands.length === 0) {
    return { success: true, results: [] };
  }

  const { failFast = true } = options;
  const results: HookResult[] = [];

  out.newline();
  out.header(`Running ${hookName} hooks`);
  out.newline();

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const hookNum = `[${i + 1}/${commands.length}]`;

    out.log(`${out.fmt.dim(hookNum)} ${out.fmt.bold(command)}`);

    const result = await runSingleHook(command, options);
    results.push(result);

    const durationSec = (result.duration / 1000).toFixed(1);

    if (result.success) {
      out.log(`  ${out.fmt.green('✓')} completed in ${durationSec}s`);
    } else {
      out.log(`  ${out.fmt.red('✗')} failed with exit code ${result.exitCode} (${durationSec}s)`);

      if (failFast) {
        out.newline();
        out.error(`${hookName} hook failed: ${command}`);
        return {
          success: false,
          results,
          failedHook: command,
        };
      }
    }
  }

  out.newline();

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    out.warn(`${failed.length} of ${commands.length} ${hookName} hooks failed`);
    return {
      success: false,
      results,
      failedHook: failed[0].command,
    };
  }

  out.success(`All ${hookName} hooks passed`);
  return { success: true, results };
}

/**
 * Format hook results for display (useful for summaries)
 */
export function formatHookResults(results: HookResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    const status = result.success ? out.fmt.green('✓') : out.fmt.red('✗');
    const durationSec = (result.duration / 1000).toFixed(1);
    lines.push(`  ${status} ${result.command} (${durationSec}s)`);
  }

  return lines.join('\n');
}
