/**
 * Session manifest management for cry
 *
 * Sessions track the lifecycle of a worktree from spawn to finish.
 * Manifests are stored in .cry/sessions/<id>.json in the repo root.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { listWorktrees, getRepoRoot, isGitRepo } from './git.js';

export const SESSIONS_DIR = '.cry/sessions';

export interface SessionManifest {
  /** Unique session identifier */
  id: string;
  /** Absolute path to the repository root (main worktree) */
  repoRoot: string;
  /** ISO timestamp when session was created */
  createdAt: string;
  /** Branch name for this worktree */
  branch: string;
  /** Branch we spawned from (base for PRs) */
  baseBranch: string;
  /** Absolute path to the worktree directory */
  worktreePath: string;
  /** Agent used for this session (optional) */
  agent?: string;
  /** Human-readable task name (optional) */
  taskName?: string;
}

export interface CreateSessionOptions {
  repoRoot: string;
  branch: string;
  baseBranch: string;
  worktreePath: string;
  agent?: string;
  taskName?: string;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Get the sessions directory path for a repo
 */
export function getSessionsDir(repoRoot: string): string {
  return path.join(repoRoot, SESSIONS_DIR);
}

/**
 * Get the manifest file path for a session
 */
export function getManifestPath(repoRoot: string, sessionId: string): string {
  return path.join(getSessionsDir(repoRoot), `${sessionId}.json`);
}

/**
 * Ensure the sessions directory exists
 */
export function ensureSessionsDir(repoRoot: string): void {
  const sessionsDir = getSessionsDir(repoRoot);
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
}

/**
 * Create a new session manifest
 */
export function createSessionManifest(options: CreateSessionOptions): SessionManifest {
  const id = generateSessionId();
  const manifest: SessionManifest = {
    id,
    repoRoot: options.repoRoot,
    createdAt: new Date().toISOString(),
    branch: options.branch,
    baseBranch: options.baseBranch,
    worktreePath: options.worktreePath,
    agent: options.agent,
    taskName: options.taskName,
  };

  // Ensure directory exists and write manifest
  ensureSessionsDir(options.repoRoot);
  const manifestPath = getManifestPath(options.repoRoot, id);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return manifest;
}

/**
 * Read a session manifest by ID
 */
export function readSessionManifest(repoRoot: string, sessionId: string): SessionManifest | null {
  const manifestPath = getManifestPath(repoRoot, sessionId);
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as SessionManifest;
  } catch {
    return null;
  }
}

/**
 * List all sessions for a repository
 */
export function listSessions(repoRoot: string): SessionManifest[] {
  const sessionsDir = getSessionsDir(repoRoot);
  if (!existsSync(sessionsDir)) {
    return [];
  }

  const sessions: SessionManifest[] = [];
  const files = readdirSync(sessionsDir);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const sessionId = file.replace('.json', '');
    const manifest = readSessionManifest(repoRoot, sessionId);
    if (manifest) {
      sessions.push(manifest);
    }
  }

  // Sort by creation time, newest first
  sessions.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return sessions;
}

/**
 * Find session for the current working directory
 *
 * Strategy:
 * 1. Check if CWD matches any session's worktreePath exactly
 * 2. Check if CWD is inside any session's worktreePath
 * 3. Fallback: use git worktree list to find current worktree, then match by branch
 */
