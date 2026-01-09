#!/usr/bin/env node
/**
 * cry - Git worktrees made painless for vibecoders
 *
 * A CLI tool for managing git worktrees with parallel AI-agent sessions in mind.
 */

import { Command } from 'commander';
import { init } from './commands/init.js';
import { spawn } from './commands/spawn.js';
import { list } from './commands/list.js';
import { open } from './commands/open.js';
import { rm } from './commands/rm.js';
import { prune } from './commands/prune.js';
import { doctor } from './commands/doctor.js';
import type { SecretMode } from './lib/types.js';

const program = new Command();

program
  .name('cry')
  .description('Git worktrees made painless for vibecoders running parallel AI-agent sessions')
  .version('1.0.0');

// cry init
program
  .command('init')
  .description('Initialize cry configuration in the current repository')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    await init({ force: options.force });
  });

// cry spawn <branch>
program
  .command('spawn <branch>')
  .description('Create a worktree for a branch')
  .option('-n, --new', 'Create a new branch (equivalent to git worktree add -b)')
  .option('-p, --path <dir>', 'Explicit path for the worktree')
  .option('-b, --base <dir>', 'Base directory for worktrees')
  .option('-m, --mode <mode>', 'Secret handling mode: copy, symlink, or none', 'copy')
  .option('-r, --run <cmd>', 'Command to run after creating worktree')
  .option('-a, --agent <agent>', 'Launch agent after setup: claude or none', 'none')
  .action(async (branch: string, options) => {
    const mode = options.mode as SecretMode;
    if (!['copy', 'symlink', 'none'].includes(mode)) {
      console.error(`Invalid mode: ${mode}. Must be 'copy', 'symlink', or 'none'.`);
      process.exit(1);
    }
    await spawn(branch, {
      new: options.new,
      path: options.path,
      base: options.base,
      mode,
      run: options.run,
      agent: options.agent,
    });
  });

// cry list
program
  .command('list')
  .alias('ls')
  .description('List all worktrees with their status')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    await list({ json: options.json });
  });

// cry open <branch-or-path>
program
  .command('open <branch-or-path>')
  .description('Open or navigate to a worktree by branch name or path')
  .option('-c, --cmd <cmd>', 'Command to execute in the worktree directory')
  .action(async (branchOrPath: string, options) => {
    await open(branchOrPath, { cmd: options.cmd });
  });

// cry rm <branch-or-path>
program
  .command('rm <branch-or-path>')
  .alias('remove')
  .description('Remove a worktree safely')
  .option('-b, --with-branch', 'Also delete the branch')
  .option('-f, --force', 'Force removal even if dirty')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (branchOrPath: string, options) => {
    await rm(branchOrPath, {
      withBranch: options.withBranch,
      force: options.force,
      yes: options.yes,
    });
  });

// cry prune
program
  .command('prune')
  .description('Clean up stale worktree references')
  .action(async () => {
    await prune();
  });

// cry doctor
program
  .command('doctor')
  .description('Check and diagnose cry configuration and setup')
  .action(async () => {
    await doctor();
  });

// Parse and execute
program.parse();
