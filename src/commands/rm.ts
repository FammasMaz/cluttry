/**
 * cry rm command
 *
 * Remove a worktree safely with optional branch deletion.
 */

import { createInterface } from 'node:readline';
import {
  isGitRepo,
  getRepoRoot,
  listWorktrees,
  removeWorktree,
  deleteBranch,
  isWorktreeDirty,
  getCurrentBranch,
} from '../lib/git.js';
import { resolveBranchOrPath } from '../lib/paths.js';
import * as out from '../lib/output.js';

interface RmOptions {
  withBranch?: boolean;
  force?: boolean;
  yes?: boolean;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function rm(branchOrPath: string, options: RmOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const worktrees = listWorktrees(repoRoot);

  // Build lookup list
  const wtList = worktrees.map((wt) => ({
    branch: wt.branch ?? null,
    path: wt.worktree,
  }));

  // Resolve the worktree
  const resolved = resolveBranchOrPath(branchOrPath, wtList, repoRoot);

  if (!resolved) {
    out.error(`Worktree not found: ${branchOrPath}`);
    out.info('Available worktrees:');
    for (const wt of wtList) {
      out.log(`  • ${wt.branch ?? '(detached)'} → ${wt.path}`);
    }
    process.exit(1);
  }

  const { path: wtPath, branch } = resolved;

  // Check if it's the main worktree (the original checkout)
  if (wtPath === repoRoot) {
    out.error('Cannot remove the main worktree.');
    out.info('This is your primary repository checkout.');
    process.exit(1);
  }

  // Check if dirty
  const dirty = isWorktreeDirty(wtPath);
  if (dirty && !options.force) {
    out.error('Worktree has uncommitted changes.');
    out.info('Use --force to remove anyway (changes will be lost).');
    process.exit(1);
  }

  // Warn and confirm if dirty and force
  if (dirty && options.force && !options.yes) {
    out.warn('Worktree has uncommitted changes that will be lost!');
    const confirmed = await confirm('Are you sure you want to remove it?');
    if (!confirmed) {
      out.log('Aborted.');
      process.exit(0);
    }
  }

  // Remove the worktree
  out.log(`Removing worktree: ${out.fmt.path(wtPath)}`);
  try {
    removeWorktree(wtPath, options.force ?? false, repoRoot);
    out.success('Worktree removed');
  } catch (error) {
    out.error(`Failed to remove worktree: ${(error as Error).message}`);
    process.exit(1);
  }

  // Optionally delete the branch
  if (options.withBranch && branch) {
    const currentBranch = getCurrentBranch(repoRoot);

    if (branch === currentBranch) {
      out.warn(`Cannot delete branch '${branch}' - it's currently checked out in main worktree.`);
    } else {
      out.log(`Deleting branch: ${out.fmt.branch(branch)}`);
      try {
        deleteBranch(branch, options.force ?? false, repoRoot);
        out.success('Branch deleted');
      } catch (error) {
        out.warn(`Failed to delete branch: ${(error as Error).message}`);
        out.info('You may need to use --force or delete it manually.');
      }
    }
  }

  out.newline();
  out.success('Done');
}
