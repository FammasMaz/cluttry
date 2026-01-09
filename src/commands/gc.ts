/**
 * cry gc command
 *
 * Clean up stale sessions whose worktrees no longer exist.
 */

import { existsSync } from 'node:fs';
import * as readline from 'node:readline';
import {
  isGitRepo,
  getRepoRoot,
  listWorktrees,
} from '../lib/git.js';
import {
  listSessions,
  deleteSession,
  findMainRepoRoot,
  type SessionManifest,
} from '../lib/session.js';
import { execSync } from 'node:child_process';
import * as out from '../lib/output.js';

export interface GcOptions {
  dryRun?: boolean;
  yes?: boolean;
  manifestsOnly?: boolean;
}

interface StaleSession {
  manifest: SessionManifest;
  reason: 'path_missing' | 'worktree_removed';
}

/**
 * Check if a worktree path is registered in git
 */
function isWorktreeRegistered(path: string, repoRoot: string): boolean {
  const worktrees = listWorktrees(repoRoot);
  return worktrees.some(w => w.worktree === path);
}

/**
 * Find all stale sessions (worktree path doesn't exist or not registered)
 */
export function findStaleSessions(repoRoot: string): StaleSession[] {
  const sessions = listSessions(repoRoot);
  const stale: StaleSession[] = [];

  for (const session of sessions) {
    // Check if path exists on filesystem
    if (!existsSync(session.worktreePath)) {
      stale.push({ manifest: session, reason: 'path_missing' });
      continue;
    }

    // Check if git knows about this worktree
    if (!isWorktreeRegistered(session.worktreePath, repoRoot)) {
      stale.push({ manifest: session, reason: 'worktree_removed' });
    }
  }

  return stale;
}

/**
 * Get stale git worktree references (ones git would prune)
 */
function getGitPrunePreview(repoRoot: string): string[] {
  try {
    const output = execSync('git worktree prune --dry-run', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Output format: "Removing worktrees/foo: gitdir file points to non-existent location"
    const lines = output.trim().split('\n').filter(Boolean);
    return lines;
  } catch {
    return [];
  }
}

/**
 * Run git worktree prune
 */
function runGitPrune(repoRoot: string): void {
  execSync('git worktree prune', {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Prompt for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
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

export async function gc(options: GcOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  // Find the main repo root where sessions are stored
  const cwd = process.cwd();
  const mainRepoRoot = findMainRepoRoot(cwd);
  if (!mainRepoRoot) {
    out.error('Could not find repository root.');
    process.exit(1);
  }

  // Find stale sessions
  const staleSessions = findStaleSessions(mainRepoRoot);

  // Get git prune preview (unless manifests-only)
  const gitPruneLines = options.manifestsOnly ? [] : getGitPrunePreview(mainRepoRoot);

  // Check if there's anything to clean
  if (staleSessions.length === 0 && gitPruneLines.length === 0) {
    out.success('Nothing to clean up.');
    return;
  }

  // Show what would be cleaned
  out.header('Cleanup Plan');
  out.newline();

  if (staleSessions.length > 0) {
    out.log(`${out.fmt.bold('Stale session manifests:')} (${staleSessions.length})`);
    for (const { manifest, reason } of staleSessions) {
      const reasonText = reason === 'path_missing'
        ? 'worktree path missing'
        : 'worktree not registered in git';
      out.log(`  ${out.fmt.red('×')} ${out.fmt.branch(manifest.branch)} ${out.fmt.dim(`(${reasonText})`)}`);
      out.log(`    ${out.fmt.dim(manifest.id)}`);
    }
    out.newline();
  }

  if (gitPruneLines.length > 0) {
    out.log(`${out.fmt.bold('Git worktree references to prune:')} (${gitPruneLines.length})`);
    for (const line of gitPruneLines) {
      out.log(`  ${out.fmt.yellow('⚠')} ${line}`);
    }
    out.newline();
  }

  // Dry run - just show what would be done
  if (options.dryRun) {
    out.info('Dry run mode. No changes made.');
    return;
  }

  // Confirm unless --yes
  if (!options.yes) {
    const confirmed = await confirm('Proceed with cleanup?');
    if (!confirmed) {
      out.info('Aborted.');
      return;
    }
    out.newline();
  }

  // Clean up stale sessions
  let deletedCount = 0;
  for (const { manifest } of staleSessions) {
    try {
      deleteSession(mainRepoRoot, manifest.id);
      deletedCount++;
      out.log(`${out.fmt.green('✓')} Removed session: ${out.fmt.branch(manifest.branch)}`);
    } catch (err) {
      out.error(`Failed to remove session ${manifest.id}: ${err}`);
    }
  }

  // Run git worktree prune (unless manifests-only)
  if (!options.manifestsOnly && gitPruneLines.length > 0) {
    try {
      runGitPrune(mainRepoRoot);
      out.log(`${out.fmt.green('✓')} Pruned ${gitPruneLines.length} git worktree reference(s)`);
    } catch (err) {
      out.error(`Failed to prune git worktrees: ${err}`);
    }
  }

  out.newline();
  out.success(`Cleanup complete. Removed ${deletedCount} stale session(s).`);
}
