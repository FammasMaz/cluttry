/**
 * Path utilities for VWT
 */

import path from 'node:path';

/**
 * Sanitize a branch name for use in filesystem paths
 * - Replace slashes with double dashes
 * - Remove or replace other problematic characters
 */
export function sanitizeBranchName(branch: string): string {
  return branch
    .replace(/\//g, '--')  // Replace slashes with double dashes
    .replace(/[<>:"|?*\\]/g, '-')  // Replace Windows-forbidden chars
    .replace(/\s+/g, '-')  // Replace whitespace
    .replace(/^\.+/, '')  // Remove leading dots
    .replace(/\.+$/, '')  // Remove trailing dots
    .replace(/-+/g, '-')  // Collapse multiple dashes
    .replace(/^-+/, '')  // Remove leading dashes
    .replace(/-+$/, '');  // Remove trailing dashes
}

/**
 * Calculate the default worktree path
 */
export function getDefaultWorktreePath(
  repoRoot: string,
  branch: string,
  options?: {
    explicitPath?: string;
    baseDir?: string;
    repoName?: string;
  }
): string {
  // Explicit path wins
  if (options?.explicitPath) {
    // If it's relative, resolve against CWD
    if (!path.isAbsolute(options.explicitPath)) {
      return path.resolve(options.explicitPath);
    }
    return options.explicitPath;
  }

  const sanitizedBranch = sanitizeBranchName(branch);

  // Base directory specified
  if (options?.baseDir) {
    const repoName = options.repoName ?? path.basename(repoRoot);
    const baseDir = path.isAbsolute(options.baseDir)
      ? options.baseDir
      : path.resolve(repoRoot, options.baseDir);
    return path.join(baseDir, repoName, sanitizedBranch);
  }

  // Default: .worktrees/<branch> inside repo
  return path.join(repoRoot, '.worktrees', sanitizedBranch);
}

/**
 * Check if a path is inside the .worktrees directory
 */
export function isInsideWorktreesDir(targetPath: string, repoRoot: string): boolean {
  const worktreesDir = path.join(repoRoot, '.worktrees');
  const normalizedTarget = path.normalize(targetPath);
  const normalizedWorktrees = path.normalize(worktreesDir);
  return normalizedTarget.startsWith(normalizedWorktrees);
}

/**
 * Get relative path from repo root
 */
export function getRelativePath(absolutePath: string, repoRoot: string): string {
  return path.relative(repoRoot, absolutePath);
}

/**
 * Resolve a branch-or-path argument to a worktree path
 */
export function resolveBranchOrPath(
  branchOrPath: string,
  worktrees: Array<{ branch: string | null; path: string }>,
  repoRoot: string
): { path: string; branch: string | null } | null {
  // First, try to match by branch name
  const byBranch = worktrees.find((w) => w.branch === branchOrPath);
  if (byBranch) {
    return { path: byBranch.path, branch: byBranch.branch };
  }

  // Try to match by path (absolute or relative)
  const absolutePath = path.isAbsolute(branchOrPath)
    ? branchOrPath
    : path.resolve(repoRoot, branchOrPath);

  const byPath = worktrees.find((w) => path.normalize(w.path) === path.normalize(absolutePath));
  if (byPath) {
    return { path: byPath.path, branch: byPath.branch };
  }

  // Try partial path match (end of path)
  const byPartialPath = worktrees.find((w) => w.path.endsWith(branchOrPath));
  if (byPartialPath) {
    return { path: byPartialPath.path, branch: byPartialPath.branch };
  }

  return null;
}
