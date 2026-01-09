/**
 * cry explain-copy command
 *
 * Explain which files will be copied/symlinked and which are blocked.
 * This helps users understand the security model before spawning.
 */

import {
  isGitRepo,
  getRepoRoot,
} from '../lib/git.js';
import {
  configExists,
  getMergedConfig,
} from '../lib/config.js';
import { generateCopyPlan, formatCopyPlan } from '../lib/secrets.js';
import * as out from '../lib/output.js';

export interface ExplainCopyOptions {
  json?: boolean;
}

export async function explainCopy(options: ExplainCopyOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();

  // Check if config exists
  if (!configExists(repoRoot)) {
    out.error('No .cry.json found. Run "cry init" first.');
    process.exit(1);
  }

  const config = getMergedConfig(repoRoot);

  // Generate the copy plan
  const plan = await generateCopyPlan(config.include, repoRoot);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // Print formatted output
  out.header('Copy Plan');
  out.log(formatCopyPlan(plan, config.defaultMode));
}
