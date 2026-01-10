/**
 * Git operations for cry
 */

import { execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { WorktreeInfo } from './types.js';

/**
 * Execute a git command and return stdout
 * Uses spawnSync to properly handle arguments with spaces
 */
export function git(args: string[], cwd?: string): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString?.() || result.error?.message || 'Unknown git error';
    throw new Error(stderr.trim());
  }

  return (result.stdout || '').trim();
}

/**
 * Check if we're in a git repository
 */
export function isGitRepo(cwd?: string): boolean {
  try {
    git(['rev-parse', '--git-dir'], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root directory of the git repository
 */
export function getRepoRoot(cwd?: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * Get the repository name from the root path
 */
export function getRepoName(cwd?: string): string {
  const root = getRepoRoot(cwd);
  return path.basename(root);
}

/**
 * Check if a branch exists
 */
export function branchExists(branch: string, cwd?: string): boolean {
  try {
    git(['rev-parse', '--verify', `refs/heads/${branch}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 */
export function getCurrentBranch(cwd?: string): string | null {
  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    // Returns 'HEAD' when in detached state
    if (branch === 'HEAD') {
      return null;
    }
    return branch;
  } catch {
    return null;
  }
}

/**
 * Check if HEAD is detached (not on any branch)
 */
export function isDetachedHead(cwd?: string): boolean {
  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    return branch === 'HEAD';
  } catch {
    return false;
  }
}

/**
 * Get the default branch name (from origin/HEAD or common defaults)
 */
export function getDefaultBranch(cwd?: string): string | null {
  // Try origin/HEAD first
  try {
    const ref = git(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
    // Returns something like "refs/remotes/origin/main"
    const match = ref.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) {
      return match[1];
    }
  } catch {
    // origin/HEAD not set, try other methods
  }

  // Try to find main or master
  for (const candidate of ['main', 'master']) {
    if (branchExists(candidate, cwd)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Get the merge-base between two refs
 */
export function getMergeBase(ref1: string, ref2: string, cwd?: string): string | null {
  try {
    return git(['merge-base', ref1, ref2], cwd);
  } catch {
    return null;
  }
}

/**
 * Get the upstream tracking branch for the current branch
 */
export function getUpstreamBranch(cwd?: string): string | null {
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', '@{upstream}'], cwd);
    return upstream;
  } catch {
    return null;
  }
}

/**
 * Check if a file is tracked by git
 */
export function isTracked(filePath: string, cwd?: string): boolean {
  try {
    git(['ls-files', '--error-unmatch', filePath], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file is ignored by git
 */
export function isIgnored(filePath: string, cwd?: string): boolean {
  try {
    git(['check-ignore', '-q', filePath], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all worktrees using porcelain format
 */
export function listWorktrees(cwd?: string): WorktreeInfo[] {
  const output = git(['worktree', 'list', '--porcelain'], cwd);
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of output.split('\n')) {
    if (line === '') {
      if (current.worktree) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {};
      continue;
    }

    if (line.startsWith('worktree ')) {
      current.worktree = line.substring(9);
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7).replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }

  // Don't forget the last entry
  if (current.worktree) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

/**
 * Add a worktree
 */
export function addWorktree(
  targetPath: string,
  branch: string,
  createBranch: boolean,
  cwd?: string
): void {
  const args = ['worktree', 'add'];
  if (createBranch) {
    args.push('-b', branch);
  }
  args.push(targetPath);
  if (!createBranch) {
    args.push(branch);
  }
  git(args, cwd);
}

/**
 * Remove a worktree
 */
export function removeWorktree(worktreePath: string, force: boolean, cwd?: string): void {
  const args = ['worktree', 'remove'];
  if (force) {
    args.push('--force');
  }
  args.push(worktreePath);
  git(args, cwd);
}

/**
 * Prune worktrees
 */
export function pruneWorktrees(cwd?: string): string {
  return git(['worktree', 'prune', '--verbose'], cwd);
}

/**
 * Delete a branch
 */
export function deleteBranch(branch: string, force: boolean, cwd?: string): void {
  const flag = force ? '-D' : '-d';
  git(['branch', flag, branch], cwd);
}

/**
 * Check if a worktree is dirty (has uncommitted changes)
 */
export function isWorktreeDirty(worktreePath: string): boolean {
  try {
    const status = git(['status', '--porcelain'], worktreePath);
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get short HEAD SHA for a worktree
 */
export function getShortHead(worktreePath: string): string {
  try {
    return git(['rev-parse', '--short', 'HEAD'], worktreePath);
  } catch {
    return 'unknown';
  }
}

/**
 * Run a command in a directory
 */
export function runCommand(
  command: string,
  cwd: string,
  env?: Record<string, string | undefined>
): Promise<number> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const child = spawn(shell, shellArgs, {
      cwd,
      stdio: 'inherit',
      env: env ? { ...process.env, ...env } : process.env,
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', () => {
      resolve(1);
    });
  });
}

/**
 * Check if a command exists
 */
export function commandExists(cmd: string): boolean {
  try {
    // Extract just the command name (first word) from a potentially complex command
    const cmdName = cmd.split(/\s+/)[0];
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${cmdName}` : `which ${cmdName}`;
    execSync(checkCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
