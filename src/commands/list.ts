/**
 * cry list command
 *
 * List all worktrees with their status.
 */

import { statSync } from 'node:fs';
import {
  isGitRepo,
  getRepoRoot,
  listWorktrees,
  isWorktreeDirty,
  getShortHead,
} from '../lib/git.js';
import * as out from '../lib/output.js';
import type { WorktreeListItem } from '../lib/types.js';

interface ListOptions {
  json?: boolean;
}

function getLastModified(worktreePath: string): Date | null {
  try {
    const stats = statSync(worktreePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export async function list(options: ListOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const worktrees = listWorktrees(repoRoot);

  // Build list items with extra info
  const items: WorktreeListItem[] = worktrees.map((wt) => ({
    branch: wt.branch ?? (wt.detached ? '(detached)' : null),
    path: wt.worktree,
    headShort: getShortHead(wt.worktree),
    dirty: isWorktreeDirty(wt.worktree),
    lastModified: getLastModified(wt.worktree),
  }));

  // JSON output
  if (options.json) {
    const jsonItems = items.map((item) => ({
      ...item,
      lastModified: item.lastModified?.toISOString() ?? null,
    }));
    out.json(jsonItems);
    return;
  }

  // No worktrees
  if (items.length === 0) {
    out.info('No worktrees found.');
    return;
  }

  // Table output
  out.header('Worktrees');
  out.newline();

  // Calculate column widths
  const branchWidth = Math.max(
    6,
    ...items.map((i) => (i.branch ?? '').length)
  );
  const pathWidth = Math.max(4, ...items.map((i) => i.path.length));

  // Header row
  out.log(
    '  ' +
      out.fmt.bold('Branch'.padEnd(branchWidth)) +
      '  ' +
      out.fmt.bold('SHA'.padEnd(7)) +
      '  ' +
      out.fmt.bold('Status'.padEnd(8)) +
      '  ' +
      out.fmt.bold('Modified'.padEnd(12)) +
      '  ' +
      out.fmt.bold('Path')
  );
  out.log('  ' + '─'.repeat(branchWidth + 7 + 8 + 12 + pathWidth + 12));

  // Data rows
  for (const item of items) {
    const branch = (item.branch ?? '(none)').padEnd(branchWidth);
    const sha = item.headShort.padEnd(7);
    const status = item.dirty
      ? out.fmt.yellow('dirty'.padEnd(8))
      : out.fmt.green('clean'.padEnd(8));
    const modified = formatRelativeTime(item.lastModified).padEnd(12);

    out.log(
      '  ' +
        out.fmt.branch(branch) +
        '  ' +
        out.fmt.dim(sha) +
        '  ' +
        status +
        '  ' +
        out.fmt.dim(modified) +
        '  ' +
        out.fmt.path(item.path)
    );
  }

  out.newline();
  out.log(`  ${out.fmt.dim(`${items.length} worktree(s)`)}`);
}
