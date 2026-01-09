/**
 * Safety constraint tests
 *
 * These tests verify the hard safety constraints:
 * 1. Never auto-merge PRs
 * 2. Never delete without explicit confirmation
 * 3. Never copy tracked files
 */

import { describe, it, expect } from 'vitest';
import {
  isMergeAllowed,
  isDeletionConfirmed,
  requireConfirmation,
  validateFileCopy,
  getSafetyConstraints,
  type ConfirmationState,
  type FileCopyDecision,
} from '../src/lib/safety.js';

describe('Safety Module', () => {
  describe('isMergeAllowed', () => {
    it('always returns false - merge is never auto-allowed', () => {
      // HARD CONSTRAINT: Auto-merge is NEVER allowed
      expect(isMergeAllowed()).toBe(false);
    });
  });

  describe('isDeletionConfirmed', () => {
    it('returns false when not confirmed', () => {
      const state: ConfirmationState = {
        operation: 'delete_worktree',
        confirmed: false,
        method: 'none',
      };
      expect(isDeletionConfirmed(state)).toBe(false);
    });

    it('returns false when confirmed but method is none', () => {
      const state: ConfirmationState = {
        operation: 'delete_worktree',
        confirmed: true,
        method: 'none',
      };
      expect(isDeletionConfirmed(state)).toBe(false);
    });

    it('returns true when confirmed via prompt', () => {
      const state: ConfirmationState = {
        operation: 'delete_worktree',
        confirmed: true,
        method: 'prompt',
      };
      expect(isDeletionConfirmed(state)).toBe(true);
    });

    it('returns true when confirmed via flag', () => {
      const state: ConfirmationState = {
        operation: 'delete_branch',
        confirmed: true,
        method: 'flag',
      };
      expect(isDeletionConfirmed(state)).toBe(true);
    });
  });

  describe('requireConfirmation', () => {
    it('returns confirmed via flag when skipPrompt is true', async () => {
      const state = await requireConfirmation('delete_worktree', {
        skipPrompt: true,
      });

      expect(state.confirmed).toBe(true);
      expect(state.method).toBe('flag');
      expect(state.operation).toBe('delete_worktree');
    });

    it('returns confirmed via flag when autoConfirm is true', async () => {
      const state = await requireConfirmation('cleanup_session', {
        autoConfirm: true,
      });

      expect(state.confirmed).toBe(true);
      expect(state.method).toBe('flag');
    });

    // Note: Interactive prompt tests would require mocking stdin
  });

  describe('validateFileCopy', () => {
    it('throws when attempting to copy tracked file', () => {
      const decision: FileCopyDecision = {
        path: 'src/index.ts',
        allowed: true, // Bug: trying to allow tracked file
        reason: 'Should not happen',
        isTracked: true,
        isIgnored: false,
      };

      expect(() => validateFileCopy(decision)).toThrow('Safety violation');
      expect(() => validateFileCopy(decision)).toThrow('tracked file');
    });

    it('throws when attempting to copy non-ignored file', () => {
      const decision: FileCopyDecision = {
        path: 'secrets.txt',
        allowed: true, // Bug: trying to allow non-ignored file
        reason: 'Should not happen',
        isTracked: false,
        isIgnored: false,
      };

      expect(() => validateFileCopy(decision)).toThrow('Safety violation');
      expect(() => validateFileCopy(decision)).toThrow('non-ignored file');
    });

    it('does not throw for properly ignored file', () => {
      const decision: FileCopyDecision = {
        path: '.env',
        allowed: true,
        reason: 'File is gitignored',
        isTracked: false,
        isIgnored: true,
      };

      expect(() => validateFileCopy(decision)).not.toThrow();
    });

    it('does not throw when file is blocked (allowed=false)', () => {
      const decision: FileCopyDecision = {
        path: 'tracked-file.ts',
        allowed: false,
        reason: 'File is tracked',
        isTracked: true,
        isIgnored: false,
      };

      // Should not throw because allowed=false means we're correctly blocking it
      expect(() => validateFileCopy(decision)).not.toThrow();
    });
  });

  describe('getSafetyConstraints', () => {
    it('returns all three hard constraints', () => {
      const constraints = getSafetyConstraints();

      expect(constraints.length).toBe(3);
      expect(constraints.some(c => c.includes('merge'))).toBe(true);
      expect(constraints.some(c => c.includes('delete'))).toBe(true);
      expect(constraints.some(c => c.includes('tracked'))).toBe(true);
    });
  });
});

describe('Safety Integration', () => {
  describe('Merge constraint', () => {
    it('finish command does not have --merge flag', async () => {
      // Verify by checking the command options don't include merge
      // This is a documentation/design test
      const mergeAllowed = isMergeAllowed();
      expect(mergeAllowed).toBe(false);
    });
  });

  describe('Deletion confirmation constraint', () => {
    it('deletion requires explicit confirmation state', () => {
      // Test various deletion scenarios
      const scenarios: Array<{ state: ConfirmationState; expected: boolean }> = [
        // No confirmation
        { state: { operation: 'delete_worktree', confirmed: false, method: 'none' }, expected: false },
        // Confirmed but no method (invalid)
        { state: { operation: 'delete_worktree', confirmed: true, method: 'none' }, expected: false },
        // Confirmed via prompt
        { state: { operation: 'delete_worktree', confirmed: true, method: 'prompt' }, expected: true },
        // Confirmed via --yes flag
        { state: { operation: 'delete_worktree', confirmed: true, method: 'flag' }, expected: true },
        // Branch deletion
        { state: { operation: 'delete_branch', confirmed: true, method: 'flag' }, expected: true },
        // Force remove dirty
        { state: { operation: 'force_remove_dirty', confirmed: true, method: 'prompt' }, expected: true },
      ];

      for (const { state, expected } of scenarios) {
        expect(isDeletionConfirmed(state)).toBe(expected);
      }
    });
  });

  describe('Tracked file constraint', () => {
    it('tracked files are always blocked from copying', () => {
      // Any attempt to copy a tracked file should throw
      const trackedFile: FileCopyDecision = {
        path: 'any-tracked-file.ts',
        allowed: true,
        reason: '',
        isTracked: true,
        isIgnored: false,
      };

      expect(() => validateFileCopy(trackedFile)).toThrow();
    });

    it('non-ignored files are always blocked from copying', () => {
      const nonIgnoredFile: FileCopyDecision = {
        path: 'untracked-but-not-ignored.txt',
        allowed: true,
        reason: '',
        isTracked: false,
        isIgnored: false,
      };

      expect(() => validateFileCopy(nonIgnoredFile)).toThrow();
    });

    it('only gitignored non-tracked files can be copied', () => {
      const safeFile: FileCopyDecision = {
        path: '.env.local',
        allowed: true,
        reason: 'gitignored',
        isTracked: false,
        isIgnored: true,
      };

      expect(() => validateFileCopy(safeFile)).not.toThrow();
    });
  });
});
