/**
 * Configuration management for cry
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { MergedConfig, CryConfig, CryLocalConfig } from './types.js';

export const CONFIG_FILE = '.cry.json';
export const LOCAL_CONFIG_FILE = '.cry.local.json';
export const WORKTREE_INCLUDE_FILE = '.worktreeinclude';

const DEFAULT_CONFIG: CryConfig = {
  defaultMode: 'copy',
  include: ['.env', '.env.*', '.env.local'],
  hooks: {
    postCreate: [],
  },
  agentCommand: 'claude',
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

  return {
    worktreeBaseDir: localConfig?.worktreeBaseDir ?? base.worktreeBaseDir,
    defaultMode: base.defaultMode,
    include: [...(base.include ?? []), ...(localConfig?.include ?? [])],
    hooks: {
      postCreate: [
        ...(base.hooks?.postCreate ?? []),
        ...(localConfig?.hooks?.postCreate ?? []),
      ],
    },
    agentCommand: localConfig?.agentCommand ?? base.agentCommand ?? 'claude',
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
