/**
 * Environment variable handling for cry inject mode
 *
 * Parses .env files and provides environment variable injection
 * for hooks and agent commands without copying files to worktrees.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Parse a dotenv-format string into key-value pairs
 *
 * Supports:
 * - Basic KEY=value
 * - Comments (# comment)
 * - Empty lines
 * - Quoted values (single and double)
 * - Multiline values with quotes
 * - Export prefix (export KEY=value)
 */
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  let currentKey: string | null = null;
  let currentValue: string | null = null;
  let inMultiline = false;
  let quoteChar: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Handle multiline continuation
    if (inMultiline && currentKey !== null) {
      if (quoteChar && line.endsWith(quoteChar)) {
        // End of multiline
        currentValue += '\n' + line.slice(0, -1);
        result[currentKey] = currentValue!;
        currentKey = null;
        currentValue = null;
        inMultiline = false;
        quoteChar = null;
      } else {
        currentValue += '\n' + line;
      }
      continue;
    }

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    // Handle export prefix
    let processedLine = line;
    if (processedLine.startsWith('export ')) {
      processedLine = processedLine.slice(7).trim();
    }

    // Find the = separator
    const eqIndex = processedLine.indexOf('=');
    if (eqIndex === -1) {
      continue; // Invalid line
    }

    const key = processedLine.slice(0, eqIndex).trim();
    let value = processedLine.slice(eqIndex + 1);

    // Handle quoted values
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      value = value.slice(1);

      if (value.endsWith(quote)) {
        // Single-line quoted value
        value = value.slice(0, -1);
        result[key] = unescapeValue(value, quote);
      } else {
        // Start of multiline
        currentKey = key;
        currentValue = value;
        inMultiline = true;
        quoteChar = quote;
      }
    } else {
      // Unquoted value - strip inline comments
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex);
      }
      result[key] = value.trim();
    }
  }

  return result;
}

/**
 * Unescape special characters in quoted values
 */
function unescapeValue(value: string, quoteChar: string): string {
  if (quoteChar === '"') {
    // Double quotes: expand escape sequences
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"');
  } else {
    // Single quotes: no expansion except \\
    return value.replace(/\\\\/g, '\\');
  }
}

/**
 * Check if a file is a dotenv file by path pattern
 * Matches: .env, .env.*, *.env
 */
export function isDotenvFile(filename: string): boolean {
  const basename = path.basename(filename);

  // Exact match: .env
  if (basename === '.env') {
    return true;
  }

  // Prefix match: .env.* (e.g., .env.local, .env.production)
  if (basename.startsWith('.env.')) {
    return true;
  }

  // Suffix match: *.env (e.g., local.env)
  if (basename.endsWith('.env')) {
    return true;
  }

  return false;
}

/**
 * Load environment variables from a file
 */
export function loadEnvFromFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseDotenv(content);
  } catch {
    return {};
  }
}

/**
 * Load environment from multiple dotenv files with precedence
 * Later files override earlier files
 */
export function loadEnvFromFiles(
  files: string[],
  repoRoot: string
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const file of files) {
    const filePath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
    const envVars = loadEnvFromFile(filePath);

    // Later files override earlier ones
    Object.assign(result, envVars);
  }

  return result;
}

/**
 * Merge environment variables with process.env
 * Injected vars take precedence over existing env
 */
export function mergeWithProcessEnv(
  injectedEnv: Record<string, string>
): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    ...injectedEnv,
  };
}
