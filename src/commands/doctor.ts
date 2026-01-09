/**
 * cry doctor command
 *
 * Check and diagnose cry configuration and setup.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  isGitRepo,
  getRepoRoot,
  isTracked,
  isIgnored,
  commandExists,
} from '../lib/git.js';
import {
  CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  configExists,
  loadConfig,
  loadLocalConfig,
  getMergedConfig,
} from '../lib/config.js';
import { expandIncludePatterns, checkFileSafety } from '../lib/secrets.js';
import * as out from '../lib/output.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export async function doctor(): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const checks: CheckResult[] = [];

  out.header('cry Doctor');
  out.log('Checking your cry configuration...');
  out.newline();

  // Check 1: Config file exists
  if (configExists(repoRoot)) {
    checks.push({
      name: 'Config file',
      status: 'pass',
      message: `${CONFIG_FILE} exists`,
    });
  } else {
    checks.push({
      name: 'Config file',
      status: 'warn',
      message: `${CONFIG_FILE} not found. Run 'cry init' to create one.`,
    });
  }

  // Check 2: Local config is gitignored
  const localConfigPath = path.join(repoRoot, LOCAL_CONFIG_FILE);
  if (existsSync(localConfigPath)) {
    if (isIgnored(LOCAL_CONFIG_FILE, repoRoot)) {
      checks.push({
        name: 'Local config ignored',
        status: 'pass',
        message: `${LOCAL_CONFIG_FILE} is properly gitignored`,
      });
    } else if (isTracked(LOCAL_CONFIG_FILE, repoRoot)) {
      checks.push({
        name: 'Local config ignored',
        status: 'fail',
        message: `${LOCAL_CONFIG_FILE} is TRACKED by git! Remove it from tracking.`,
      });
    } else {
      checks.push({
        name: 'Local config ignored',
        status: 'warn',
        message: `${LOCAL_CONFIG_FILE} exists but is not in .gitignore`,
      });
    }
  } else {
    checks.push({
      name: 'Local config',
      status: 'pass',
      message: `${LOCAL_CONFIG_FILE} not present (optional)`,
    });
  }

  // Check 3: .worktrees directory is gitignored
  const worktreesDir = '.worktrees';
  const worktreesDirPath = path.join(repoRoot, worktreesDir);
  if (existsSync(worktreesDirPath)) {
    if (isIgnored(worktreesDir, repoRoot) || isIgnored(worktreesDir + '/', repoRoot)) {
      checks.push({
        name: 'Worktrees dir ignored',
        status: 'pass',
        message: `${worktreesDir}/ is properly gitignored`,
      });
    } else {
      checks.push({
        name: 'Worktrees dir ignored',
        status: 'fail',
        message: `${worktreesDir}/ is NOT gitignored! Add it to .gitignore.`,
      });
    }
  } else {
    if (isIgnored(worktreesDir, repoRoot) || isIgnored(worktreesDir + '/', repoRoot)) {
      checks.push({
        name: 'Worktrees dir ignored',
        status: 'pass',
        message: `${worktreesDir}/ will be gitignored when created`,
      });
    } else {
      checks.push({
        name: 'Worktrees dir ignored',
        status: 'warn',
        message: `${worktreesDir}/ not in .gitignore (add it before spawning)`,
      });
    }
  }

  // Check 4: Include files are safe
  if (configExists(repoRoot)) {
    const config = getMergedConfig(repoRoot);
    const files = await expandIncludePatterns(config.include, repoRoot);

    let allSafe = true;
    const problems: string[] = [];

    for (const file of files) {
      const result = checkFileSafety(file, repoRoot);
      if (!result.safe && result.exists) {
        allSafe = false;
        problems.push(`${file}: ${result.reason}`);
      }
    }

    if (files.length === 0) {
      checks.push({
        name: 'Include patterns',
        status: 'pass',
        message: 'No files matched include patterns (this is fine)',
      });
    } else if (allSafe) {
      checks.push({
        name: 'Include files safety',
        status: 'pass',
        message: `All ${files.length} matched file(s) are safely gitignored`,
      });
    } else {
      checks.push({
        name: 'Include files safety',
        status: 'fail',
        message: `Some include files are NOT safe:\n      ${problems.join('\n      ')}`,
      });
    }
  }

  // Check 5: Agent command exists
  if (configExists(repoRoot)) {
    const config = getMergedConfig(repoRoot);
    const agentCmd = config.agentCommand;

    if (commandExists(agentCmd)) {
      checks.push({
        name: 'Agent command',
        status: 'pass',
        message: `'${agentCmd}' is available`,
      });
    } else {
      checks.push({
        name: 'Agent command',
        status: 'warn',
        message: `'${agentCmd}' not found (optional, but --agent won't work)`,
      });
    }
  }

  // Print results
  let hasFailures = false;
  let hasWarnings = false;

  for (const check of checks) {
    let icon: string;
    let colorFn: (s: string) => string;

    switch (check.status) {
      case 'pass':
        icon = '✓';
        colorFn = out.fmt.green;
        break;
      case 'warn':
        icon = '⚠';
        colorFn = out.fmt.yellow;
        hasWarnings = true;
        break;
      case 'fail':
        icon = '✗';
        colorFn = out.fmt.red;
        hasFailures = true;
        break;
    }

    out.log(`${colorFn(icon)} ${out.fmt.bold(check.name)}`);
    out.log(`  ${check.message}`);
    out.newline();
  }

  // Summary
  out.log('─'.repeat(50));
  if (hasFailures) {
    out.error('Some checks failed. Please fix the issues above.');
    process.exit(1);
  } else if (hasWarnings) {
    out.warn('Some warnings detected. Consider addressing them.');
  } else {
    out.success('All checks passed!');
  }
}
