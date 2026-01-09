/**
 * Integration test helpers for cry CLI
 *
 * Provides utilities for creating temporary git repos and running CLI commands.
 */

import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Path to the built CLI
const CLI_PATH = path.resolve(__dirname, '../../dist/index.js');

// Track temp directories for cleanup
const tempDirs: string[] = [];

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RepoContext {
  root: string;
  cleanup: () => void;
}

/**
 * Create a temporary git repository for testing
 */
export function createRepo(name?: string): RepoContext {
  const prefix = `cry-test-${name ?? 'repo'}-`;
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(root);

  // Initialize git repo
  execSync('git init', { cwd: root, stdio: 'pipe' });

  // Configure git user for commits (required in CI)
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: root, stdio: 'pipe' });

  // Create initial commit (needed for worktrees)
  writeFileSync(path.join(root, 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: root, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: root, stdio: 'pipe' });

  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Create and commit a file in the repo
 */
export function commitFile(
  repoRoot: string,
  filePath: string,
  content: string,
  message?: string
): void {
  const absolutePath = path.join(repoRoot, filePath);
  const dir = path.dirname(absolutePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(absolutePath, content);
  execSync(`git add "${filePath}"`, { cwd: repoRoot, stdio: 'pipe' });
  execSync(`git commit -m "${message ?? `Add ${filePath}`}"`, { cwd: repoRoot, stdio: 'pipe' });
}

/**
 * Create a file without committing (for testing gitignored files)
 */
export function createFile(repoRoot: string, filePath: string, content: string): void {
  const absolutePath = path.join(repoRoot, filePath);
  const dir = path.dirname(absolutePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(absolutePath, content);
}

/**
 * Create a git branch
 */
export function createBranch(repoRoot: string, branchName: string): void {
  execSync(`git branch "${branchName}"`, { cwd: repoRoot, stdio: 'pipe' });
}

/**
 * Get current branch name
 */
export function getCurrentBranch(repoRoot: string): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
}

/**
 * Run the cry CLI as a subprocess
 */
export async function runCli(
  args: string[],
  cwd: string,
  envOverrides?: Record<string, string>,
  stdinInput?: string
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        // Disable colors for predictable output
        NO_COLOR: '1',
        // Ensure consistent locale
        LC_ALL: 'C',
        // Apply any environment overrides
        ...envOverrides,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Write stdin input if provided
    if (stdinInput !== undefined) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      resolve({
        stdout,
        stderr: stderr + err.message,
        exitCode: 1,
      });
    });
  });
}

/**
 * Run CLI and expect success (exit code 0)
 */
export async function runCliSuccess(args: string[], cwd: string): Promise<CliResult> {
  const result = await runCli(args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI command failed: cry ${args.join(' ')}\n` +
      `Exit code: ${result.exitCode}\n` +
      `Stdout: ${result.stdout}\n` +
      `Stderr: ${result.stderr}`
    );
  }
  return result;
}

/**
 * Read a file from the repo
 */
export function readFile(repoRoot: string, filePath: string): string {
  return readFileSync(path.join(repoRoot, filePath), 'utf-8');
}

/**
 * Check if a path exists
 */
export function exists(repoRoot: string, filePath: string): boolean {
  return existsSync(path.join(repoRoot, filePath));
}

/**
 * List directory contents
 */
export function listDir(repoRoot: string, dirPath: string = '.'): string[] {
  const absolutePath = path.join(repoRoot, dirPath);
  if (!existsSync(absolutePath)) {
    return [];
  }
  return readdirSync(absolutePath);
}

/**
 * List worktrees using git directly (for verification)
 */
export function listWorktrees(repoRoot: string): string[] {
  const output = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf-8' });
  const worktrees: string[] = [];

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      worktrees.push(line.substring(9));
    }
  }

  return worktrees;
}

/**
 * Cleanup all temp directories created during tests
 */
export function cleanupAll(): void {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs.length = 0;
}

/**
 * Read JSON file from the repo
 */
export function readJson(repoRoot: string, filePath: string): unknown {
  const content = readFileSync(path.join(repoRoot, filePath), 'utf-8');
  return JSON.parse(content);
}

/**
 * List session manifests in .cry/sessions/
 */
export function listSessionFiles(repoRoot: string): string[] {
  const sessionsDir = path.join(repoRoot, '.cry', 'sessions');
  if (!existsSync(sessionsDir)) {
    return [];
  }
  return readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
}

/**
 * Read a session manifest
 */
export function readSession(repoRoot: string, sessionId: string): Record<string, unknown> | null {
  const sessionPath = path.join(repoRoot, '.cry', 'sessions', `${sessionId}.json`);
  if (!existsSync(sessionPath)) {
    return null;
  }
  return JSON.parse(readFileSync(sessionPath, 'utf-8'));
}

/**
 * Add entry to .gitignore
 */
export function addToGitignore(repoRoot: string, entry: string): void {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }

  if (!content.includes(entry)) {
    const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
    writeFileSync(gitignorePath, content + suffix + entry + '\n');
  }
}
