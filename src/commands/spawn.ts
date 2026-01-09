/**
 * cry spawn command
 *
 * Create a worktree for a branch with optional secrets handling and hooks.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn as spawnProcess, ChildProcess } from 'node:child_process';
import {
  isGitRepo,
  getRepoRoot,
  getRepoName,
  branchExists,
  addWorktree,
  listWorktrees,
  runCommand,
  commandExists,
  getCurrentBranch,
  isDetachedHead,
  getDefaultBranch,
} from '../lib/git.js';
import { getMergedConfig, configExists } from '../lib/config.js';
import { getDefaultWorktreePath } from '../lib/paths.js';
import { processSecrets, generateCopyPlan, formatCopyPlan } from '../lib/secrets.js';
import { createSessionManifest } from '../lib/session.js';
import * as out from '../lib/output.js';
import { fail, errors } from '../lib/errors.js';
import type { SecretMode } from '../lib/types.js';
import { finish } from './finish.js';

interface SpawnOptions {
  new?: boolean;
  path?: string;
  base?: string;           // Base directory for worktrees
  baseBranch?: string;     // Base branch for the new worktree (for PR target)
  mode?: SecretMode;
  run?: string;
  agent?: string;
  finishOnExit?: boolean;
  dryRun?: boolean;
}

/**
 * Run an agent command and wait for it to exit
 * Returns the exit code and whether it was interrupted
 */
async function runAgentWithExitHandling(
  command: string,
  cwd: string
): Promise<{ exitCode: number; interrupted: boolean }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    let interrupted = false;

    const child = spawnProcess(shell, shellArgs, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });

    // Handle Ctrl+C gracefully
    const sigintHandler = () => {
      interrupted = true;
      child.kill('SIGINT');
    };

    const sigtermHandler = () => {
      interrupted = true;
      child.kill('SIGTERM');
    };

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    child.on('close', (code) => {
      // Clean up signal handlers
      process.removeListener('SIGINT', sigintHandler);
      process.removeListener('SIGTERM', sigtermHandler);
      resolve({ exitCode: code ?? 1, interrupted });
    });

    child.on('error', () => {
      process.removeListener('SIGINT', sigintHandler);
      process.removeListener('SIGTERM', sigtermHandler);
      resolve({ exitCode: 1, interrupted });
    });
  });
}

/**
 * Show post-agent menu and handle user choice
 */
async function showPostAgentMenu(
  worktreePath: string,
  agentExitCode: number,
  interrupted: boolean
): Promise<void> {
  const readline = await import('node:readline');

  // Change to worktree directory for finish command
  process.chdir(worktreePath);

  out.newline();
  out.header('Agent Session Ended');

  if (interrupted) {
    out.log(out.fmt.yellow('  Agent was interrupted (Ctrl+C)'));
  } else if (agentExitCode !== 0) {
    out.log(out.fmt.yellow(`  Agent exited with error (code ${agentExitCode})`));
  } else {
    out.log(out.fmt.green('  Agent exited successfully'));
  }

  out.newline();
  out.log('What would you like to do?');
  out.log(`  ${out.fmt.bold('f')}) Finish session (commit, PR, cleanup)`);
  out.log(`  ${out.fmt.bold('c')}) Cleanup only (remove worktree)`);
  out.log(`  ${out.fmt.bold('n')}) Do nothing (exit)`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Choice [f/c/n]: ', (ans) => {
      rl.close();
      resolve(ans.toLowerCase().trim());
    });
  });

  if (answer === 'f' || answer === 'finish') {
    // Run finish in interactive mode
    await finish({});
  } else if (answer === 'c' || answer === 'cleanup') {
    // Run finish with cleanup only, skip PR
    await finish({
      skipCommit: true,
      cleanup: true,
    });
  } else {
    out.log(out.fmt.dim('Exiting without cleanup.'));
    out.log(`  ${out.fmt.dim('Run')} cry finish ${out.fmt.dim('later to complete the session.')}`);
  }
}

