/**
 * cry spawn command
 *
 * Create a worktree for a branch with optional secrets handling and hooks.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  isGitRepo,
  getRepoRoot,
  getRepoName,
  branchExists,
  addWorktree,
  listWorktrees,
  runCommand,
  commandExists,
} from '../lib/git.js';
import { getMergedConfig, configExists } from '../lib/config.js';
import { getDefaultWorktreePath } from '../lib/paths.js';
import { processSecrets } from '../lib/secrets.js';
import * as out from '../lib/output.js';
import type { SecretMode } from '../lib/types.js';

interface SpawnOptions {
  new?: boolean;
  path?: string;
  base?: string;
  mode?: SecretMode;
  run?: string;
  agent?: string;
}

export async function spawn(branch: string, options: SpawnOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
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
    out.error(`Destination already exists: ${worktreePath}`);
    out.info('Remove it first or choose a different path with --path');
    process.exit(1);
  }

  // Check if worktree already exists for this branch
  const existingWorktrees = listWorktrees(repoRoot);
  const existingForBranch = existingWorktrees.find((w) => w.branch === branch);
  if (existingForBranch) {
    out.error(`A worktree already exists for branch '${branch}'`);
    out.info(`Path: ${existingForBranch.worktree}`);
    out.info('Remove it first with: cry rm ' + branch);
    process.exit(1);
  }

  // Determine if we need to create the branch
  const needsNewBranch = options.new || !branchExists(branch, repoRoot);

  out.header('Creating worktree');
  out.log(`  Branch: ${out.fmt.branch(branch)}${needsNewBranch ? out.fmt.gray(' (new)') : ''}`);
  out.log(`  Path:   ${out.fmt.path(worktreePath)}`);
  out.log(`  Mode:   ${out.fmt.cyan(mode)}`);
  out.newline();

  // Create the worktree
  try {
    addWorktree(worktreePath, branch, needsNewBranch, repoRoot);
    out.success('Worktree created');
  } catch (error) {
    out.error(`Failed to create worktree: ${(error as Error).message}`);
    process.exit(1);
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
  const agentChoice = options.agent ?? 'none';
  if (agentChoice === 'claude') {
    const agentCmd = config.agentCommand;
    out.newline();

    if (commandExists(agentCmd)) {
      out.log(`Launching ${agentCmd}...`);
      await runCommand(agentCmd, worktreePath);
    } else {
      out.warn(`Agent command '${agentCmd}' not found.`);
      out.info('Install Claude Code: https://docs.anthropic.com/claude-code');
    }
  }

  // Final summary
  out.newline();
  out.header('Worktree ready');
  out.log(`  ${out.fmt.dim('cd')} ${worktreePath}`);
}
