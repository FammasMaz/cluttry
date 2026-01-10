/**
 * Secret file handling for cry
 *
 * This module ensures that only git-ignored files are ever copied or symlinked.
 * It provides a safety layer to prevent accidentally exposing tracked files.
 */

import { existsSync, copyFileSync, symlinkSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { isTracked, isIgnored } from './git.js';
import { validateFileCopy, type FileCopyDecision } from './safety.js';
import { isDotenvFile, loadEnvFromFile } from './env.js';
import type { SecretMode } from './types.js';
import * as out from './output.js';

export interface FileCheckResult {
  path: string;
  exists: boolean;
  isTracked: boolean;
  isIgnored: boolean;
  safe: boolean;
  reason?: string;
}

/**
 * Check if a file is safe to copy/symlink
 * A file is safe if:
 * 1. It exists
 * 2. It is NOT tracked by git
 * 3. It IS ignored by git
 */
export function checkFileSafety(filePath: string, repoRoot: string): FileCheckResult {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const relativePath = path.relative(repoRoot, absolutePath);

  const result: FileCheckResult = {
    path: relativePath,
    exists: existsSync(absolutePath),
    isTracked: false,
    isIgnored: false,
    safe: false,
  };

  if (!result.exists) {
    result.reason = 'File does not exist';
    return result;
  }

  result.isTracked = isTracked(relativePath, repoRoot);
  if (result.isTracked) {
    result.reason = 'File is tracked by git (would be committed)';
    return result;
  }

  result.isIgnored = isIgnored(relativePath, repoRoot);
  if (!result.isIgnored) {
    result.reason = 'File is not ignored by git (could be accidentally committed)';
    return result;
  }

  result.safe = true;
  return result;
}

/**
 * Expand glob patterns to actual file paths
 */
export async function expandIncludePatterns(
  patterns: string[],
  repoRoot: string
): Promise<string[]> {
  const allFiles: Set<string> = new Set();

  for (const pattern of patterns) {
    try {
      const matches = await glob(pattern, {
        cwd: repoRoot,
        dot: true,
        nodir: true,
      });
      for (const match of matches) {
        allFiles.add(match);
      }
    } catch {
      // If glob fails, treat as literal path
      if (existsSync(path.join(repoRoot, pattern))) {
        allFiles.add(pattern);
      }
    }
  }

  return Array.from(allFiles).sort();
}

/**
 * Get all safe files from include patterns
 */
export async function getSafeFiles(
  patterns: string[],
  repoRoot: string
): Promise<{ safe: FileCheckResult[]; unsafe: FileCheckResult[] }> {
  const files = await expandIncludePatterns(patterns, repoRoot);
  const safe: FileCheckResult[] = [];
  const unsafe: FileCheckResult[] = [];

  for (const file of files) {
    const result = checkFileSafety(file, repoRoot);
    if (result.safe) {
      safe.push(result);
    } else if (result.exists) {
      // Only report unsafe if file actually exists
      unsafe.push(result);
    }
  }

  return { safe, unsafe };
}

/**
 * Copy a file to the target directory, preserving relative path
 */
export function copyFile(
  relativePath: string,
  sourceRoot: string,
  targetRoot: string
): void {
  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);

  // Create parent directories if needed
  const targetDir = path.dirname(targetPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  copyFileSync(sourcePath, targetPath);
}

/**
 * Create a symlink in the target directory pointing to source
 */
export function createSymlink(
  relativePath: string,
  sourceRoot: string,
  targetRoot: string
): void {
  const sourcePath = path.join(sourceRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);

  // Create parent directories if needed
  const targetDir = path.dirname(targetPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Use absolute path for symlink target for reliability
  symlinkSync(sourcePath, targetPath);
}

/**
 * Process files according to mode (copy or symlink)
 * SAFETY: Only processes files that pass safety checks (not tracked, is ignored)
 */
export async function processSecrets(
  mode: SecretMode,
  patterns: string[],
  sourceRoot: string,
  targetRoot: string
): Promise<{ processed: string[]; skipped: FileCheckResult[] }> {
  if (mode === 'none') {
    return { processed: [], skipped: [] };
  }

  const { safe, unsafe } = await getSafeFiles(patterns, sourceRoot);
  const processed: string[] = [];

  for (const file of safe) {
    // SAFETY: Validate file copy decision before proceeding
    const decision: FileCopyDecision = {
      path: file.path,
      allowed: file.safe,
      reason: file.reason ?? 'File is gitignored and not tracked',
      isTracked: file.isTracked,
      isIgnored: file.isIgnored,
    };

    // This will throw if safety constraints are violated
    validateFileCopy(decision);

    try {
      if (mode === 'copy') {
        copyFile(file.path, sourceRoot, targetRoot);
      } else if (mode === 'symlink') {
        createSymlink(file.path, sourceRoot, targetRoot);
      }
      processed.push(file.path);
    } catch (error) {
      // Add to skipped with error reason
      unsafe.push({
        ...file,
        safe: false,
        reason: `Failed to ${mode}: ${(error as Error).message}`,
      });
    }
  }

  return { processed, skipped: unsafe };
}

/**
 * Copy plan for explain-copy and spawn --dry-run
 */
export interface CopyPlan {
  /** Files that will be copied/symlinked */
  willCopy: Array<{
    path: string;
    reason: string;
  }>;
  /** Files that are blocked from copying */
  blocked: Array<{
    path: string;
    reason: string;
    type: 'tracked' | 'not_ignored' | 'not_found';
  }>;
  /** Warnings about include patterns */
  warnings: string[];
  /** Patterns from config */
  patterns: string[];
}

/**
 * Generate a copy plan explaining what will/won't be copied
 */
export async function generateCopyPlan(
  patterns: string[],
  repoRoot: string
): Promise<CopyPlan> {
  const plan: CopyPlan = {
    willCopy: [],
    blocked: [],
    warnings: [],
    patterns,
  };

  if (patterns.length === 0) {
    return plan;
  }

  // Expand patterns and check each file
  const files = await expandIncludePatterns(patterns, repoRoot);

  for (const file of files) {
    const result = checkFileSafety(file, repoRoot);

    if (result.safe) {
      plan.willCopy.push({
        path: result.path,
        reason: 'gitignored and exists',
      });
    } else if (!result.exists) {
      // Don't report non-existent files as blocked (pattern just didn't match anything real)
      continue;
    } else if (result.isTracked) {
      plan.blocked.push({
        path: result.path,
        reason: result.reason || 'File is tracked by git',
        type: 'tracked',
      });
      plan.warnings.push(
        `Pattern matches tracked file: ${result.path} — tracked files are NEVER copied`
      );
    } else if (!result.isIgnored) {
      plan.blocked.push({
        path: result.path,
        reason: result.reason || 'File is not in .gitignore',
        type: 'not_ignored',
      });
    } else {
      plan.blocked.push({
        path: result.path,
        reason: result.reason || 'Unknown safety issue',
        type: 'not_found',
      });
    }
  }

  return plan;
}

/**
 * Format a copy plan for human-readable output
 */
export function formatCopyPlan(plan: CopyPlan, mode: SecretMode): string {
  const lines: string[] = [];

  // Patterns
  lines.push(out.fmt.bold('Include patterns:'));
  if (plan.patterns.length === 0) {
    lines.push('  (none configured)');
  } else {
    for (const pattern of plan.patterns) {
      lines.push(`  ${out.fmt.dim('•')} ${pattern}`);
    }
  }
  lines.push('');

  // Warnings (if any)
  if (plan.warnings.length > 0) {
    lines.push(out.fmt.yellow(out.fmt.bold('⚠ Warnings:')));
    for (const warning of plan.warnings) {
      lines.push(`  ${out.fmt.yellow('•')} ${warning}`);
    }
    lines.push('');
  }

  // Files that will be copied
  lines.push(out.fmt.green(out.fmt.bold(`✓ Will ${mode === 'symlink' ? 'symlink' : 'copy'} (${plan.willCopy.length} file${plan.willCopy.length !== 1 ? 's' : ''}):`)));
  if (plan.willCopy.length === 0) {
    lines.push(`  ${out.fmt.dim('(no files matched)')}`);
  } else {
    for (const file of plan.willCopy) {
      lines.push(`  ${out.fmt.green('•')} ${file.path}`);
      lines.push(`      ${out.fmt.dim(file.reason)}`);
    }
  }
  lines.push('');

  // Files that are blocked
  lines.push(out.fmt.red(out.fmt.bold(`✗ Blocked (${plan.blocked.length} file${plan.blocked.length !== 1 ? 's' : ''}):`)));
  if (plan.blocked.length === 0) {
    lines.push(`  ${out.fmt.dim('(none)')}`);
  } else {
    for (const file of plan.blocked) {
      const icon = file.type === 'tracked' ? '🔒' : file.type === 'not_ignored' ? '⚠' : '?';
      lines.push(`  ${out.fmt.red('•')} ${icon} ${file.path}`);
      lines.push(`      ${out.fmt.dim(file.reason)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Result of inject mode processing
 */
export interface InjectResult {
  /** Environment variables parsed from dotenv files */
  env: Record<string, string>;
  /** Non-dotenv files that were skipped */
  skippedFiles: string[];
  /** Files that were symlinked (if injectNonEnv: 'symlink') */
  symlinkFiles: string[];
  /** Dotenv files that were processed */
  processedEnvFiles: string[];
}

/**
 * Process secrets in inject mode
 *
 * - For dotenv files (.env, .env.*, *.env): parse and collect env vars (do NOT copy)
 * - For non-dotenv files: skip by default, or symlink if configured
 */
export async function processInjectMode(
  patterns: string[],
  sourceRoot: string,
  targetRoot: string,
  options: { injectNonEnv?: 'skip' | 'symlink' } = {}
): Promise<InjectResult> {
  const result: InjectResult = {
    env: {},
    skippedFiles: [],
    symlinkFiles: [],
    processedEnvFiles: [],
  };

  const { injectNonEnv = 'skip' } = options;

  // Get all safe files from patterns
  const { safe } = await getSafeFiles(patterns, sourceRoot);

  for (const file of safe) {
    const filePath = path.join(sourceRoot, file.path);

    if (isDotenvFile(file.path)) {
      // Parse dotenv file and merge into result
      const envVars = loadEnvFromFile(filePath);
      Object.assign(result.env, envVars);
      result.processedEnvFiles.push(file.path);
    } else {
      // Non-dotenv file
      if (injectNonEnv === 'symlink') {
        try {
          createSymlink(file.path, sourceRoot, targetRoot);
          result.symlinkFiles.push(file.path);
        } catch (error) {
          result.skippedFiles.push(file.path);
        }
      } else {
        result.skippedFiles.push(file.path);
      }
    }
  }

  return result;
}

/**
 * Generate an inject plan explaining what will happen in inject mode
 */
export interface InjectPlan {
  /** Dotenv files that will be parsed for env vars */
  willInject: Array<{
    path: string;
    reason: string;
  }>;
  /** Non-dotenv files that will be skipped */
  willSkip: Array<{
    path: string;
    reason: string;
  }>;
  /** Non-dotenv files that will be symlinked */
  willSymlink: Array<{
    path: string;
    reason: string;
  }>;
  /** Warnings */
  warnings: string[];
  /** Patterns from config */
  patterns: string[];
}

/**
 * Generate an inject plan
 */
export async function generateInjectPlan(
  patterns: string[],
  repoRoot: string,
  injectNonEnv: 'skip' | 'symlink' = 'skip'
): Promise<InjectPlan> {
  const plan: InjectPlan = {
    willInject: [],
    willSkip: [],
    willSymlink: [],
    warnings: [],
    patterns,
  };

  if (patterns.length === 0) {
    return plan;
  }

  const { safe, unsafe } = await getSafeFiles(patterns, repoRoot);

  for (const file of safe) {
    if (isDotenvFile(file.path)) {
      plan.willInject.push({
        path: file.path,
        reason: 'dotenv file - env vars will be injected',
      });
    } else {
      if (injectNonEnv === 'symlink') {
        plan.willSymlink.push({
          path: file.path,
          reason: 'non-dotenv file - will be symlinked',
        });
      } else {
        plan.willSkip.push({
          path: file.path,
          reason: 'non-dotenv file - will be skipped (use injectNonEnv: "symlink" to symlink)',
        });
      }
    }
  }

  // Add warnings for unsafe files
  for (const file of unsafe) {
    plan.warnings.push(`Pattern matches unsafe file: ${file.path} — ${file.reason}`);
  }

  return plan;
}

/**
 * Format an inject plan for human-readable output
 */
export function formatInjectPlan(plan: InjectPlan): string {
  const lines: string[] = [];

  lines.push(out.fmt.bold('Inject Mode - Include patterns:'));
  if (plan.patterns.length === 0) {
    lines.push('  (none configured)');
  } else {
    for (const pattern of plan.patterns) {
      lines.push(`  ${out.fmt.dim('•')} ${pattern}`);
    }
  }
  lines.push('');

  // Warnings
  if (plan.warnings.length > 0) {
    lines.push(out.fmt.yellow(out.fmt.bold('⚠ Warnings:')));
    for (const warning of plan.warnings) {
      lines.push(`  ${out.fmt.yellow('•')} ${warning}`);
    }
    lines.push('');
  }

  // Files that will be injected
  lines.push(out.fmt.green(out.fmt.bold(`✓ Will inject env vars from (${plan.willInject.length} file${plan.willInject.length !== 1 ? 's' : ''}):`)));
  if (plan.willInject.length === 0) {
    lines.push(`  ${out.fmt.dim('(no dotenv files matched)')}`);
  } else {
    for (const file of plan.willInject) {
      lines.push(`  ${out.fmt.green('•')} ${file.path}`);
    }
  }
  lines.push('');

  // Files that will be symlinked
  if (plan.willSymlink.length > 0) {
    lines.push(out.fmt.blue(out.fmt.bold(`↗ Will symlink (${plan.willSymlink.length} file${plan.willSymlink.length !== 1 ? 's' : ''}):`)));
    for (const file of plan.willSymlink) {
      lines.push(`  ${out.fmt.blue('•')} ${file.path}`);
    }
    lines.push('');
  }

  // Files that will be skipped
  if (plan.willSkip.length > 0) {
    lines.push(out.fmt.dim(`○ Will skip (${plan.willSkip.length} non-dotenv file${plan.willSkip.length !== 1 ? 's' : ''}):`));
    for (const file of plan.willSkip) {
      lines.push(`  ${out.fmt.dim('•')} ${file.path}`);
    }
    lines.push('');
  }

  lines.push(out.fmt.dim('Note: Environment variables will be injected into hooks and agent commands.'));
  lines.push(out.fmt.dim('      No secret files will be copied to the worktree.'));

  return lines.join('\n');
}

