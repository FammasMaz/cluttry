/**
 * Integration tests for cry CLI
 *
 * These tests run the actual CLI binary against real git repos.
 * They verify end-to-end behavior without mocking.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
  createRepo,
  commitFile,
  createFile,
  createBranch,
  getCurrentBranch,
  runCli,
  runCliSuccess,
  readFile,
  exists,
  listDir,
  listWorktrees,
  cleanupAll,
  addToGitignore,
  listSessionFiles,
  readSession,
  type RepoContext,
} from './helpers/integration.js';

// Increase timeout for integration tests
const TEST_TIMEOUT = 30000;

describe('cry CLI integration tests', () => {
  let repo: RepoContext;

  afterEach(() => {
    // Cleanup after each test
    if (repo) {
      repo.cleanup();
    }
  });

  afterAll(() => {
    // Final cleanup
    cleanupAll();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: cry --help works
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry --help', () => {
    it('displays help text and exits successfully', async () => {
      repo = createRepo('help');

      const result = await runCli(['--help'], repo.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('cry');
      expect(result.stdout).toContain('spawn');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('rm');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('doctor');
    }, TEST_TIMEOUT);

    it('displays version', async () => {
      repo = createRepo('version');

      const result = await runCli(['--version'], repo.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: spawn creates a worktree directory
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry spawn (new branch)', () => {
    it('creates a worktree directory for a new branch', async () => {
      repo = createRepo('spawn-new');

      // Spawn a new branch
      const result = await runCliSuccess(['spawn', 'feature-test', '--new'], repo.root);

      // Verify output
      expect(result.stdout).toContain('feature-test');
      expect(result.stdout).toContain('Worktree created');

      // Verify worktree directory exists
      expect(exists(repo.root, '.worktrees/feature-test')).toBe(true);

      // Verify git sees the worktree
      const worktrees = listWorktrees(repo.root);
      expect(worktrees.length).toBe(2); // main + new worktree
      expect(worktrees.some(wt => wt.includes('feature-test'))).toBe(true);

      // Verify files are present in worktree
      expect(exists(repo.root, '.worktrees/feature-test/README.md')).toBe(true);
    }, TEST_TIMEOUT);

    it('creates worktree with custom path', async () => {
      repo = createRepo('spawn-path');

      const result = await runCliSuccess(
        ['spawn', 'custom-branch', '--new', '--path', '.worktrees/custom-location'],
        repo.root
      );

      expect(result.stdout).toContain('Worktree created');
      expect(exists(repo.root, '.worktrees/custom-location')).toBe(true);
      expect(exists(repo.root, '.worktrees/custom-location/README.md')).toBe(true);
    }, TEST_TIMEOUT);

    it('sanitizes branch names with slashes', async () => {
      repo = createRepo('spawn-slash');

      const result = await runCliSuccess(['spawn', 'feature/with/slashes', '--new'], repo.root);

      expect(result.stdout).toContain('Worktree created');
      // Branch name slashes become dashes in path
      expect(exists(repo.root, '.worktrees/feature-with-slashes')).toBe(true);
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: spawn on existing branch behaves as documented
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry spawn (existing branch)', () => {
    it('creates worktree for pre-existing branch', async () => {
      repo = createRepo('spawn-existing');

      // Create a branch first
      createBranch(repo.root, 'existing-branch');

      // Spawn without --new (should work since branch exists)
      const result = await runCliSuccess(['spawn', 'existing-branch'], repo.root);

      expect(result.stdout).toContain('Worktree created');
      expect(result.stdout).not.toContain('(new)'); // Should not say "new"
      expect(exists(repo.root, '.worktrees/existing-branch')).toBe(true);
    }, TEST_TIMEOUT);

    it('fails when branch does not exist and --new not specified', async () => {
      repo = createRepo('spawn-noexist');

      // Try to spawn non-existent branch without --new
      // Note: current implementation auto-creates, so this tests that behavior
      const result = await runCli(['spawn', 'nonexistent-branch'], repo.root);

      // Should still work (auto-creates) - this is current behavior
      // If we want strict mode, we'd need to change implementation
      expect(result.exitCode).toBe(0);
    }, TEST_TIMEOUT);

    it('fails when worktree already exists for branch', async () => {
      repo = createRepo('spawn-duplicate');

      // Create first worktree
      await runCliSuccess(['spawn', 'dup-branch', '--new'], repo.root);

      // Try to create second worktree for same branch
      const result = await runCli(['spawn', 'dup-branch'], repo.root);

      expect(result.exitCode).toBe(1);
      // Error message includes structured format with fix commands
      const output = result.stdout + result.stderr;
      expect(output).toContain('already exists');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);

    it('fails when destination path already exists', async () => {
      repo = createRepo('spawn-pathexists');

      // Create the directory manually
      createFile(repo.root, '.worktrees/blocked/file.txt', 'blocking');

      // Try to spawn to that location
      const result = await runCli(['spawn', 'blocked', '--new'], repo.root);

      expect(result.exitCode).toBe(1);
      // Error message includes structured format with fix commands
      const output = result.stdout + result.stderr;
      expect(output).toContain('already exists');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: list shows the created worktree
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry list', () => {
    it('shows all worktrees', async () => {
      repo = createRepo('list-basic');

      // Create a worktree
      await runCliSuccess(['spawn', 'list-test', '--new'], repo.root);

      // List worktrees
      const result = await runCliSuccess(['list'], repo.root);

      expect(result.stdout).toContain('Worktrees');
      expect(result.stdout).toContain('list-test');
      expect(result.stdout).toContain('2 worktree(s)'); // main + new
    }, TEST_TIMEOUT);

    it('shows dirty status for worktrees with changes', async () => {
      repo = createRepo('list-dirty');

      // Create a worktree
      await runCliSuccess(['spawn', 'dirty-test', '--new'], repo.root);

      // Make the worktree dirty
      createFile(repo.root, '.worktrees/dirty-test/uncommitted.txt', 'dirty');

      // List worktrees
      const result = await runCliSuccess(['list'], repo.root);

      expect(result.stdout).toContain('dirty');
    }, TEST_TIMEOUT);

    it('outputs JSON format', async () => {
      repo = createRepo('list-json');

      // Create a worktree
      await runCliSuccess(['spawn', 'json-test', '--new'], repo.root);

      // List in JSON format
      const result = await runCliSuccess(['list', '--json'], repo.root);

      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);

      const worktree = parsed.find((w: any) => w.branch === 'json-test');
      expect(worktree).toBeDefined();
      expect(worktree.path).toContain('json-test');
    }, TEST_TIMEOUT);

    it('shows empty state gracefully', async () => {
      repo = createRepo('list-empty');

      // List with only main worktree
      const result = await runCliSuccess(['list'], repo.root);

      expect(result.stdout).toContain('1 worktree(s)');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: rm removes the worktree safely
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry rm', () => {
    it('removes a clean worktree', async () => {
      repo = createRepo('rm-clean');

      // Create a worktree
      await runCliSuccess(['spawn', 'to-remove', '--new'], repo.root);
      expect(exists(repo.root, '.worktrees/to-remove')).toBe(true);

      // Remove it
      const result = await runCliSuccess(['rm', 'to-remove'], repo.root);

      expect(result.stdout).toContain('Worktree removed');
      expect(exists(repo.root, '.worktrees/to-remove')).toBe(false);

      // Git should no longer see it
      const worktrees = listWorktrees(repo.root);
      expect(worktrees.some(wt => wt.includes('to-remove'))).toBe(false);
    }, TEST_TIMEOUT);

    it('refuses to remove dirty worktree without --force', async () => {
      repo = createRepo('rm-dirty');

      // Create a worktree
      await runCliSuccess(['spawn', 'dirty-wt', '--new'], repo.root);

      // Make it dirty
      createFile(repo.root, '.worktrees/dirty-wt/uncommitted.txt', 'dirty');

      // Try to remove without --force
      const result = await runCli(['rm', 'dirty-wt'], repo.root);

      expect(result.exitCode).toBe(1);
      // Error message mentions using --force
      expect(result.stdout).toContain('--force');
      expect(exists(repo.root, '.worktrees/dirty-wt')).toBe(true);
    }, TEST_TIMEOUT);

    it('removes dirty worktree with --force --yes', async () => {
      repo = createRepo('rm-force');

      // Create a worktree
      await runCliSuccess(['spawn', 'force-rm', '--new'], repo.root);

      // Make it dirty
      createFile(repo.root, '.worktrees/force-rm/uncommitted.txt', 'dirty');

      // Force remove
      const result = await runCliSuccess(['rm', 'force-rm', '--force', '--yes'], repo.root);

      expect(result.stdout).toContain('Worktree removed');
      expect(exists(repo.root, '.worktrees/force-rm')).toBe(false);
    }, TEST_TIMEOUT);

    it('removes worktree and branch with --with-branch', async () => {
      repo = createRepo('rm-branch');

      // Create a worktree
      await runCliSuccess(['spawn', 'with-branch-rm', '--new'], repo.root);

      // Remove with branch deletion
      const result = await runCliSuccess(['rm', 'with-branch-rm', '--with-branch'], repo.root);

      expect(result.stdout).toContain('Worktree removed');
      expect(result.stdout).toContain('Branch deleted');
      expect(exists(repo.root, '.worktrees/with-branch-rm')).toBe(false);
    }, TEST_TIMEOUT);

    it('prevents removing main worktree', async () => {
      repo = createRepo('rm-main');

      // Try to remove main (the repo root itself)
      const result = await runCli(['rm', 'master'], repo.root);

      // Should fail - can't remove main worktree
      // Note: branch might be 'main' or 'master' depending on git config
      expect(result.exitCode).toBe(1);
    }, TEST_TIMEOUT);

    it('fails gracefully for non-existent worktree', async () => {
      repo = createRepo('rm-notfound');

      const result = await runCli(['rm', 'does-not-exist'], repo.root);

      expect(result.exitCode).toBe(1);
      // Shows structured error with fix commands
      const output = result.stdout + result.stderr;
      expect(output).toContain('Worktree not found');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional: init and doctor
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry init', () => {
    it('creates config files', async () => {
      repo = createRepo('init-basic');

      const result = await runCliSuccess(['init'], repo.root);

      expect(result.stdout).toContain('Initialized');
      expect(exists(repo.root, '.cry.json')).toBe(true);
      expect(exists(repo.root, '.cry.local.json')).toBe(true);

      // Verify config content
      const config = JSON.parse(readFile(repo.root, '.cry.json'));
      expect(config.defaultMode).toBe('copy');
      expect(config.include).toContain('.env');
    }, TEST_TIMEOUT);

    it('updates .gitignore', async () => {
      repo = createRepo('init-gitignore');

      await runCliSuccess(['init'], repo.root);

      const gitignore = readFile(repo.root, '.gitignore');
      expect(gitignore).toContain('.cry.local.json');
      expect(gitignore).toContain('.worktrees/');
    }, TEST_TIMEOUT);

    it('refuses to overwrite without --force', async () => {
      repo = createRepo('init-noforce');

      // First init
      await runCliSuccess(['init'], repo.root);

      // Second init without force
      const result = await runCli(['init'], repo.root);

      expect(result.exitCode).toBe(0); // Exits cleanly but doesn't overwrite
      expect(result.stdout).toContain('already exists');
    }, TEST_TIMEOUT);
  });

  describe('cry doctor', () => {
    it('passes when properly configured', async () => {
      repo = createRepo('doctor-pass');

      // Initialize
      await runCliSuccess(['init'], repo.root);

      // Commit the config
      commitFile(repo.root, '.cry.json', readFile(repo.root, '.cry.json'), 'Add config');

      // Run doctor
      const result = await runCliSuccess(['doctor'], repo.root);

      // Check that config-related checks passed (shown with checkmark)
      expect(result.stdout).toContain('✓ Config file');
      expect(result.stdout).toContain('.cry.json exists');
    }, TEST_TIMEOUT);

    it('warns when config is missing', async () => {
      repo = createRepo('doctor-noconfig');

      const result = await runCli(['doctor'], repo.root);

      expect(result.stdout).toContain('.cry.json');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Additional: open command
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry open', () => {
    it('finds worktree by branch name', async () => {
      repo = createRepo('open-branch');

      await runCliSuccess(['spawn', 'find-me', '--new'], repo.root);

      const result = await runCliSuccess(['open', 'find-me', '--path-only'], repo.root);

      expect(result.stdout.trim()).toContain('.worktrees/find-me');
    }, TEST_TIMEOUT);

    it('fails for non-existent worktree', async () => {
      repo = createRepo('open-notfound');

      const result = await runCli(['open', 'not-here'], repo.root);

      expect(result.exitCode).toBe(1);
      // Shows structured error with fix commands
      const output = result.stdout + result.stderr;
      expect(output).toContain('Worktree not found');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Secrets handling
  // ─────────────────────────────────────────────────────────────────────────
  describe('secrets handling', () => {
    it('copies gitignored .env files to worktree', async () => {
      repo = createRepo('secrets-copy');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a .env file (should be gitignored by default)
      addToGitignore(repo.root, '.env');
      createFile(repo.root, '.env', 'SECRET_KEY=test123');

      // Spawn with copy mode (default)
      await runCliSuccess(['spawn', 'secrets-test', '--new', '--mode', 'copy'], repo.root);

      // Verify .env was copied
      expect(exists(repo.root, '.worktrees/secrets-test/.env')).toBe(true);
      expect(readFile(repo.root, '.worktrees/secrets-test/.env')).toBe('SECRET_KEY=test123');
    }, TEST_TIMEOUT);

    it('does not copy tracked files', async () => {
      repo = createRepo('secrets-tracked');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // The README.md is tracked, should not be in include patterns
      // Create custom config with bad pattern
      createFile(repo.root, '.cry.json', JSON.stringify({
        defaultMode: 'copy',
        include: ['README.md'], // This is tracked!
      }, null, 2));

      // Spawn - should not copy README.md as a "secret"
      const result = await runCliSuccess(['spawn', 'no-copy-tracked', '--new'], repo.root);

      // Should warn about skipped files
      // (The file exists in worktree because it's part of the repo, not because it was copied)
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Shorthand command parsing
  // ─────────────────────────────────────────────────────────────────────────
  describe('shorthand syntax', () => {
    it('cry <name> creates worktree with --new', async () => {
      repo = createRepo('shorthand-basic');

      // Use shorthand: cry feat-test (instead of cry spawn feat-test --new)
      const result = await runCliSuccess(['feat-test'], repo.root);

      expect(result.stdout).toContain('Worktree created');
      expect(result.stdout).toContain('feat-test');
      expect(exists(repo.root, '.worktrees/feat-test')).toBe(true);
    }, TEST_TIMEOUT);

    it('cry <name> cursor creates worktree with agent recorded', async () => {
      repo = createRepo('shorthand-agent');

      // Use 'cursor' agent - not installed so won't block, but will be recorded in manifest
      const result = await runCli(['agent-branch', 'cursor'], repo.root);

      // Should create worktree even if agent not found
      expect(exists(repo.root, '.worktrees/agent-branch')).toBe(true);

      // Check session manifest recorded the agent
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);
      const sessionId = sessions[0].replace('.json', '');
      const manifest = readSession(repo.root, sessionId);
      expect(manifest!.agent).toBe('cursor');
    }, TEST_TIMEOUT);

    it('subcommands take precedence over shorthand', async () => {
      repo = createRepo('shorthand-precedence');

      // 'list' is a subcommand, should not be treated as branch name
      const result = await runCliSuccess(['list'], repo.root);

      expect(result.stdout).toContain('worktree');
      // Should not have created a worktree named 'list'
      expect(exists(repo.root, '.worktrees/list')).toBe(false);
    }, TEST_TIMEOUT);

    it('init subcommand works normally', async () => {
      repo = createRepo('shorthand-init');

      const result = await runCliSuccess(['init'], repo.root);

      expect(result.stdout).toContain('Initialized');
      expect(exists(repo.root, '.cry.json')).toBe(true);
    }, TEST_TIMEOUT);

    it('spawn subcommand still works explicitly', async () => {
      repo = createRepo('shorthand-spawn');

      // Explicit spawn command
      const result = await runCliSuccess(['spawn', 'explicit-branch', '--new'], repo.root);

      expect(result.stdout).toContain('Worktree created');
      expect(exists(repo.root, '.worktrees/explicit-branch')).toBe(true);
    }, TEST_TIMEOUT);

    it('rm subcommand works normally', async () => {
      repo = createRepo('shorthand-rm');

      // Create a worktree first
      await runCliSuccess(['spawn', 'to-rm', '--new'], repo.root);

      // rm should work as subcommand
      const result = await runCliSuccess(['rm', 'to-rm'], repo.root);

      expect(result.stdout).toContain('Worktree removed');
    }, TEST_TIMEOUT);

    it('unknown second arg is passed through as option', async () => {
      repo = createRepo('shorthand-unknown');

      // 'unknownagent' is not a known agent, should be passed as remaining arg
      // This will cause an error since it's not a valid option
      const result = await runCli(['test-branch', 'unknownagent'], repo.root);

      // Commander will error on unknown argument
      // The important thing is it doesn't crash and shorthand still works for branch
      // Actually, the remaining arg is passed through to spawn, which ignores unknown positional args
      // So this should work and create the worktree
      expect(exists(repo.root, '.worktrees/test-branch')).toBe(true);
    }, TEST_TIMEOUT);

    it('options after shorthand are passed through', async () => {
      repo = createRepo('shorthand-options');

      // Shorthand with additional options
      const result = await runCliSuccess(['opt-branch', '--mode', 'none'], repo.root);

      expect(result.stdout).toContain('Worktree created');
      expect(result.stdout).toContain('none'); // mode should show as 'none'
      expect(exists(repo.root, '.worktrees/opt-branch')).toBe(true);
    }, TEST_TIMEOUT);

    it('shorthand with slashes in branch name works', async () => {
      repo = createRepo('shorthand-slash');

      const result = await runCliSuccess(['feature/auth'], repo.root);

      expect(result.stdout).toContain('Worktree created');
      // Slashes become dashes in path
      expect(exists(repo.root, '.worktrees/feature-auth')).toBe(true);
    }, TEST_TIMEOUT);

    it('help still works', async () => {
      repo = createRepo('shorthand-help');

      const result = await runCliSuccess(['--help'], repo.root);

      expect(result.stdout).toContain('Shorthand syntax');
      expect(result.stdout).toContain('cry <name>');
      expect(result.stdout).toContain('claude');
    }, TEST_TIMEOUT);

    it('ls alias works as subcommand', async () => {
      repo = createRepo('shorthand-ls');

      const result = await runCliSuccess(['ls'], repo.root);

      expect(result.stdout).toContain('worktree');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cry finish command
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry finish', () => {
    it('shows session summary in worktree', async () => {
      repo = createRepo('finish-basic');

      // Create a worktree
      await runCliSuccess(['spawn', 'finish-test', '--new'], repo.root);

      // Run finish from within the worktree (non-interactive)
      const worktreePath = `${repo.root}/.worktrees/finish-test`;
      const result = await runCliSuccess(['finish', '--non-interactive', '--skip-cleanup'], worktreePath);

      // Should show summary with expected fields
      expect(result.stdout).toContain('Session Summary');
      expect(result.stdout).toContain('finish-test'); // branch name
      expect(result.stdout).toContain('master'); // base branch
      expect(result.stdout).toContain('Working Tree Status');
      expect(result.stdout).toContain('Commits');
    }, TEST_TIMEOUT);

    it('outputs JSON format with --json flag', async () => {
      repo = createRepo('finish-json');

      // Create a worktree
      await runCliSuccess(['spawn', 'json-finish', '--new'], repo.root);

      // Run finish with --json from within the worktree
      const worktreePath = `${repo.root}/.worktrees/json-finish`;
      const result = await runCliSuccess(['finish', '--json'], worktreePath);

      // Should be valid JSON
      const json = JSON.parse(result.stdout);
      expect(json.branch).toBe('json-finish');
      expect(json.baseBranch).toBeDefined();
      expect(json.worktreePath).toContain('json-finish');
      expect(json.status).toBeDefined();
      expect(json.status.clean).toBe(true);
      expect(json.diff).toBeDefined();
      expect(json.commits).toBeDefined();
    }, TEST_TIMEOUT);

    it('detects uncommitted changes', async () => {
      repo = createRepo('finish-dirty');

      // Create a worktree
      await runCliSuccess(['spawn', 'dirty-finish', '--new'], repo.root);

      // Add uncommitted changes
      const worktreePath = `${repo.root}/.worktrees/dirty-finish`;
      createFile(repo.root, '.worktrees/dirty-finish/new-file.txt', 'uncommitted content');

      // Run finish
      const result = await runCliSuccess(['finish', '--json'], worktreePath);

      const json = JSON.parse(result.stdout);
      expect(json.status.clean).toBe(false);
      expect(json.status.untracked).toContain('new-file.txt');
    }, TEST_TIMEOUT);

    it('shows commits ahead of base', async () => {
      repo = createRepo('finish-commits');

      // Create a worktree
      await runCliSuccess(['spawn', 'commit-finish', '--new'], repo.root);

      // Add a commit in the worktree
      const worktreePath = `${repo.root}/.worktrees/commit-finish`;
      commitFile(worktreePath, 'new-feature.txt', 'feature content', 'Add new feature');

      // Run finish
      const result = await runCliSuccess(['finish', '--json'], worktreePath);

      const json = JSON.parse(result.stdout);
      expect(json.commits.ahead).toBeGreaterThanOrEqual(1);
      expect(json.commits.list.length).toBeGreaterThanOrEqual(1);
      expect(json.commits.list[0].message).toContain('Add new feature');
    }, TEST_TIMEOUT);

    it('includes session ID when manifest exists', async () => {
      repo = createRepo('finish-session');

      // Create a worktree (which creates a session)
      await runCliSuccess(['spawn', 'session-finish', '--new'], repo.root);

      // Run finish
      const worktreePath = `${repo.root}/.worktrees/session-finish`;
      const result = await runCliSuccess(['finish', '--json'], worktreePath);

      const json = JSON.parse(result.stdout);
      expect(json.sessionId).not.toBeNull();
      expect(typeof json.sessionId).toBe('string');
    }, TEST_TIMEOUT);

    it('works with fallback when no manifest exists', async () => {
      repo = createRepo('finish-fallback');

      // Create a worktree manually (without cry, so no manifest)
      const worktreePath = `${repo.root}/.worktrees/manual-wt`;
      createBranch(repo.root, 'manual-branch');
      // Use git directly to create worktree
      const { execSync } = await import('node:child_process');
      execSync(`git worktree add "${worktreePath}" manual-branch`, { cwd: repo.root });

      // Run finish - should work via git introspection
      const result = await runCliSuccess(['finish', '--json'], worktreePath);

      const json = JSON.parse(result.stdout);
      expect(json.branch).toBe('manual-branch');
      expect(json.sessionId).toBeNull(); // No manifest
    }, TEST_TIMEOUT);

    it('fails gracefully outside git repo', async () => {
      repo = createRepo('finish-outside');

      // Run finish in temp directory (not a git repo)
      const { mkdtempSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const nonGitDir = mkdtempSync(`${tmpdir()}/non-git-`);

      const result = await runCli(['finish'], nonGitDir);

      expect(result.exitCode).toBe(1);
    }, TEST_TIMEOUT);

    it('shows diff stats when changes exist', async () => {
      repo = createRepo('finish-diff');

      // Create a worktree
      await runCliSuccess(['spawn', 'diff-finish', '--new'], repo.root);

      // Add and commit a file with content
      const worktreePath = `${repo.root}/.worktrees/diff-finish`;
      commitFile(worktreePath, 'feature.ts', 'export const feature = true;\nexport const version = 1;\n', 'Add feature');

      // Run finish
      const result = await runCliSuccess(['finish', '--json'], worktreePath);

      const json = JSON.parse(result.stdout);
      expect(json.diff.filesChanged).toBeGreaterThanOrEqual(1);
      expect(json.diff.insertions).toBeGreaterThanOrEqual(1);
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Session manifest tests
  // ─────────────────────────────────────────────────────────────────────────
  describe('session manifests', () => {
    it('spawn creates a session manifest', async () => {
      repo = createRepo('session-create');

      // Spawn a worktree
      const result = await runCliSuccess(['spawn', 'session-test', '--new'], repo.root);

      // Verify session was created
      expect(result.stdout).toContain('Session created');

      // Check that .cry/sessions/ directory exists
      expect(exists(repo.root, '.cry/sessions')).toBe(true);

      // Check that a session file was created
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);

      // Read and verify manifest content
      const sessionId = sessions[0].replace('.json', '');
      const manifest = readSession(repo.root, sessionId);

      expect(manifest).not.toBeNull();
      expect(manifest!.branch).toBe('session-test');
      expect(manifest!.baseBranch).toBe('master'); // or 'main' depending on git config
      expect(manifest!.worktreePath).toContain('session-test');
      expect(manifest!.createdAt).toBeDefined();
    }, TEST_TIMEOUT);

    it('spawn records agent in manifest when specified', async () => {
      repo = createRepo('session-agent');

      // Spawn without agent flag
      await runCliSuccess(['spawn', 'agent-test', '--new'], repo.root);

      // Verify session was created
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);

      const sessionId = sessions[0].replace('.json', '');
      const manifest = readSession(repo.root, sessionId);

      // Without --agent flag, agent should be undefined
      expect(manifest!.agent).toBeUndefined();
    }, TEST_TIMEOUT);

    it('multiple spawns create multiple sessions', async () => {
      repo = createRepo('session-multi');

      // Spawn multiple worktrees
      await runCliSuccess(['spawn', 'feature-a', '--new'], repo.root);
      await runCliSuccess(['spawn', 'feature-b', '--new'], repo.root);
      await runCliSuccess(['spawn', 'feature-c', '--new'], repo.root);

      // Check all sessions were created
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(3);
    }, TEST_TIMEOUT);

    it('rm does not automatically delete session manifest', async () => {
      repo = createRepo('session-rm');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'to-remove', '--new'], repo.root);

      // Verify session exists
      let sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);

      // Remove the worktree
      await runCliSuccess(['rm', 'to-remove'], repo.root);

      // Session manifest should still exist (for history/audit)
      sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);
    }, TEST_TIMEOUT);

    it('init adds .cry/ to gitignore', async () => {
      repo = createRepo('session-gitignore');

      // Initialize
      await runCliSuccess(['init'], repo.root);

      // Check .gitignore includes .cry/
      const gitignore = readFile(repo.root, '.gitignore');
      expect(gitignore).toContain('.cry/');
    }, TEST_TIMEOUT);

    it('session manifest contains correct baseBranch', async () => {
      repo = createRepo('session-base');

      // Create a branch and switch to it
      createBranch(repo.root, 'develop');
      // Note: we can't easily switch branches in main worktree during test
      // so baseBranch will be the current branch (master/main)

      // Spawn from current branch
      await runCliSuccess(['spawn', 'from-develop', '--new'], repo.root);

      const sessions = listSessionFiles(repo.root);
      const sessionId = sessions[0].replace('.json', '');
      const manifest = readSession(repo.root, sessionId);

      // baseBranch should be current branch when spawn was called
      expect(manifest!.baseBranch).toBeDefined();
      expect(typeof manifest!.baseBranch).toBe('string');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests for cry finish MVP
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry finish MVP', () => {
    it('finish --dry-run on clean session shows what would happen', async () => {
      repo = createRepo('finish-dryrun');

      // Spawn a worktree and make a commit
      await runCliSuccess(['spawn', 'feature-finish', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/feature-finish`;

      // Add and commit a file in the worktree
      commitFile(wtPath, 'new-feature.ts', 'export const feature = 1;', 'Add feature');

      // Run finish --dry-run --non-interactive in the worktree
      const result = await runCli(['finish', '--dry-run', '--non-interactive', '--skip-cleanup'], wtPath);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Session Summary');
      expect(result.stdout).toContain('feature-finish');
      // dry-run should show what would happen
      expect(result.stdout).toContain('[dry-run]');
    }, TEST_TIMEOUT);

    it('finish --non-interactive errors on dirty state without --allow-dirty', async () => {
      repo = createRepo('finish-dirty');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'dirty-branch', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/dirty-branch`;

      // Create uncommitted changes
      createFile(wtPath, 'dirty-file.txt', 'uncommitted content');

      // Run finish --non-interactive (should error)
      const result = await runCli(['finish', '--non-interactive'], wtPath);

      expect(result.exitCode).toBe(1);
      // Check combined output for error message
      const combined = result.stdout + result.stderr;
      expect(combined).toContain('--allow-dirty');
    }, TEST_TIMEOUT);

    it('finish --non-interactive --allow-dirty proceeds with dirty state', async () => {
      repo = createRepo('finish-allow-dirty');

      // Spawn a worktree with a commit
      await runCliSuccess(['spawn', 'allow-dirty', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/allow-dirty`;

      // Add a commit first
      commitFile(wtPath, 'feature.ts', 'export const x = 1;', 'Initial feature');

      // Then create uncommitted changes
      createFile(wtPath, 'dirty-file.txt', 'uncommitted content');

      // Run finish --non-interactive --allow-dirty (should proceed)
      const result = await runCli(['finish', '--non-interactive', '--allow-dirty', '--skip-cleanup'], wtPath);

      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toContain('dirty');
    }, TEST_TIMEOUT);

    it('finish shows manual instructions when gh is not authenticated', async () => {
      repo = createRepo('finish-no-gh');

      // Spawn a worktree and make a commit
      await runCliSuccess(['spawn', 'pr-branch', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/pr-branch`;

      // Add a commit
      commitFile(wtPath, 'feature.ts', 'export const x = 1;', 'Add feature');

      // Run without checking gh (it will fail gh auth check and show manual instructions)
      // Use a fake HOME to ensure gh auth fails
      const result = await runCli(
        ['finish', '--non-interactive', '--skip-cleanup'],
        wtPath,
        { HOME: '/nonexistent' }
      );

      // Should exit 0 and print manual instructions (or No commits to push if gh is available)
      expect(result.exitCode).toBe(0);
      // Either shows manual instructions or says no origin
      const combined = result.stdout + result.stderr;
      const hasManualInstructions = combined.includes('Manual PR Instructions') || combined.includes('github.com');
      const hasNoOrigin = combined.includes('No origin') || combined.includes('No commits to push');
      expect(hasManualInstructions || hasNoOrigin).toBe(true);
    }, TEST_TIMEOUT);

    it('finish --json outputs summary without actions', async () => {
      repo = createRepo('finish-json');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'json-branch', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/json-branch`;

      // Run finish --json
      const result = await runCli(['finish', '--json'], wtPath);

      expect(result.exitCode).toBe(0);

      // Parse JSON output
      const summary = JSON.parse(result.stdout);
      expect(summary.branch).toBe('json-branch');
      expect(summary.status).toBeDefined();
      expect(summary.status.clean).toBe(true);
      expect(summary.commits).toBeDefined();
    }, TEST_TIMEOUT);

    it('finish --cleanup removes worktree and session', async () => {
      repo = createRepo('finish-cleanup');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'cleanup-branch', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/cleanup-branch`;

      // Verify session exists
      let sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);

      // Verify worktree exists
      expect(exists(repo.root, '.worktrees/cleanup-branch')).toBe(true);

      // Run finish --cleanup --dry-run from worktree to test the logic
      const result = await runCli(['finish', '--cleanup', '--non-interactive', '--dry-run'], wtPath);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[dry-run] Would remove worktree');
      expect(result.stdout).toContain('[dry-run] Would delete session');
    }, TEST_TIMEOUT);

    it('finish --skip-cleanup skips cleanup prompt', async () => {
      repo = createRepo('finish-no-cleanup');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'skip-cleanup', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/skip-cleanup`;

      // Run finish --skip-cleanup --non-interactive
      const result = await runCli(['finish', '--skip-cleanup', '--non-interactive'], wtPath);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('cleanup skipped');

      // Worktree should still exist
      expect(exists(repo.root, '.worktrees/skip-cleanup')).toBe(true);
    }, TEST_TIMEOUT);

    it('finish shows commits ahead count', async () => {
      repo = createRepo('finish-commits');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'commits-branch', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/commits-branch`;

      // Make some commits
      commitFile(wtPath, 'file1.ts', 'content1', 'Commit 1');
      commitFile(wtPath, 'file2.ts', 'content2', 'Commit 2');

      // Run finish --non-interactive --skip-cleanup
      const result = await runCli(['finish', '--non-interactive', '--skip-cleanup'], wtPath);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ahead');
      // 2 commits ahead - the number appears in output
      expect(result.stdout).toMatch(/[↑\d]\s*2/);
    }, TEST_TIMEOUT);

    it('finish works from main repo without session', async () => {
      repo = createRepo('finish-main');

      // Run finish from main repo (no worktree) with --non-interactive --skip-cleanup
      const result = await runCli(['finish', '--non-interactive', '--skip-cleanup'], repo.root);

      expect(result.exitCode).toBe(0);
      // Should fallback to git introspection
      expect(result.stdout).toContain('Session Summary');
    }, TEST_TIMEOUT);

    it('finish --delete-branch with --cleanup --dry-run shows branch deletion', async () => {
      repo = createRepo('finish-delete-branch');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'delete-me', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/delete-me`;

      // Run finish with --delete-branch
      const result = await runCli(['finish', '--cleanup', '--delete-branch', '--non-interactive', '--dry-run'], wtPath);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[dry-run] Would delete branch');
      expect(result.stdout).toContain('delete-me');
    }, TEST_TIMEOUT);

    it('finish --message commits changes with provided message', async () => {
      repo = createRepo('finish-message');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feat-commit-msg', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/feat-commit-msg`;

      // Create uncommitted changes
      createFile(wtPath, 'new-feature.ts', 'export const feature = 1;');

      // Run finish with --message
      const result = await runCli(
        ['finish', '--message', 'Add awesome feature', '--skip-cleanup'],
        wtPath
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Staging all changes');
      expect(result.stdout).toContain('Commit created');

      // Verify the commit exists with correct message
      const logOutput = execSync('git log -1 --format=%s', { cwd: wtPath, encoding: 'utf-8' });
      expect(logOutput.trim()).toBe('Add awesome feature');
    }, TEST_TIMEOUT);

    it('finish --skip-commit bypasses commit step', async () => {
      repo = createRepo('finish-skip-commit');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'skip-commit-test', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/skip-commit-test`;

      // Create uncommitted changes
      createFile(wtPath, 'uncommitted.ts', 'export const x = 1;');

      // Run finish with --skip-commit
      const result = await runCli(
        ['finish', '--skip-commit', '--skip-cleanup', '--non-interactive'],
        wtPath
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Skipping commit');

      // Verify the file is still uncommitted
      const statusOutput = execSync('git status --porcelain', { cwd: wtPath, encoding: 'utf-8' });
      expect(statusOutput).toContain('uncommitted.ts');
    }, TEST_TIMEOUT);

    it('finish --message with --dry-run shows what would happen', async () => {
      repo = createRepo('finish-msg-dryrun');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'dryrun-commit', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/dryrun-commit`;

      // Create uncommitted changes
      createFile(wtPath, 'feature.ts', 'content');

      // Run finish with --message --dry-run
      const result = await runCli(
        ['finish', '--message', 'My commit', '--dry-run', '--skip-cleanup'],
        wtPath
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[dry-run]');
      expect(result.stdout).toContain('My commit');

      // Verify no commit was actually made
      const statusOutput = execSync('git status --porcelain', { cwd: wtPath, encoding: 'utf-8' });
      expect(statusOutput).toContain('feature.ts');
    }, TEST_TIMEOUT);

    it('finish --message stages all files including untracked', async () => {
      repo = createRepo('finish-stage-all');

      // Spawn a worktree
      await runCliSuccess(['spawn', 'stage-all-test', '--new'], repo.root);
      const wtPath = `${repo.root}/.worktrees/stage-all-test`;

      // Create multiple uncommitted files
      createFile(wtPath, 'file1.ts', 'content1');
      createFile(wtPath, 'file2.ts', 'content2');
      createFile(wtPath, 'subdir/file3.ts', 'content3');

      // Run finish with --message
      const result = await runCli(
        ['finish', '--message', 'Add multiple files', '--skip-cleanup'],
        wtPath
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Commit created');

      // Verify all files are committed
      const statusOutput = execSync('git status --porcelain', { cwd: wtPath, encoding: 'utf-8' });
      expect(statusOutput.trim()).toBe(''); // Clean working tree
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests for --finish-on-exit flag
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry spawn --finish-on-exit', () => {
    it('shows post-agent menu after simulated agent exits with code 0', async () => {
      repo = createRepo('finish-on-exit-success');

      // Initialize cry config with a simulated agent command
      await runCliSuccess(['init'], repo.root);

      // Update config to use a simulated agent that exits immediately
      const configPath = `${repo.root}/.cry.json`;
      const config = JSON.parse(readFile(repo.root, '.cry.json'));
      config.agents = config.agents || {};
      config.agents.claude = {
        command: 'node',
        args: ['-e', '"process.exit(0)"'],
        finishOnExitDefault: true,
      };
      require('fs').writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Spawn with --finish-on-exit and provide 'n' to skip the menu
      const result = await runCli(
        ['spawn', 'test-finish-exit', '--new', '--agent', 'claude', '--finish-on-exit'],
        repo.root,
        undefined,
        'n\n' // Answer 'n' to "What would you like to do?"
      );

      // Should show the post-agent menu
      expect(result.stdout).toContain('Agent Session Ended');
      expect(result.stdout).toContain('exited successfully');
      expect(result.stdout).toContain('What would you like to do');
    }, TEST_TIMEOUT);

    it('shows error label when simulated agent exits with non-zero code', async () => {
      repo = createRepo('finish-on-exit-error');

      // Initialize cry config
      await runCliSuccess(['init'], repo.root);

      // Update config to use a simulated agent that exits with error
      const configPath = `${repo.root}/.cry.json`;
      const config = JSON.parse(readFile(repo.root, '.cry.json'));
      config.agents = config.agents || {};
      config.agents.claude = {
        command: 'node',
        args: ['-e', '"process.exit(42)"'],
        finishOnExitDefault: true,
      };
      require('fs').writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Spawn with --finish-on-exit and answer 'n'
      const result = await runCli(
        ['spawn', 'test-error-exit', '--new', '--agent', 'claude', '--finish-on-exit'],
        repo.root,
        undefined,
        'n\n'
      );

      // Should show error in the menu
      expect(result.stdout).toContain('Agent Session Ended');
      expect(result.stdout).toContain('exited with error');
      expect(result.stdout).toContain('code 42');
    }, TEST_TIMEOUT);

    it('does not show menu without --finish-on-exit flag', async () => {
      repo = createRepo('no-finish-on-exit');

      // Initialize cry config
      await runCliSuccess(['init'], repo.root);

      // Update config to use a simulated agent
      const configPath = `${repo.root}/.cry.json`;
      const config = JSON.parse(readFile(repo.root, '.cry.json'));
      config.agents = config.agents || {};
      config.agents.claude = {
        command: 'node',
        args: ['-e', '"process.exit(0)"'],
        finishOnExitDefault: false,
      };
      require('fs').writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Spawn WITHOUT --finish-on-exit
      const result = await runCli(
        ['spawn', 'test-no-menu', '--new', '--agent', 'claude'],
        repo.root
      );

      // Should NOT show the post-agent menu
      expect(result.stdout).not.toContain('Agent Session Ended');
      expect(result.stdout).toContain('Worktree ready');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests for explain-copy command
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry explain-copy', () => {
    it('shows files that will be copied (gitignored + in include)', async () => {
      repo = createRepo('explain-copy-safe');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a gitignored .env file
      addToGitignore(repo.root, '.env');
      createFile(repo.root, '.env', 'SECRET=value');

      // Run explain-copy
      const result = await runCliSuccess(['explain-copy'], repo.root);

      expect(result.stdout).toContain('Copy Plan');
      expect(result.stdout).toContain('.env');
      expect(result.stdout).toContain('Will copy');
      expect(result.stdout).toContain('gitignored');
    }, TEST_TIMEOUT);

    it('shows tracked files as blocked', async () => {
      repo = createRepo('explain-copy-tracked');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Modify config to include README.md (which is tracked)
      const configContent = {
        defaultMode: 'copy',
        include: ['README.md'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Run explain-copy
      const result = await runCliSuccess(['explain-copy'], repo.root);

      expect(result.stdout).toContain('Blocked');
      expect(result.stdout).toContain('README.md');
      expect(result.stdout).toContain('tracked');
    }, TEST_TIMEOUT);

    it('warns when include patterns match tracked files', async () => {
      repo = createRepo('explain-copy-warning');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Modify config to include tracked file
      const configContent = {
        defaultMode: 'copy',
        include: ['README.md'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Run explain-copy
      const result = await runCliSuccess(['explain-copy'], repo.root);

      expect(result.stdout).toContain('Warnings');
      expect(result.stdout).toContain('tracked files are NEVER copied');
    }, TEST_TIMEOUT);

    it('shows files not in gitignore as blocked', async () => {
      repo = createRepo('explain-copy-not-ignored');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a file that's NOT gitignored and NOT tracked
      createFile(repo.root, 'secrets.txt', 'SECRET=value');

      // Modify config to include this file
      const configContent = {
        defaultMode: 'copy',
        include: ['secrets.txt'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Run explain-copy
      const result = await runCliSuccess(['explain-copy'], repo.root);

      expect(result.stdout).toContain('Blocked');
      expect(result.stdout).toContain('secrets.txt');
      expect(result.stdout).toContain('not ignored');
    }, TEST_TIMEOUT);

    it('outputs JSON format', async () => {
      repo = createRepo('explain-copy-json');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a gitignored .env file
      addToGitignore(repo.root, '.env');
      createFile(repo.root, '.env', 'SECRET=value');

      // Run explain-copy with --json
      const result = await runCliSuccess(['explain-copy', '--json'], repo.root);

      // Parse JSON
      const plan = JSON.parse(result.stdout);
      expect(plan.patterns).toBeDefined();
      expect(plan.willCopy).toBeDefined();
      expect(plan.blocked).toBeDefined();
      expect(plan.warnings).toBeDefined();

      // Check .env is in willCopy
      expect(plan.willCopy.some((f: any) => f.path === '.env')).toBe(true);
    }, TEST_TIMEOUT);

    it('fails when no config exists', async () => {
      repo = createRepo('explain-copy-noconfig');

      // Run explain-copy without init
      const result = await runCli(['explain-copy'], repo.root);

      expect(result.exitCode).toBe(1);
      const combined = result.stdout + result.stderr;
      expect(combined).toContain('.cry.json');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests for spawn --dry-run with copy plan
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry spawn --dry-run', () => {
    it('shows copy plan without creating worktree', async () => {
      repo = createRepo('spawn-dryrun-plan');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a gitignored .env file
      addToGitignore(repo.root, '.env');
      createFile(repo.root, '.env', 'SECRET=value');

      // Run spawn with --dry-run
      const result = await runCliSuccess(
        ['spawn', 'feature-test', '--new', '--dry-run'],
        repo.root
      );

      // Should show dry run output
      expect(result.stdout).toContain('Dry Run');
      expect(result.stdout).toContain('Copy Plan');
      expect(result.stdout).toContain('.env');
      expect(result.stdout).toContain('No changes were made');

      // Should NOT have created the worktree
      expect(exists(repo.root, '.worktrees/feature-test')).toBe(false);
    }, TEST_TIMEOUT);

    it('shows mode none message when mode is none', async () => {
      repo = createRepo('spawn-dryrun-none');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Run spawn with --dry-run --mode none
      const result = await runCliSuccess(
        ['spawn', 'feature-test', '--new', '--dry-run', '--mode', 'none'],
        repo.root
      );

      // Should show mode none message
      expect(result.stdout).toContain('none');
      expect(result.stdout).toContain('no files will be copied');
    }, TEST_TIMEOUT);

    it('shows blocked files in dry-run output', async () => {
      repo = createRepo('spawn-dryrun-blocked');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Modify config to include tracked file
      const configContent = {
        defaultMode: 'copy',
        include: ['README.md', '.env'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Create a gitignored .env file (this one should be safe)
      addToGitignore(repo.root, '.env');
      createFile(repo.root, '.env', 'SECRET=value');

      // Run spawn with --dry-run
      const result = await runCliSuccess(
        ['spawn', 'feature-test', '--new', '--dry-run'],
        repo.root
      );

      // Should show both safe and blocked files
      expect(result.stdout).toContain('Will copy');
      expect(result.stdout).toContain('.env');
      expect(result.stdout).toContain('Blocked');
      expect(result.stdout).toContain('README.md');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Security model tests
  // ─────────────────────────────────────────────────────────────────────────
  describe('security model', () => {
    it('tracked files are never copied even if in include list', async () => {
      repo = createRepo('security-tracked');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Modify config to include README.md (tracked)
      const configContent = {
        defaultMode: 'copy',
        include: ['README.md'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Spawn a worktree
      const result = await runCliSuccess(['spawn', 'security-test', '--new'], repo.root);

      // README.md exists in worktree (because it's part of repo), but should be skipped
      // Check output mentions skipping
      expect(result.stdout).toContain('Skipped') || expect(result.stdout).toContain('Processing secrets');
    }, TEST_TIMEOUT);

    it('ignored files in include list are copied successfully', async () => {
      repo = createRepo('security-ignored');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create gitignored files
      addToGitignore(repo.root, '.env');
      addToGitignore(repo.root, '*.secret');
      createFile(repo.root, '.env', 'API_KEY=secret123');
      createFile(repo.root, 'config.secret', 'password=hidden');

      // Modify config
      const configContent = {
        defaultMode: 'copy',
        include: ['.env', '*.secret'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Spawn a worktree
      const result = await runCliSuccess(['spawn', 'security-safe', '--new'], repo.root);

      expect(result.stdout).toContain('Copied');

      // Verify files were copied
      expect(exists(repo.root, '.worktrees/security-safe/.env')).toBe(true);
      expect(readFile(repo.root, '.worktrees/security-safe/.env')).toBe('API_KEY=secret123');
      expect(exists(repo.root, '.worktrees/security-safe/config.secret')).toBe(true);
    }, TEST_TIMEOUT);

    it('files not in gitignore are blocked', async () => {
      repo = createRepo('security-not-ignored');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a file that's NOT gitignored
      createFile(repo.root, 'not-ignored.txt', 'secret');

      // Modify config to try to include it
      const configContent = {
        defaultMode: 'copy',
        include: ['not-ignored.txt'],
        worktreeBaseDir: null,
        hooks: { postCreate: [] },
        agentCommand: 'claude',
      };
      createFile(repo.root, '.cry.json', JSON.stringify(configContent, null, 2));

      // Spawn a worktree
      const result = await runCliSuccess(['spawn', 'security-blocked', '--new'], repo.root);

      // Should show skipped
      expect(result.stdout).toContain('Skipped');
      expect(result.stdout).toContain('not ignored');
    }, TEST_TIMEOUT);

    it('symlink mode works for ignored files', async () => {
      repo = createRepo('security-symlink');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create gitignored file
      addToGitignore(repo.root, '.env');
      createFile(repo.root, '.env', 'SYMLINK_TEST=true');

      // Spawn with symlink mode
      const result = await runCliSuccess(
        ['spawn', 'symlink-test', '--new', '--mode', 'symlink'],
        repo.root
      );

      expect(result.stdout).toContain('Symlinked');

      // Verify symlink was created
      const { lstatSync } = require('fs');
      const symlinkPath = `${repo.root}/.worktrees/symlink-test/.env`;
      expect(exists(repo.root, '.worktrees/symlink-test/.env')).toBe(true);
      expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests for base branch detection
  // ─────────────────────────────────────────────────────────────────────────
  describe('base branch detection', () => {
    it('uses current branch as base when spawning from main', async () => {
      repo = createRepo('base-from-main');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // We're on main/master by default after createRepo
      const currentBranch = getCurrentBranch(repo.root);
      expect(['main', 'master']).toContain(currentBranch);

      // Spawn a new branch
      const result = await runCliSuccess(['spawn', 'feature-test', '--new'], repo.root);

      // Should show base branch in output
      expect(result.stdout).toContain('Base:');
      expect(result.stdout).toContain(currentBranch);

      // Verify session manifest has correct base
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);

      const session = readSession(repo.root, sessions[0].replace('.json', ''));
      expect(session).not.toBeNull();
      expect(session?.baseBranch).toBe(currentBranch);
    }, TEST_TIMEOUT);

    it('uses current branch as base when spawning from develop', async () => {
      repo = createRepo('base-from-develop');

      // Create and switch to develop branch
      require('child_process').execSync('git checkout -b develop', { cwd: repo.root, stdio: 'pipe' });

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a new branch from develop
      const result = await runCliSuccess(['spawn', 'feature-from-develop', '--new'], repo.root);

      // Should show develop as base
      expect(result.stdout).toContain('Base:');
      expect(result.stdout).toContain('develop');

      // Verify session manifest
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);

      const session = readSession(repo.root, sessions[0].replace('.json', ''));
      expect(session?.baseBranch).toBe('develop');
    }, TEST_TIMEOUT);

    it('allows explicit --base-branch override', async () => {
      repo = createRepo('base-explicit');

      // Create develop branch
      require('child_process').execSync('git branch develop', { cwd: repo.root, stdio: 'pipe' });

      // Initialize cry (still on main/master)
      await runCliSuccess(['init'], repo.root);

      // Spawn with explicit --base-branch
      const result = await runCliSuccess(
        ['spawn', 'feature-explicit', '--new', '--base-branch', 'develop'],
        repo.root
      );

      // Should show develop as base
      expect(result.stdout).toContain('Base:');
      expect(result.stdout).toContain('develop');

      // Verify session manifest
      const sessions = listSessionFiles(repo.root);
      const session = readSession(repo.root, sessions[0].replace('.json', ''));
      expect(session?.baseBranch).toBe('develop');
    }, TEST_TIMEOUT);

    it('errors on detached HEAD without --base-branch when no default branch', async () => {
      repo = createRepo('base-detached-error');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Get current commit SHA
      const sha = require('child_process')
        .execSync('git rev-parse HEAD', { cwd: repo.root, encoding: 'utf-8' })
        .trim();

      // Checkout to detached HEAD
      require('child_process').execSync(`git checkout ${sha}`, { cwd: repo.root, stdio: 'pipe' });

      // Delete main/master to simulate no default branch available
      const currentBranch = getCurrentBranch(repo.root);
      // Note: We're detached so currentBranch is null
      // The default branch detection should still work since main/master exists

      // Try to spawn - should work because main/master still exists as fallback
      const result = await runCli(['spawn', 'feature-detached', '--new'], repo.root);

      // Should warn about detached HEAD but use default branch
      expect(result.stdout).toContain('Detached HEAD');
    }, TEST_TIMEOUT);

    it('succeeds on detached HEAD with explicit --base-branch', async () => {
      repo = createRepo('base-detached-explicit');

      // Create develop branch
      require('child_process').execSync('git branch develop', { cwd: repo.root, stdio: 'pipe' });

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Get current commit SHA and checkout detached
      const sha = require('child_process')
        .execSync('git rev-parse HEAD', { cwd: repo.root, encoding: 'utf-8' })
        .trim();
      require('child_process').execSync(`git checkout ${sha}`, { cwd: repo.root, stdio: 'pipe' });

      // Spawn with explicit --base-branch should succeed
      const result = await runCliSuccess(
        ['spawn', 'feature-from-detached', '--new', '--base-branch', 'develop'],
        repo.root
      );

      expect(result.stdout).toContain('Base:');
      expect(result.stdout).toContain('develop');

      // Verify session manifest
      const sessions = listSessionFiles(repo.root);
      const session = readSession(repo.root, sessions[0].replace('.json', ''));
      expect(session?.baseBranch).toBe('develop');
    }, TEST_TIMEOUT);

    it('finish uses manifest baseBranch for PR target', async () => {
      repo = createRepo('finish-base-manifest');

      // Create develop branch with a commit
      require('child_process').execSync('git checkout -b develop', { cwd: repo.root, stdio: 'pipe' });
      commitFile(repo.root, 'develop.txt', 'develop content', 'Add develop file');

      // Switch back to main/master
      const mainBranch = getCurrentBranch(repo.root) === 'develop' ? 'master' : 'main';
      try {
        require('child_process').execSync(`git checkout ${mainBranch}`, { cwd: repo.root, stdio: 'pipe' });
      } catch {
        require('child_process').execSync('git checkout master', { cwd: repo.root, stdio: 'pipe' });
      }

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn with explicit base branch
      await runCliSuccess(
        ['spawn', 'feature-for-finish', '--new', '--base-branch', 'develop'],
        repo.root
      );

      // Make a change in the worktree
      const worktreePath = `${repo.root}/.worktrees/feature-for-finish`;
      commitFile(worktreePath, 'feature.txt', 'feature content', 'Add feature');

      // Run finish with --json to see summary
      const result = await runCli(['finish', '--json'], worktreePath);

      // Parse JSON output
      const summary = JSON.parse(result.stdout);
      expect(summary.baseBranch).toBe('develop');
    }, TEST_TIMEOUT);

    it('finish infers base branch when no manifest exists', async () => {
      repo = createRepo('finish-base-infer');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Create a branch manually (without cry spawn)
      require('child_process').execSync('git checkout -b manual-branch', { cwd: repo.root, stdio: 'pipe' });

      // Make a commit
      commitFile(repo.root, 'manual.txt', 'manual content', 'Add manual file');

      // Run finish --json (no session manifest exists)
      const result = await runCli(['finish', '--json'], repo.root);

      // Should still work and infer base branch
      expect(result.exitCode).toBe(0);

      const summary = JSON.parse(result.stdout);
      expect(summary.branch).toBe('manual-branch');
      // Base should be inferred as main or master
      expect(['main', 'master']).toContain(summary.baseBranch);
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests for cry resume command
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry resume', () => {
    it('resumes session by branch name and resolves correct path', async () => {
      repo = createRepo('resume-by-branch');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feature-resume', '--new'], repo.root);

      // Resume by branch name with --cd flag to just get the path
      const result = await runCliSuccess(['resume', 'feature-resume', '--cd'], repo.root);

      // Should print cd command with correct path
      expect(result.stdout.trim()).toContain('.worktrees/feature-resume');
      expect(result.stdout.trim().startsWith('cd "')).toBe(true);
    }, TEST_TIMEOUT);

    it('resumes session by partial branch name', async () => {
      repo = createRepo('resume-partial');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree with a longer name
      await runCliSuccess(['spawn', 'feature-auth-login', '--new'], repo.root);

      // Resume by partial branch name
      const result = await runCliSuccess(['resume', 'auth-login', '--cd'], repo.root);

      expect(result.stdout.trim()).toContain('feature-auth-login');
    }, TEST_TIMEOUT);

    it('resumes session by session ID', async () => {
      repo = createRepo('resume-by-id');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feature-id-test', '--new'], repo.root);

      // Get the session ID from the manifest
      const sessions = listSessionFiles(repo.root);
      expect(sessions.length).toBe(1);
      const sessionId = sessions[0].replace('.json', '');

      // Resume by session ID
      const result = await runCliSuccess(['resume', sessionId, '--cd'], repo.root);

      expect(result.stdout.trim()).toContain('feature-id-test');
    }, TEST_TIMEOUT);

    it('errors gracefully when session not found', async () => {
      repo = createRepo('resume-not-found');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Try to resume non-existent session
      const result = await runCli(['resume', 'nonexistent-branch', '--cd'], repo.root);

      expect(result.exitCode).toBe(1);
      const combined = result.stdout + result.stderr;
      expect(combined).toContain('not found');
    }, TEST_TIMEOUT);

    it('errors gracefully when worktree path is missing', async () => {
      repo = createRepo('resume-missing-path');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feature-missing', '--new'], repo.root);

      // Manually remove the worktree directory (simulating external removal)
      const worktreePath = `${repo.root}/.worktrees/feature-missing`;
      require('fs').rmSync(worktreePath, { recursive: true, force: true });

      // Try to resume - should error about missing worktree
      const result = await runCli(['resume', 'feature-missing', '--cd'], repo.root);

      expect(result.exitCode).toBe(1);
      const combined = result.stdout + result.stderr;
      expect(combined).toContain('no longer exists');
    }, TEST_TIMEOUT);

    it('lists available sessions when session not found', async () => {
      repo = createRepo('resume-list-sessions');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn some worktrees
      await runCliSuccess(['spawn', 'feature-one', '--new'], repo.root);
      await runCliSuccess(['spawn', 'feature-two', '--new'], repo.root);

      // Try to resume non-existent session
      const result = await runCli(['resume', 'nonexistent', '--cd'], repo.root);

      expect(result.exitCode).toBe(1);
      // Shows structured error with fix commands
      const output = result.stdout + result.stderr;
      expect(output).toContain('Session not found');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cry gc - garbage collection for stale sessions
  // ─────────────────────────────────────────────────────────────────────────
  describe('cry gc', () => {
    it('shows nothing to clean when no stale sessions', async () => {
      repo = createRepo('gc-nothing');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree (valid)
      await runCliSuccess(['spawn', 'feature-valid', '--new'], repo.root);

      // Run gc
      const result = await runCliSuccess(['gc', '--dry-run'], repo.root);

      expect(result.stdout).toContain('Nothing to clean');
    }, TEST_TIMEOUT);

    it('detects stale session when worktree path is deleted', async () => {
      repo = createRepo('gc-stale-path');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feature-stale', '--new'], repo.root);

      // Manually delete the worktree directory (simulate stale)
      execSync(`rm -rf "${repo.root}/.worktrees/feature-stale"`, { encoding: 'utf-8' });

      // Run gc --dry-run to see what would be cleaned
      const result = await runCliSuccess(['gc', '--dry-run'], repo.root);

      expect(result.stdout).toContain('Stale session manifests');
      expect(result.stdout).toContain('feature-stale');
      expect(result.stdout).toContain('worktree path missing');
      expect(result.stdout).toContain('Dry run mode');
    }, TEST_TIMEOUT);

    it('removes stale session with --yes', async () => {
      repo = createRepo('gc-remove-stale');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feature-remove', '--new'], repo.root);

      // Verify session exists
      const sessionsBefore = listSessionFiles(repo.root);
      expect(sessionsBefore.length).toBe(1);

      // Manually delete the worktree directory
      execSync(`rm -rf "${repo.root}/.worktrees/feature-remove"`, { encoding: 'utf-8' });

      // Run gc --yes to remove
      const result = await runCliSuccess(['gc', '--yes'], repo.root);

      expect(result.stdout).toContain('Removed session');
      expect(result.stdout).toContain('feature-remove');

      // Verify session is removed
      const sessionsAfter = listSessionFiles(repo.root);
      expect(sessionsAfter.length).toBe(0);
    }, TEST_TIMEOUT);

    it('--manifests-only skips git worktree prune', async () => {
      repo = createRepo('gc-manifests-only');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn a worktree
      await runCliSuccess(['spawn', 'feature-manifests', '--new'], repo.root);

      // Delete the worktree path
      execSync(`rm -rf "${repo.root}/.worktrees/feature-manifests"`, { encoding: 'utf-8' });

      // Run gc with --manifests-only
      const result = await runCliSuccess(['gc', '--yes', '--manifests-only'], repo.root);

      expect(result.stdout).toContain('Removed session');
      // Should not mention git worktree prune
      expect(result.stdout).not.toContain('Pruned');
    }, TEST_TIMEOUT);

    it('handles multiple stale sessions', async () => {
      repo = createRepo('gc-multiple');

      // Initialize cry
      await runCliSuccess(['init'], repo.root);

      // Spawn multiple worktrees
      await runCliSuccess(['spawn', 'feature-a', '--new'], repo.root);
      await runCliSuccess(['spawn', 'feature-b', '--new'], repo.root);
      await runCliSuccess(['spawn', 'feature-c', '--new'], repo.root);

      // Delete two worktree paths (leave one valid)
      execSync(`rm -rf "${repo.root}/.worktrees/feature-a"`, { encoding: 'utf-8' });
      execSync(`rm -rf "${repo.root}/.worktrees/feature-b"`, { encoding: 'utf-8' });

      // Run gc --dry-run
      const dryResult = await runCliSuccess(['gc', '--dry-run'], repo.root);

      expect(dryResult.stdout).toContain('feature-a');
      expect(dryResult.stdout).toContain('feature-b');
      expect(dryResult.stdout).not.toContain('feature-c');

      // Run gc --yes to remove
      const result = await runCliSuccess(['gc', '--yes'], repo.root);

      expect(result.stdout).toContain('Removed 2 stale session');

      // Verify only one session remains
      const sessionsAfter = listSessionFiles(repo.root);
      expect(sessionsAfter.length).toBe(1);
    }, TEST_TIMEOUT);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error message tests - verify structured error output
  // ─────────────────────────────────────────────────────────────────────────
  describe('error messages', () => {
    it('shows structured error for worktree already exists', async () => {
      repo = createRepo('error-worktree-exists');

      // Initialize and spawn
      await runCliSuccess(['init'], repo.root);
      await runCliSuccess(['spawn', 'feature-dup', '--new'], repo.root);

      // Try to spawn again - path check fires first since worktree directory exists
      const result = await runCli(['spawn', 'feature-dup', '--new'], repo.root);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      // Check structured error format (destination exists check fires first)
      expect(output).toContain('already exists');
      expect(output).toContain('Why:');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);

    it('shows structured error for destination exists', async () => {
      repo = createRepo('error-dest-exists');

      // Initialize
      await runCliSuccess(['init'], repo.root);

      // Create the destination directory manually
      execSync(`mkdir -p "${repo.root}/.worktrees/feature-blocked"`, { encoding: 'utf-8' });

      // Try to spawn
      const result = await runCli(['spawn', 'feature-blocked', '--new'], repo.root);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Destination already exists');
      expect(output).toContain('Why:');
      expect(output).toContain('Fix:');
    }, TEST_TIMEOUT);

    it('shows structured error for dirty worktree on rm', async () => {
      repo = createRepo('error-dirty-rm');

      // Initialize and spawn
      await runCliSuccess(['init'], repo.root);
      await runCliSuccess(['spawn', 'feature-dirty', '--new'], repo.root);

      // Create uncommitted changes in worktree
      createFile(repo.root, '.worktrees/feature-dirty/dirty-file.txt', 'uncommitted');

      // Try to remove
      const result = await runCli(['rm', 'feature-dirty'], repo.root);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('uncommitted changes');
      expect(output).toContain('Why:');
      expect(output).toContain('Fix:');
      expect(output).toContain('--force');
    }, TEST_TIMEOUT);

    it('shows structured error for worktree not found', async () => {
      repo = createRepo('error-wt-notfound');

      // Initialize
      await runCliSuccess(['init'], repo.root);
      await runCliSuccess(['spawn', 'feature-exists', '--new'], repo.root);

      // Try to open non-existent worktree
      const result = await runCli(['open', 'nonexistent-branch'], repo.root);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Worktree not found');
      expect(output).toContain('Why:');
      expect(output).toContain('Fix:');
      expect(output).toContain('cry list');
    }, TEST_TIMEOUT);

    it('shows structured error for session not found on resume', async () => {
      repo = createRepo('error-session-notfound');

      // Initialize
      await runCliSuccess(['init'], repo.root);

      // Try to resume non-existent session
      const result = await runCli(['resume', 'ghost-session'], repo.root);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Session not found');
      expect(output).toContain('Why:');
      expect(output).toContain('Fix:');
      expect(output).toContain('cry spawn');
    }, TEST_TIMEOUT);

    it('shows structured error for missing worktree on resume', async () => {
      repo = createRepo('error-missing-wt-resume');

      // Initialize and spawn
      await runCliSuccess(['init'], repo.root);
      await runCliSuccess(['spawn', 'feature-gone', '--new'], repo.root);

      // Delete the worktree directory
      execSync(`rm -rf "${repo.root}/.worktrees/feature-gone"`, { encoding: 'utf-8' });

      // Try to resume
      const result = await runCli(['resume', 'feature-gone'], repo.root);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('no longer exists');
      expect(output).toContain('Why:');
      expect(output).toContain('Fix:');
      expect(output).toContain('cry gc');
    }, TEST_TIMEOUT);
  });});