export async function spawn(branch: string, options: SpawnOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    fail(errors.notGitRepo());
  }

  const repoRoot = getRepoRoot();
  const repoName = getRepoName();

  // Load config
  const config = configExists(repoRoot) ? getMergedConfig(repoRoot) : {
    worktreeBaseDir: undefined,
    defaultMode: 'none' as SecretMode,
    include: [],
    hooks: { postCreate: [] },
    agentCommand: 'claude',
  };

  // Determine mode
  const mode: SecretMode = options.mode ?? config.defaultMode;

  // Calculate worktree path
  const worktreePath = getDefaultWorktreePath(repoRoot, branch, {
    explicitPath: options.path,
    baseDir: options.base ?? config.worktreeBaseDir,
    repoName,
  });

  // Check if destination already exists
  if (existsSync(worktreePath)) {
    fail(errors.destinationExists(worktreePath));
  }

  // Check if worktree already exists for this branch
  const existingWorktrees = listWorktrees(repoRoot);
  const existingForBranch = existingWorktrees.find((w) => w.branch === branch);
  if (existingForBranch) {
    fail(errors.worktreeAlreadyExists(branch, existingForBranch.worktree));
  }

  // Determine if we need to create the branch
  const needsNewBranch = options.new || !branchExists(branch, repoRoot);

  // Determine base branch with proper fallback chain:
  // 1. User-provided --base-branch option
  // 2. Current branch (if not detached)
  // 3. Default branch (origin/HEAD or main/master)
  // 4. Error if detached HEAD and no fallback
  let baseBranch: string;
  if (options.baseBranch) {
    baseBranch = options.baseBranch;
  } else if (isDetachedHead(repoRoot)) {
    // Try to get default branch as fallback
    const defaultBranch = getDefaultBranch(repoRoot);
    if (defaultBranch) {
      baseBranch = defaultBranch;
      out.warn(`Detached HEAD detected. Using default branch '${defaultBranch}' as base.`);
    } else {
      fail(errors.detachedHead());
    }
  } else {
    const currentBranch = getCurrentBranch(repoRoot);
    if (currentBranch) {
      baseBranch = currentBranch;
    } else {
      // Fallback to default branch
      const defaultBranch = getDefaultBranch(repoRoot);
      baseBranch = defaultBranch ?? 'main';
    }
  }

  out.header('Creating worktree');
  out.log(`  Branch: ${out.fmt.branch(branch)}${needsNewBranch ? out.fmt.gray(' (new)') : ''}`);
  out.log(`  Base:   ${out.fmt.branch(baseBranch)}`);
  out.log(`  Path:   ${out.fmt.path(worktreePath)}`);
  out.log(`  Mode:   ${out.fmt.cyan(mode)}`);
  out.newline();

  // Handle dry-run mode
  if (options.dryRun) {
    out.header('Dry Run - Copy Plan');

    if (mode === 'none') {
      out.log(out.fmt.dim('  Secret mode is "none" — no files will be copied/symlinked'));
    } else if (config.include.length === 0) {
      out.log(out.fmt.dim('  No include patterns configured'));
    } else {
      const plan = await generateCopyPlan(config.include, repoRoot);
      out.log(formatCopyPlan(plan, mode));
    }

    out.newline();
    out.log(out.fmt.dim('Dry run complete. No changes were made.'));
    return;
  }

  // Create the worktree
  try {
    addWorktree(worktreePath, branch, needsNewBranch, repoRoot);
    out.success('Worktree created');
  } catch (error) {
    out.error(`Failed to create worktree: ${(error as Error).message}`);
    process.exit(1);
  }

  // Create session manifest
  const agentChoice = options.agent ?? 'none';
  try {
    const session = createSessionManifest({
      repoRoot,
      branch,
      baseBranch,
      worktreePath,
      agent: agentChoice !== 'none' ? agentChoice : undefined,
    });
    out.success(`Session created: ${out.fmt.dim(session.id)}`);
  } catch (error) {
    // Non-fatal: session manifest is helpful but not required
    out.warn(`Could not create session manifest: ${(error as Error).message}`);
  }

  // Handle secrets
  if (mode !== 'none' && config.include.length > 0) {
    out.newline();
    out.log(`Processing secrets (${mode} mode)...`);

    const { processed, skipped } = await processSecrets(
      mode,
      config.include,
      repoRoot,
      worktreePath
    );

    if (processed.length > 0) {
      out.success(`${mode === 'copy' ? 'Copied' : 'Symlinked'} ${processed.length} file(s):`);
      for (const file of processed) {
        out.log(`    ${out.fmt.dim('•')} ${file}`);
      }
    }

    if (skipped.length > 0) {
      out.warn(`Skipped ${skipped.length} file(s) for safety:`);
      for (const file of skipped) {
        out.log(`    ${out.fmt.dim('•')} ${file.path}: ${file.reason}`);
      }
    }
  }

  // Run post-create hooks from config
  const hooks = config.hooks.postCreate;
  if (hooks.length > 0) {
    out.newline();
    out.log('Running post-create hooks...');
    for (const hook of hooks) {
      out.log(`  ${out.fmt.dim('$')} ${hook}`);
      const code = await runCommand(hook, worktreePath);
      if (code !== 0) {
        out.warn(`Hook exited with code ${code}`);
      }
    }
  }

  // Run --run command if provided
  if (options.run) {
    out.newline();
    out.log('Running custom command...');
    out.log(`  ${out.fmt.dim('$')} ${options.run}`);
    const code = await runCommand(options.run, worktreePath);
    if (code !== 0) {
      out.warn(`Command exited with code ${code}`);
    }
  }

  // Handle agent launch
  if (agentChoice === 'claude' || agentChoice === 'cursor') {
    // Determine the actual command to run
    // For 'claude', use config.agentCommand (defaults to 'claude')
    // For 'cursor', use 'cursor' command
    const agentCmd = agentChoice === 'cursor' ? 'cursor' : config.agentCommand;
    out.newline();

    if (commandExists(agentCmd)) {
      out.log(`Launching ${agentCmd}...`);

      if (options.finishOnExit) {
        // Use special handler that waits for exit and shows menu
        const { exitCode, interrupted } = await runAgentWithExitHandling(agentCmd, worktreePath);
        await showPostAgentMenu(worktreePath, exitCode, interrupted);
      } else {
        // Just run the command normally
        await runCommand(agentCmd, worktreePath);
      }
    } else {
      out.warn(`Agent command '${agentCmd}' not found.`);
      out.info('Install Claude Code: https://docs.anthropic.com/claude-code');
    }
  }

  // Final summary (only if not using finish-on-exit, since finish handles its own output)
  if (!options.finishOnExit || agentChoice === 'none') {
    out.newline();
    out.header('Worktree ready');
    out.log(`  ${out.fmt.dim('cd')} ${worktreePath}`);
  }
}
