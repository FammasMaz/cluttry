/**
 * Configuration management for cry
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { MergedConfig, CryConfig, CryLocalConfig, AgentPreset } from './types.js';

export const CONFIG_FILE = '.cry.json';
export const LOCAL_CONFIG_FILE = '.cry.local.json';
export const WORKTREE_INCLUDE_FILE = '.worktreeinclude';

/**
 * Default agent presets (can be overridden in config)
 */
const DEFAULT_AGENT_PRESETS: Record<string, AgentPreset> = {
  claude: {
    command: 'claude',
    deny: ['.env', '.env.*'],
    finishOnExitDefault: true,
  },
  cursor: {
    command: 'cursor',
    args: ['.'],
    finishOnExitDefault: false,
  },
};

const DEFAULT_CONFIG: CryConfig = {
  defaultMode: 'copy',
  include: ['.env', '.env.*', '.env.local'],
  injectNonEnv: 'skip',
  hooks: {
    postCreate: [],
    preFinish: [],
    postFinish: [],
    preMerge: [],
  },
  agentCommand: 'claude',
  editorCommand: 'code',
  agents: DEFAULT_AGENT_PRESETS,
};

/**
 * Load the main config file
 */
export function loadConfig(repoRoot: string): CryConfig | null {
  const configPath = path.join(repoRoot, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as CryConfig;
  } catch (error) {
    throw new Error(`Failed to parse ${CONFIG_FILE}: ${(error as Error).message}`);
  }
}

/**
 * Load the local config file
 */
export function loadLocalConfig(repoRoot: string): CryLocalConfig | null {
  const configPath = path.join(repoRoot, LOCAL_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as CryLocalConfig;
  } catch (error) {
    throw new Error(`Failed to parse ${LOCAL_CONFIG_FILE}: ${(error as Error).message}`);
  }
}

/**
 * Merge main config with local overrides
 */
export function mergeConfig(config: CryConfig | null, localConfig: CryLocalConfig | null): MergedConfig {
  const base = config ?? DEFAULT_CONFIG;

  // Merge agent presets: defaults + base config + local config
  const mergedAgents: Record<string, AgentPreset> = {
    ...DEFAULT_AGENT_PRESETS,
    ...base.agents,
  };

  return {
    worktreeBaseDir: localConfig?.worktreeBaseDir ?? base.worktreeBaseDir,
    defaultMode: base.defaultMode,
    include: [...(base.include ?? []), ...(localConfig?.include ?? [])],
    injectNonEnv: base.injectNonEnv ?? 'skip',
    hooks: {
      postCreate: [
        ...(base.hooks?.postCreate ?? []),
        ...(localConfig?.hooks?.postCreate ?? []),
      ],
      preFinish: [
        ...(base.hooks?.preFinish ?? []),
        ...(localConfig?.hooks?.preFinish ?? []),
      ],
      postFinish: [
        ...(base.hooks?.postFinish ?? []),
        ...(localConfig?.hooks?.postFinish ?? []),
      ],
      preMerge: [
        ...(base.hooks?.preMerge ?? []),
        ...(localConfig?.hooks?.preMerge ?? []),
      ],
    },
    agentCommand: localConfig?.agentCommand ?? base.agentCommand ?? 'claude',
    editorCommand: localConfig?.editorCommand ?? base.editorCommand ?? 'code',
    agents: mergedAgents,
  };
}

/**
 * Get merged configuration
 */
export function getMergedConfig(repoRoot: string): MergedConfig {
  const config = loadConfig(repoRoot);
  const localConfig = loadLocalConfig(repoRoot);
  return mergeConfig(config, localConfig);
}

/**
 * Save the main config file
 */
export function saveConfig(repoRoot: string, config: CryConfig): void {
  const configPath = path.join(repoRoot, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Save the local config file
 */
export function saveLocalConfig(repoRoot: string, config: CryLocalConfig): void {
  const configPath = path.join(repoRoot, LOCAL_CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Check if config exists
 */
export function configExists(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, CONFIG_FILE));
}

/**
 * Get default config
 */
export function getDefaultConfig(): CryConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Create default local config
 */
export function getDefaultLocalConfig(): CryLocalConfig {
  return {
    include: [],
  };
}
