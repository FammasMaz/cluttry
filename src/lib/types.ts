/**
 * Cry Configuration Types
 */

/**
 * Agent preset configuration
 */
export interface AgentPreset {
  /** Command to run the agent */
  command: string;
  /** Arguments to pass to the agent command */
  args?: string[];
  /** Files to exclude from copy/inject for this agent */
  deny?: string[];
  /** Default for --finish-on-exit when using this agent */
  finishOnExitDefault?: boolean;
  /** Extra environment variables to set for this agent */
  env?: Record<string, string>;
}

export interface CryConfig {
  /** Base directory for worktrees (optional, defaults to .worktrees/) */
  worktreeBaseDir?: string;
  /** Default mode for secrets handling */
  defaultMode: 'copy' | 'symlink' | 'none' | 'inject';
  /** List of globs/paths to manage (e.g. [".env", ".env.*", "config/oauth*.json"]) */
  include: string[];
  /** How to handle non-dotenv files in inject mode */
  injectNonEnv?: 'skip' | 'symlink';
  /** Hook commands */
  hooks?: {
    /** Commands to run after worktree creation */
    postCreate?: string[];
    /** Commands to run before finish actions (tests, lint, etc.) */
    preFinish?: string[];
    /** Commands to run after PR creation */
    postFinish?: string[];
    /** Commands to run before merge attempts */
    preMerge?: string[];
  };
  /** Default agent command (e.g. 'claude') */
  agentCommand?: string;
  /** Default editor command (e.g. 'code' for VS Code) */
  editorCommand?: string;
  /** Agent presets (can be referenced by --agent flag) */
  agents?: Record<string, AgentPreset>;
}

export interface CryLocalConfig {
  /** Machine-specific base directory override */
  worktreeBaseDir?: string;
  /** Additional include paths for this machine */
  include?: string[];
  /** Additional hooks for this machine */
  hooks?: {
    postCreate?: string[];
    preFinish?: string[];
    postFinish?: string[];
    preMerge?: string[];
  };
  /** Override agent command */
  agentCommand?: string;
  /** Override editor command */
  editorCommand?: string;
}

export interface MergedConfig {
  worktreeBaseDir?: string;
  defaultMode: 'copy' | 'symlink' | 'none' | 'inject';
  include: string[];
  injectNonEnv: 'skip' | 'symlink';
  hooks: {
    postCreate: string[];
    preFinish: string[];
    postFinish: string[];
    preMerge: string[];
  };
  agentCommand: string;
  editorCommand: string;
  agents: Record<string, AgentPreset>;
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

export type SecretMode = 'copy' | 'symlink' | 'none' | 'inject';

export interface SpawnOptions {
  branch: string;
  isNew: boolean;
  path?: string;
  base?: string;
  mode: SecretMode;
  run?: string;
  agent?: 'claude' | 'none';
}
