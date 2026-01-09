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
import type { SecretMode } from './types.js';

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
