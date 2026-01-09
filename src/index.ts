#!/usr/bin/env node
/**
 * cry - Git worktrees made painless for vibecoders
 *
 * A CLI tool for managing git worktrees with parallel AI-agent sessions in mind.
 *
 * Shorthand syntax:
 *   cry <name>           → cry spawn <name> --new
 *   cry <name> claude    → cry spawn <name> --new --agent claude
 */

import { Command } from 'commander';
import { init } from './commands/init.js';
import { spawn } from './commands/spawn.js';
import { list } from './commands/list.js';
import { open } from './commands/open.js';
import { rm } from './commands/rm.js';
import { prune } from './commands/prune.js';
import { doctor } from './commands/doctor.js';
import { shell } from './commands/shell.js';
import { finish } from './commands/finish.js';
import { explainCopy } from './commands/explain-copy.js';
import type { SecretMode } from './lib/types.js';

// Known subcommands - shorthand parsing must not interfere with these
const SUBCOMMANDS = new Set([
  'init',
  'spawn',
  'list', 'ls',
  'open',
  'rm', 'remove',
  'prune',
  'doctor',
  'explain-copy',
  'shell',
  'finish',
  'help',
]);

// Known agent values for shorthand parsing
const KNOWN_AGENTS = new Set(['claude', 'cursor', 'none']);

/**
 * Check if an argument looks like an option (starts with -)
 */
function isOption(arg: string): boolean {
  return arg.startsWith('-');
}

/**
 * Transform shorthand syntax into explicit spawn command
 *
 * cry feat-auth        → cry spawn feat-auth --new
 * cry feat-auth claude → cry spawn feat-auth --new --agent claude
 */
function transformShorthand(args: string[]): string[] {
  // args[0] is 'node', args[1] is script path
  // Real arguments start at index 2
  const realArgs = args.slice(2);

  // No arguments or first arg is an option → pass through
  if (realArgs.length === 0 || isOption(realArgs[0])) {
    return args;
  }

  const firstArg = realArgs[0];

  // First arg is a known subcommand → pass through
  if (SUBCOMMANDS.has(firstArg)) {
    return args;
  }

  // First arg looks like a branch name → shorthand mode
  const branchName = firstArg;
  const remainingArgs = realArgs.slice(1);

  // Build new args array
  const newArgs = [args[0], args[1], 'spawn', branchName, '--new'];

  // Check if second arg is a known agent
  if (remainingArgs.length > 0 && KNOWN_AGENTS.has(remainingArgs[0])) {
    const agent = remainingArgs[0];
    newArgs.push('--agent', agent);
    // Pass through any remaining args (options)
    newArgs.push(...remainingArgs.slice(1));
  } else {
    // Pass through all remaining args
    newArgs.push(...remainingArgs);
  }

  return newArgs;
}

// Transform arguments before Commander parses them
const transformedArgs = transformShorthand(process.argv);

const program = new Command();

program
  .name('cry')
  .description(`Git worktrees made painless for vibecoders running parallel AI-agent sessions

Shorthand syntax:
  cry <name>           Create worktree for new branch <name>
  cry <name> claude    Create worktree and launch Claude agent

Examples:
  cry feat-auth              # spawn new branch 'feat-auth'
  cry feat-auth claude       # spawn and launch Claude
  cry spawn feat-auth        # explicit spawn command
  cry list                   # list all worktrees`)
  .version('1.0.3');

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
  .option('--base-branch <branch>', 'Base branch for PRs (default: current branch)')
  .option('-m, --mode <mode>', 'Secret handling mode: copy, symlink, or none', 'copy')
  .option('-r, --run <cmd>', 'Command to run after creating worktree')
  .option('-a, --agent <agent>', 'Launch agent after setup: claude or none', 'none')
  .option('--finish-on-exit', 'After agent exits, show finish menu (commit, PR, cleanup)')
  .option('--dry-run', 'Show what would happen without creating the worktree')
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
      baseBranch: options.baseBranch,
      mode,
      run: options.run,
      agent: options.agent,
      finishOnExit: options.finishOnExit,
      dryRun: options.dryRun,
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
  .option('-p, --path-only', 'Only print the path (for scripting)')
  .action(async (branchOrPath: string, options) => {
    await open(branchOrPath, { cmd: options.cmd, pathOnly: options.pathOnly });
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

// cry explain-copy
program
  .command('explain-copy')
  .description('Explain which files will be copied/symlinked and which are blocked')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    await explainCopy({ json: options.json });
  });

// cry shell
program
  .command('shell')
  .description('Output shell integration code for crycd navigation function')
  .option('-s, --shell <shell>', 'Shell type: bash, zsh, or fish (auto-detected)')
  .action(async (options) => {
    await shell({ shell: options.shell });
  });

// cry finish
program
  .command('finish')
  .description('Complete session: show summary, optionally create PR, and cleanup')
  .option('-j, --json', 'Output as JSON (summary only, no actions)')
  .option('-m, --message <msg>', 'Commit message (stages all, commits, non-interactive)')
  .option('--skip-commit', 'Skip commit step entirely (still safe)')
  .option('--dry-run', 'Show what would happen without executing')
  .option('--pr', 'Force PR creation path')
  .option('--cleanup', 'Auto-cleanup after successful PR (skip prompt)')
  .option('--skip-cleanup', 'Skip cleanup prompt entirely')
  .option('--non-interactive', 'Never prompt; errors on dirty unless --allow-dirty')
  .option('--allow-dirty', 'Allow proceeding with dirty working tree in non-interactive mode')
  .option('--delete-branch', 'Delete branch during cleanup (with --cleanup)')
  .action(async (options) => {
    await finish({
      json: options.json,
      message: options.message,
      skipCommit: options.skipCommit,
      dryRun: options.dryRun,
      pr: options.pr,
      cleanup: options.cleanup,
      noCleanup: options.skipCleanup,
      nonInteractive: options.nonInteractive,
      allowDirty: options.allowDirty,
      deleteBranch: options.deleteBranch,
    });
  });

// Parse with transformed arguments
program.parse(transformedArgs);
