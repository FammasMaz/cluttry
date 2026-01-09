/**
 * cry prune command
 *
 * Clean up stale worktree references.
 */

import { isGitRepo, getRepoRoot, pruneWorktrees } from '../lib/git.js';
import * as out from '../lib/output.js';

export async function prune(): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();

  out.log('Pruning stale worktree references...');
  out.newline();

  try {
    const output = pruneWorktrees(repoRoot);

    if (output.trim()) {
      out.log(output);
      out.newline();
      out.success('Pruned stale worktree references');
    } else {
      out.success('No stale worktree references found');
    }
  } catch (error) {
    out.error(`Failed to prune: ${(error as Error).message}`);
    process.exit(1);
  }
}
