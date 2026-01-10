/**
 * cry list command
 *
 * List all worktrees with their status and session info.
 */

import { statSync } from 'node:fs';
import {
  isGitRepo,
  getRepoRoot,
  listWorktrees,
  isWorktreeDirty,
  getShortHead,
} from '../lib/git.js';
import { listSessions, findSessionByWorktreePath, type SessionManifest } from '../lib/session.js';
import * as out from '../lib/output.js';
import type { WorktreeListItem } from '../lib/types.js';

interface ListOptions {
  json?: boolean;
  all?: boolean; // Include cleaned sessions
}

interface EnhancedListItem extends WorktreeListItem {
  session?: SessionManifest;
}

function getLastModified(worktreePath: string): Date | null {
  try {
    const stats = statSync(worktreePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return 'unknown';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return dateObj.toLocaleDateString();
}

function formatStatus(status: string | undefined): string {
  switch (status) {
    case 'active':
      return out.fmt.green(status.padEnd(8));
    case 'finished':
      return out.fmt.blue(status.padEnd(8));
    case 'error':
      return out.fmt.red(status.padEnd(8));
    case 'cleaned':
      return out.fmt.dim(status.padEnd(8));
    default:
      return '-'.padEnd(8);
  }
}

function formatPrUrl(url: string | undefined): string {
  if (!url) return '-';
  // Extract PR number from URL
  const match = url.match(/\/pull\/(\d+)/);
  if (match) {
    return `#${match[1]}`;
  }
  return url.slice(0, 20) + '...';
}

export async function list(options: ListOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const worktrees = listWorktrees(repoRoot);
  const sessions = listSessions(repoRoot);

  // Build list items with extra info
  const items: EnhancedListItem[] = worktrees.map((wt) => {
    const session = findSessionByWorktreePath(repoRoot, wt.worktree);
    return {
      branch: wt.branch ?? (wt.detached ? '(detached)' : null),
      path: wt.worktree,
      headShort: getShortHead(wt.worktree),
      dirty: isWorktreeDirty(wt.worktree),
      lastModified: getLastModified(wt.worktree),
      session: session ?? undefined,
    };
  });

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

  // Header row with session columns
  out.log(
    '  ' +
      out.fmt.bold('Branch'.padEnd(branchWidth)) +
      '  ' +
      out.fmt.bold('Status'.padEnd(8)) +
      '  ' +
      out.fmt.bold('Agent'.padEnd(8)) +
      '  ' +
      out.fmt.bold('PR'.padEnd(8)) +
      '  ' +
      out.fmt.bold('Last Active'.padEnd(12)) +
      '  ' +
      out.fmt.bold('Path')
  );
  out.log('  ' + '─'.repeat(branchWidth + 8 + 8 + 8 + 12 + 40));

  // Data rows
  for (const item of items) {
    const branch = (item.branch ?? '(none)').padEnd(branchWidth);
    const session = item.session;
    const status = formatStatus(session?.status);
    const agent = (session?.agent ?? '-').padEnd(8);
    const pr = formatPrUrl(session?.prUrl).padEnd(8);
    const lastActive = formatRelativeTime(
      session?.lastActiveAt ?? item.lastModified
    ).padEnd(12);

    // Mark dirty worktrees
    const branchDisplay = item.dirty
      ? out.fmt.yellow(branch)
      : out.fmt.branch(branch);

    out.log(
      '  ' +
        branchDisplay +
        '  ' +
        status +
        '  ' +
        out.fmt.dim(agent) +
        '  ' +
        out.fmt.cyan(pr) +
        '  ' +
        out.fmt.dim(lastActive) +
        '  ' +
        out.fmt.path(item.path)
    );
  }

  out.newline();

  // Summary
  const activeCount = items.filter(i => i.session?.status === 'active').length;
  const finishedCount = items.filter(i => i.session?.status === 'finished').length;
  out.log(`  ${out.fmt.dim(`${items.length} worktree(s)`)}`);
  if (activeCount > 0 || finishedCount > 0) {
    out.log(`  ${out.fmt.dim(`${activeCount} active, ${finishedCount} finished`)}`);
  }
}
