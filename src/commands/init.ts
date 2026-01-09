/**
 * cry init command
 *
 * Create or update repo-level config files for cry.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { isGitRepo, getRepoRoot } from '../lib/git.js';
import {
  CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  configExists,
  getDefaultConfig,
  getDefaultLocalConfig,
  saveConfig,
  saveLocalConfig,
  loadConfig,
} from '../lib/config.js';
import * as out from '../lib/output.js';

interface InitOptions {
  force?: boolean;
}

/**
 * Ensure entries exist in .gitignore
 */
function ensureGitignoreEntries(repoRoot: string, entries: string[]): string[] {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }

  const lines = content.split('\n').map((l) => l.trim());
  const added: string[] = [];

  for (const entry of entries) {
    if (!lines.includes(entry)) {
      added.push(entry);
    }
  }

  if (added.length > 0) {
    const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
    const header = content === '' ? '' : '\n# cry\n';
    appendFileSync(gitignorePath, suffix + header + added.join('\n') + '\n');
  }

  return added;
}

export async function init(options: InitOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const changes: string[] = [];

  // Check if config already exists
  if (configExists(repoRoot) && !options.force) {
    out.info(`${CONFIG_FILE} already exists. Use --force to overwrite.`);
    const existing = loadConfig(repoRoot);
    if (existing) {
      out.log('\nCurrent configuration:');
      out.log(JSON.stringify(existing, null, 2));
    }
    return;
  }

  // Create main config
  const config = getDefaultConfig();
  saveConfig(repoRoot, config);
  changes.push(`Created ${out.fmt.path(CONFIG_FILE)}`);

  // Create local config if it doesn't exist
  const localConfigPath = path.join(repoRoot, LOCAL_CONFIG_FILE);
  if (!existsSync(localConfigPath)) {
    const localConfig = getDefaultLocalConfig();
    saveLocalConfig(repoRoot, localConfig);
    changes.push(`Created ${out.fmt.path(LOCAL_CONFIG_FILE)} (gitignored)`);
  }

  // Ensure .gitignore entries
  const gitignoreEntries = [
    LOCAL_CONFIG_FILE,
    '.worktrees/',
    '.worktreeinclude',
    '.cry/',
  ];

  const addedEntries = ensureGitignoreEntries(repoRoot, gitignoreEntries);
  if (addedEntries.length > 0) {
    changes.push(`Added to .gitignore: ${addedEntries.join(', ')}`);
  }

  // Output summary
  out.header('cry Initialized');
  out.newline();

  for (const change of changes) {
    out.success(change);
  }

  out.newline();
  out.log('Configuration created with defaults:');
  out.log(`  • Default mode: ${out.fmt.cyan(config.defaultMode)}`);
  out.log(`  • Include patterns: ${config.include.map((p) => out.fmt.gray(p)).join(', ')}`);
  out.log(`  • Agent command: ${out.fmt.cyan(config.agentCommand ?? 'claude')}`);

  out.newline();
  out.log('Next steps:');
  out.log(`  1. Edit ${out.fmt.path(CONFIG_FILE)} to customize patterns`);
  out.log(`  2. Run ${out.fmt.cyan('cry spawn <branch>')} to create a worktree`);
  out.log(`  3. Run ${out.fmt.cyan('cry doctor')} to verify your setup`);
}