export function findSessionForCwd(cwd: string): SessionManifest | null {
  // First, find the repo root for this CWD
  let repoRoot: string;
  try {
    if (!isGitRepo(cwd)) {
      return null;
    }
    repoRoot = getRepoRoot(cwd);
  } catch {
    return null;
  }

  // For worktrees, the "repo root" is the worktree itself
  // We need to find the main repo root where sessions are stored
  const mainRepoRoot = findMainRepoRoot(cwd);
  if (!mainRepoRoot) {
    return null;
  }

  const sessions = listSessions(mainRepoRoot);
  if (sessions.length === 0) {
    return null;
  }

  const normalizedCwd = path.normalize(cwd);

  // Strategy 1: Exact match on worktreePath
  for (const session of sessions) {
    if (path.normalize(session.worktreePath) === normalizedCwd) {
      return session;
    }
  }

  // Strategy 2: CWD is inside a session's worktreePath
  for (const session of sessions) {
    const normalizedWt = path.normalize(session.worktreePath);
    if (normalizedCwd.startsWith(normalizedWt + path.sep) || normalizedCwd === normalizedWt) {
      return session;
    }
  }

  // Strategy 3: Fallback to git worktree matching by branch
  try {
    const worktrees = listWorktrees(cwd);
    const currentWt = worktrees.find(wt => {
      const normalizedWtPath = path.normalize(wt.worktree);
      return normalizedCwd.startsWith(normalizedWtPath + path.sep) || normalizedCwd === normalizedWtPath;
    });

    if (currentWt && currentWt.branch) {
      // Find session by branch name
      for (const session of sessions) {
        if (session.branch === currentWt.branch) {
          return session;
        }
      }
    }
  } catch {
    // Git command failed, give up
  }

  return null;
}

/**
 * Find the main repository root (where .cry/ lives)
 *
 * For worktrees, we need to trace back to the main repo.
 */
export function findMainRepoRoot(cwd: string): string | null {
  try {
    if (!isGitRepo(cwd)) {
      return null;
    }

    // Get the git dir for this worktree
    const repoRoot = getRepoRoot(cwd);

    // Check if this is the main repo (has .cry/ directory or is the commondir)
    if (existsSync(path.join(repoRoot, '.cry'))) {
      return repoRoot;
    }

    // For worktrees, we need to find the main worktree
    // The main repo can be found by checking the worktree list
    const worktrees = listWorktrees(cwd);
    if (worktrees.length > 0) {
      // The first worktree is typically the main one
      const mainWorktree = worktrees[0];
      if (mainWorktree && existsSync(mainWorktree.worktree)) {
        return mainWorktree.worktree;
      }
    }

    // Fallback: just use the repo root we found
    return repoRoot;
  } catch {
    return null;
  }
}

/**
 * Delete a session by ID
 */
export function deleteSession(repoRoot: string, sessionId: string): boolean {
  const manifestPath = getManifestPath(repoRoot, sessionId);
  if (!existsSync(manifestPath)) {
    return false;
  }

  try {
    unlinkSync(manifestPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find session by branch name
 */
export function findSessionByBranch(repoRoot: string, branch: string): SessionManifest | null {
  const sessions = listSessions(repoRoot);
  return sessions.find(s => s.branch === branch) ?? null;
}

/**
 * Find session by worktree path
 */
export function findSessionByWorktreePath(repoRoot: string, worktreePath: string): SessionManifest | null {
  const sessions = listSessions(repoRoot);
  const normalizedPath = path.normalize(worktreePath);
  return sessions.find(s => path.normalize(s.worktreePath) === normalizedPath) ?? null;
}

/**
 * Update an existing session manifest
 */
export function updateSessionManifest(
  repoRoot: string,
  sessionId: string,
  updates: Partial<Omit<SessionManifest, 'id' | 'createdAt'>>
): SessionManifest | null {
  const manifest = readSessionManifest(repoRoot, sessionId);
  if (!manifest) {
    return null;
  }

  const updated: SessionManifest = {
    ...manifest,
    ...updates,
    id: manifest.id,
    createdAt: manifest.createdAt,
  };

  const manifestPath = getManifestPath(repoRoot, sessionId);
  writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + '\n');

  return updated;
}

/**
 * Check if a worktree path has an associated session
 */
export function hasSession(repoRoot: string, worktreePath: string): boolean {
  return findSessionByWorktreePath(repoRoot, worktreePath) !== null;
}
