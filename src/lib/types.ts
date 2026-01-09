/**
 * VWT Configuration Types
 */

export interface VwtConfig {
  /** Base directory for worktrees (optional, defaults to .worktrees/) */
  worktreeBaseDir?: string;
  /** Default mode for secrets handling */
  defaultMode: 'copy' | 'symlink' | 'none';
  /** List of globs/paths to manage (e.g. [".env", ".env.*", "config/oauth*.json"]) */
  include: string[];
  /** Hook commands */
  hooks?: {
    postCreate?: string[];
  };
  /** Default agent command */
  agentCommand?: string;
}

export interface VwtLocalConfig {
  /** Machine-specific base directory override */
  worktreeBaseDir?: string;
  /** Additional include paths for this machine */
  include?: string[];
  /** Additional hooks for this machine */
  hooks?: {
    postCreate?: string[];
  };
  /** Override agent command */
  agentCommand?: string;
}

export interface MergedConfig {
  worktreeBaseDir?: string;
  defaultMode: 'copy' | 'symlink' | 'none';
  include: string[];
  hooks: {
    postCreate: string[];
  };
  agentCommand: string;
}

export interface WorktreeInfo {
  worktree: string;
  head: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

export interface WorktreeListItem {
  branch: string | null;
  path: string;
  headShort: string;
  dirty: boolean;
  lastModified: Date | null;
}

export type SecretMode = 'copy' | 'symlink' | 'none';

export interface SpawnOptions {
  branch: string;
  isNew: boolean;
  path?: string;
  base?: string;
  mode: SecretMode;
  run?: string;
  agent?: 'claude' | 'none';
}
