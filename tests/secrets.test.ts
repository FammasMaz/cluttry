/**
 * Unit tests for secrets/file safety module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkFileSafety } from '../src/lib/secrets.js';
import * as fs from 'node:fs';
import * as git from '../src/lib/git.js';

// Mock the modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  symlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../src/lib/git.js', () => ({
  isTracked: vi.fn(),
  isIgnored: vi.fn(),
}));

describe('checkFileSafety', () => {
  const repoRoot = '/home/user/myrepo';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns unsafe result when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = checkFileSafety('.env', repoRoot);

    expect(result.safe).toBe(false);
    expect(result.exists).toBe(false);
    expect(result.reason).toBe('File does not exist');
  });

  it('returns unsafe result when file is tracked by git', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(true);

    const result = checkFileSafety('.env', repoRoot);

    expect(result.safe).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.isTracked).toBe(true);
    expect(result.reason).toBe('File is tracked by git (would be committed)');
  });

  it('returns unsafe result when file is not ignored by git', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(false);
    vi.mocked(git.isIgnored).mockReturnValue(false);

    const result = checkFileSafety('.env', repoRoot);

    expect(result.safe).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.isTracked).toBe(false);
    expect(result.isIgnored).toBe(false);
    expect(result.reason).toBe('File is not ignored by git (could be accidentally committed)');
  });

  it('returns safe result when file exists, is not tracked, and is ignored', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(false);
    vi.mocked(git.isIgnored).mockReturnValue(true);

    const result = checkFileSafety('.env', repoRoot);

    expect(result.safe).toBe(true);
    expect(result.exists).toBe(true);
    expect(result.isTracked).toBe(false);
    expect(result.isIgnored).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('handles absolute paths correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(false);
    vi.mocked(git.isIgnored).mockReturnValue(true);

    const result = checkFileSafety('/home/user/myrepo/.env', repoRoot);

    expect(result.path).toBe('.env');
    expect(result.safe).toBe(true);
  });

  it('handles nested paths correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(false);
    vi.mocked(git.isIgnored).mockReturnValue(true);

    const result = checkFileSafety('config/secrets/oauth.json', repoRoot);

    expect(result.path).toBe('config/secrets/oauth.json');
    expect(result.safe).toBe(true);
  });
});

describe('safety enforcement rules', () => {
  const repoRoot = '/home/user/myrepo';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('NEVER allows tracked files to be copied/symlinked', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(true);
    vi.mocked(git.isIgnored).mockReturnValue(false); // Even if somehow ignored

    const result = checkFileSafety('src/config.ts', repoRoot);

    expect(result.safe).toBe(false);
    expect(result.reason).toContain('tracked');
  });

  it('ONLY allows files that are explicitly ignored', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(false);
    vi.mocked(git.isIgnored).mockReturnValue(false);

    const result = checkFileSafety('random-file.txt', repoRoot);

    expect(result.safe).toBe(false);
    expect(result.reason).toContain('not ignored');
  });

  it('correctly identifies safe secret files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(git.isTracked).mockReturnValue(false);
    vi.mocked(git.isIgnored).mockReturnValue(true);

    const secretFiles = ['.env', '.env.local', 'config/oauth.json', '.secrets/api-key'];

    for (const file of secretFiles) {
      const result = checkFileSafety(file, repoRoot);
      expect(result.safe).toBe(true);
    }
  });
});
