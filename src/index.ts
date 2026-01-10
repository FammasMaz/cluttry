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
import { resume } from './commands/resume.js';
import { gc } from './commands/gc.js';
import { completions } from './commands/completions.js';
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
  'resume',
  'gc',
  'completions',
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

Quick start:
  cry init                     # Initialize in repo
  cry feat-auth                # Create worktree for new branch
  cry feat-auth claude         # Create and launch Claude agent

Workflow examples:
  cry spawn feat-auth --new    # Explicit: create new branch worktree
  cry list                     # List all worktrees
  cry open feat-auth           # Open worktree in agent/editor
  cry resume feat-auth         # Resume session by name
  cry finish                   # Commit, push, create PR, cleanup
  cry rm feat-auth             # Remove worktree

Finish flow (run from worktree):
  cry finish                   # Interactive: commit → PR → cleanup
  cry finish --dry-run         # Preview what would happen
  cry finish -m "Add auth"     # Commit with message, create PR
  cry finish --cleanup         # Auto-cleanup after PR

Safety notes:
  • Never auto-merges PRs
  • Never deletes without confirmation (unless --yes)
  • Only copies gitignored files to worktrees (secrets safety)

Shell completions:
  cry completions fish > ~/.config/fish/completions/cry.fish`)
  .version('1.5.1');

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
  .option('-m, --mode <mode>', 'Secret handling mode: copy, symlink, inject, or none', 'copy')
  .option('-r, --run <cmd>', 'Command to run after creating worktree')
  .option('-a, --agent <agent>', 'Launch agent after setup: claude or none', 'none')
  .option('--finish-on-exit', 'After agent exits, show finish menu (commit, PR, cleanup)')
  .option('--auto', 'Autopilot: after agent exits, auto-commit, create PR, cleanup')
  .option('--auto-merge', 'With --auto: also merge the PR via gh pr merge')
  .option('--auto-commit-message <msg>', 'With --auto: use this commit message')
  .option('--dry-run', 'Show what would happen without creating the worktree')
  .action(async (branch: string, options) => {
    const mode = options.mode as SecretMode;
    if (!['copy', 'symlink', 'inject', 'none'].includes(mode)) {
      console.error(`Invalid mode: ${mode}. Must be 'copy', 'symlink', 'inject', or 'none'.`);
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
      auto: options.auto,
      autoMerge: options.autoMerge,
      autoCommitMessage: options.autoCommitMessage,
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

// cry open [branch-or-path]
program
  .command('open [branch-or-path]')
  .description('Open a worktree in agent (Claude) or editor (VS Code)')
  .option('-c, --cmd <cmd>', 'Custom command to execute in the worktree directory')
  .option('-p, --path-only', 'Only print the path (for scripting)')
  .option('-a, --agent', 'Open in agent (Claude Code)')
  .option('-e, --editor', 'Open in editor (VS Code)')
  .action(async (branchOrPath: string | undefined, options) => {
    await open(branchOrPath, {
      cmd: options.cmd,
      pathOnly: options.pathOnly,
      agent: options.agent,
      editor: options.editor,
    });
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
  .option('--skip-hooks', 'Skip all hooks (preFinish, postFinish, preMerge)')
  .option('--dry-run', 'Show what would happen without executing')
  .option('--pr', 'Force PR creation path')
  .option('--merge', 'Merge locally into base branch after PR (non-interactive)')
  .option('--pr-merge', 'Merge PR via GitHub (gh pr merge) after creation')
  .option('--no-merge', 'Skip merge prompt entirely (PR only)')
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
      skipHooks: options.skipHooks,
      dryRun: options.dryRun,
      pr: options.pr,
      merge: options.merge,
      prMerge: options.prMerge,
      noMerge: options.noMerge,
      cleanup: options.cleanup,
      noCleanup: options.skipCleanup,
      nonInteractive: options.nonInteractive,
      allowDirty: options.allowDirty,
      deleteBranch: options.deleteBranch,
    });
  });

// cry resume <nameOrId>
program
  .command('resume <nameOrId>')
  .description('Resume an existing session by branch name or session ID')
  .option('-a, --agent <agent>', 'Launch agent in the session (e.g., claude)')
  .option('--cd', 'Print cd command for shell copy/paste')
  .action(async (nameOrId: string, options) => {
    await resume(nameOrId, {
      agent: options.agent,
      cd: options.cd,
    });
  });

// cry gc
program
  .command('gc')
  .description('Clean up stale session manifests and git worktree references')
  .option('--dry-run', 'Show what would be cleaned without making changes')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--manifests-only', 'Only remove stale manifests, skip git worktree prune')
  .action(async (options) => {
    await gc({
      dryRun: options.dryRun,
      yes: options.yes,
      manifestsOnly: options.manifestsOnly,
    });
  });

// cry completions [shell]
program
  .command('completions [shell]')
  .description('Generate shell completions (bash, zsh, fish)')
  .option('-s, --shell <shell>', 'Shell type (bash, zsh, fish)')
  .action(async (shell: string | undefined, options) => {
    await completions(shell, {
      shell: options.shell,
    });
  });

// Parse with transformed arguments
program.parse(transformedArgs);
