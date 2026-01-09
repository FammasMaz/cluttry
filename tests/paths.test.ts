/**
 * Unit tests for path utilities
 */

import { describe, it, expect } from 'vitest';
import { sanitizeBranchName, getDefaultWorktreePath, resolveBranchOrPath } from '../src/lib/paths.js';

describe('sanitizeBranchName', () => {
  it('replaces forward slashes with dashes', () => {
    // Slashes become dashes (collapsed from double-dashes)
    expect(sanitizeBranchName('feature/add-login')).toBe('feature-add-login');
    expect(sanitizeBranchName('fix/bug/123')).toBe('fix-bug-123');
  });

  it('replaces Windows-forbidden characters', () => {
    expect(sanitizeBranchName('test<>:"|?*\\')).toBe('test');
    expect(sanitizeBranchName('branch:name')).toBe('branch-name');
  });

  it('replaces whitespace with dashes', () => {
    expect(sanitizeBranchName('my branch name')).toBe('my-branch-name');
    expect(sanitizeBranchName('tabs\there')).toBe('tabs-here');
  });

  it('removes leading and trailing dots', () => {
    expect(sanitizeBranchName('.hidden')).toBe('hidden');
    expect(sanitizeBranchName('trailing.')).toBe('trailing');
    expect(sanitizeBranchName('...dots...')).toBe('dots');
  });

  it('collapses multiple dashes', () => {
    expect(sanitizeBranchName('a--b---c')).toBe('a-b-c');
  });

  it('removes leading and trailing dashes', () => {
    expect(sanitizeBranchName('-start')).toBe('start');
    expect(sanitizeBranchName('end-')).toBe('end');
    expect(sanitizeBranchName('---middle---')).toBe('middle');
  });

  it('handles complex branch names', () => {
    expect(sanitizeBranchName('feature/user-auth/oauth2.0')).toBe('feature-user-auth-oauth2.0');
    // Note: # is allowed in branch names and preserved
    expect(sanitizeBranchName('fix/issue#123')).toBe('fix-issue#123');
  });

  it('handles simple branch names unchanged', () => {
    expect(sanitizeBranchName('main')).toBe('main');
    expect(sanitizeBranchName('develop')).toBe('develop');
    expect(sanitizeBranchName('my-feature')).toBe('my-feature');
  });
});

describe('getDefaultWorktreePath', () => {
  const repoRoot = '/home/user/myrepo';

  it('returns explicit path when provided', () => {
    const result = getDefaultWorktreePath(repoRoot, 'feature', {
      explicitPath: '/custom/path',
    });
    expect(result).toBe('/custom/path');
  });

  it('resolves relative explicit path against CWD', () => {
    const result = getDefaultWorktreePath(repoRoot, 'feature', {
      explicitPath: './relative/path',
    });
    expect(result).toContain('relative/path');
  });

  it('uses base directory with repo name and sanitized branch', () => {
    const result = getDefaultWorktreePath(repoRoot, 'feature/test', {
      baseDir: '/worktrees',
      repoName: 'myrepo',
    });
    expect(result).toBe('/worktrees/myrepo/feature-test');
  });

  it('derives repo name from repoRoot if not provided', () => {
    const result = getDefaultWorktreePath(repoRoot, 'main', {
      baseDir: '/worktrees',
    });
    expect(result).toBe('/worktrees/myrepo/main');
  });

  it('resolves relative base directory against repo root', () => {
    const result = getDefaultWorktreePath(repoRoot, 'feature', {
      baseDir: '../sibling',
      repoName: 'myrepo',
    });
    expect(result).toContain('myrepo/feature');
  });

  it('defaults to .worktrees/<branch> inside repo', () => {
    const result = getDefaultWorktreePath(repoRoot, 'my-branch');
    expect(result).toBe('/home/user/myrepo/.worktrees/my-branch');
  });

  it('sanitizes branch names in default path', () => {
    const result = getDefaultWorktreePath(repoRoot, 'feature/login');
    expect(result).toBe('/home/user/myrepo/.worktrees/feature-login');
  });
});

describe('resolveBranchOrPath', () => {
  const repoRoot = '/home/user/myrepo';
  const worktrees = [
    { branch: 'main', path: '/home/user/myrepo' },
    { branch: 'feature-login', path: '/home/user/myrepo/.worktrees/feature-login' },
    { branch: null, path: '/home/user/myrepo/.worktrees/detached' },
  ];

  it('finds worktree by exact branch name', () => {
    const result = resolveBranchOrPath('feature-login', worktrees, repoRoot);
    expect(result).toEqual({
      branch: 'feature-login',
      path: '/home/user/myrepo/.worktrees/feature-login',
    });
  });

  it('finds worktree by absolute path', () => {
    const result = resolveBranchOrPath('/home/user/myrepo/.worktrees/feature-login', worktrees, repoRoot);
    expect(result).toEqual({
      branch: 'feature-login',
      path: '/home/user/myrepo/.worktrees/feature-login',
    });
  });

  it('finds worktree by partial path suffix', () => {
    const result = resolveBranchOrPath('feature-login', worktrees, repoRoot);
    expect(result).not.toBeNull();
    expect(result?.branch).toBe('feature-login');
  });

  it('returns null when no match found', () => {
    const result = resolveBranchOrPath('nonexistent', worktrees, repoRoot);
    expect(result).toBeNull();
  });

  it('handles detached worktrees', () => {
    const result = resolveBranchOrPath('/home/user/myrepo/.worktrees/detached', worktrees, repoRoot);
    expect(result).toEqual({
      branch: null,
      path: '/home/user/myrepo/.worktrees/detached',
    });
  });

  it('handles main worktree', () => {
    const result = resolveBranchOrPath('main', worktrees, repoRoot);
    expect(result).toEqual({
      branch: 'main',
      path: '/home/user/myrepo',
    });
  });
});
