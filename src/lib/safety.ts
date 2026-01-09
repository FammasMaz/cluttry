/**
 * Safety module for dangerous operations
 *
 * This module enforces hard safety constraints:
 * 1. Never auto-merge PRs
 * 2. Never delete branches/worktrees without explicit confirmation
 * 3. Never copy tracked files to worktrees
 *
 * All dangerous operations must go through this module.
 */

import * as readline from 'node:readline';

/**
 * Types of dangerous operations
 */
export type DangerousOperation =
  | 'delete_worktree'
  | 'delete_branch'
  | 'force_remove_dirty'
  | 'cleanup_session'
  | 'merge_pr';

/**
 * Confirmation state for dangerous operations
 */
export interface ConfirmationState {
  operation: DangerousOperation;
  confirmed: boolean;
  method: 'prompt' | 'flag' | 'none';
}

/**
 * HARD CONSTRAINT: Merge is never allowed by default
 * This function always returns false - merge must be done manually
 */
export function isMergeAllowed(): boolean {
  // SAFETY: Auto-merge is NEVER allowed
  // Users must merge PRs manually through GitHub UI
  return false;
}

/**
 * HARD CONSTRAINT: Check if deletion is explicitly confirmed
 *
 * Deletion requires EITHER:
 * - Interactive confirmation (user typed 'y')
 * - Explicit --yes flag
 * - Explicit --cleanup flag (for finish command)
 */
export function isDeletionConfirmed(state: ConfirmationState): boolean {
  if (!state.confirmed) {
    return false;
  }

  // Must have explicit confirmation method
  if (state.method === 'none') {
    return false;
  }

  return true;
}

/**
 * Require explicit confirmation for a dangerous operation
 *
 * @param operation - Type of dangerous operation
 * @param options - Confirmation options
 * @returns ConfirmationState with confirmed status
 */
export async function requireConfirmation(
  operation: DangerousOperation,
  options: {
    skipPrompt?: boolean;  // --yes flag
    autoConfirm?: boolean; // --cleanup flag
    message?: string;
  }
): Promise<ConfirmationState> {
  // If --yes or --cleanup flag provided, treat as confirmed via flag
  if (options.skipPrompt || options.autoConfirm) {
    return {
      operation,
      confirmed: true,
      method: 'flag',
    };
  }

  // Otherwise, require interactive prompt
  const message = options.message ?? getDefaultMessage(operation);
  const confirmed = await promptConfirmation(message);

  return {
    operation,
    confirmed,
    method: confirmed ? 'prompt' : 'none',
  };
}

/**
 * Interactive confirmation prompt
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Get default confirmation message for an operation
 */
function getDefaultMessage(operation: DangerousOperation): string {
  switch (operation) {
    case 'delete_worktree':
      return 'Remove worktree?';
    case 'delete_branch':
      return 'Delete branch?';
    case 'force_remove_dirty':
      return 'Worktree has uncommitted changes. Remove anyway?';
    case 'cleanup_session':
      return 'Clean up session (remove worktree)?';
    case 'merge_pr':
      // This should never be called - merge is not allowed
      return 'Merge is not supported. Please merge manually.';
  }
}

/**
 * Assert that a dangerous operation was properly confirmed
 * Throws if not confirmed - use this as a guard
 */
export function assertConfirmed(state: ConfirmationState): void {
  if (!isDeletionConfirmed(state)) {
    throw new Error(
      `Safety violation: ${state.operation} was not explicitly confirmed. ` +
      `Use --yes flag or answer 'y' to confirmation prompt.`
    );
  }
}

/**
 * HARD CONSTRAINT: Check if a file can be copied to worktree
 *
 * A file can ONLY be copied if:
 * 1. It is NOT tracked by git
 * 2. It IS ignored by git (in .gitignore)
 *
 * This function does not do the actual check - that's in secrets.ts
 * This documents the invariant.
 */
export interface FileCopyDecision {
  path: string;
  allowed: boolean;
  reason: string;
  isTracked: boolean;
  isIgnored: boolean;
}

/**
 * Validate that a file copy decision follows safety rules
 */
export function validateFileCopy(decision: FileCopyDecision): void {
  // HARD CONSTRAINT: Tracked files are NEVER copied
  if (decision.isTracked && decision.allowed) {
    throw new Error(
      `Safety violation: Attempted to copy tracked file '${decision.path}'. ` +
      `Tracked files must NEVER be copied to worktrees.`
    );
  }

  // HARD CONSTRAINT: Non-ignored files should not be copied
  if (!decision.isIgnored && decision.allowed) {
    throw new Error(
      `Safety violation: Attempted to copy non-ignored file '${decision.path}'. ` +
      `Only gitignored files can be copied to worktrees.`
    );
  }
}

/**
 * Safety summary for logging/debugging
 */
export function getSafetyConstraints(): string[] {
  return [
    'Never auto-merge PRs (merge must be done manually)',
    'Never delete branches/worktrees without explicit --yes flag or prompt confirmation',
    'Never copy tracked files to worktrees (only gitignored files allowed)',
  ];
}
