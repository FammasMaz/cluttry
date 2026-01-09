/**
 * cry resume command
 *
 * Resume an existing session by branch name or session ID.
 * Opens the worktree in agent or prints cd instructions.
 */

import { existsSync } from 'node:fs';
import {
  isGitRepo,
  getRepoRoot,
  runCommand,
  commandExists,
} from '../lib/git.js';
import {
  listSessions,
  findSessionByBranch,
  readSessionManifest,
  findMainRepoRoot,
  type SessionManifest,
} from '../lib/session.js';
import { getMergedConfig, configExists } from '../lib/config.js';
import * as out from '../lib/output.js';

export interface ResumeOptions {
  agent?: string;
  cd?: boolean;
}

/**
 * Find session by branch name or session ID
 */
export function findSession(
  repoRoot: string,
  nameOrId: string
): SessionManifest | null {
  // Try by ID first (exact match)
  const byId = readSessionManifest(repoRoot, nameOrId);
  if (byId) {
    return byId;
  }

  // Try by branch name
  const byBranch = findSessionByBranch(repoRoot, nameOrId);
  if (byBranch) {
    return byBranch;
  }

  // Try partial ID match
  const sessions = listSessions(repoRoot);
  const partialMatch = sessions.find(s => s.id.startsWith(nameOrId));
  if (partialMatch) {
    return partialMatch;
  }

  // Try partial branch match
  const branchMatch = sessions.find(s =>
    s.branch.includes(nameOrId) ||
    s.branch.endsWith(nameOrId)
  );
  if (branchMatch) {
    return branchMatch;
  }

  return null;
}

/**
 * Check if worktree exists and is valid
 */
export function isWorktreeValid(worktreePath: string): boolean {
  return existsSync(worktreePath);
}

export async function resume(nameOrId: string, options: ResumeOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  // Find the main repo root where sessions are stored
  const cwd = process.cwd();
  const mainRepoRoot = findMainRepoRoot(cwd);
  if (!mainRepoRoot) {
    out.error('Could not find repository root.');
    process.exit(1);
  }

  // Find the session
  const session = findSession(mainRepoRoot, nameOrId);
  if (!session) {
    out.error(`Session not found: ${nameOrId}`);
    out.newline();

    // List available sessions
    const sessions = listSessions(mainRepoRoot);
    if (sessions.length === 0) {
      out.info('No sessions found. Create one with: cry spawn <branch> --new');
    } else {
      out.info('Available sessions:');
      for (const s of sessions.slice(0, 10)) {
        const exists = isWorktreeValid(s.worktreePath) ? '' : out.fmt.red(' (missing)');
        out.log(`  • ${out.fmt.branch(s.branch)} ${out.fmt.dim(s.id)}${exists}`);
      }
      if (sessions.length > 10) {
        out.log(`  ${out.fmt.dim(`... and ${sessions.length - 10} more`)}`);
      }
    }
    process.exit(1);
  }

  const { worktreePath, branch, id } = session;

  // Check if worktree still exists
  if (!isWorktreeValid(worktreePath)) {
    out.error(`Worktree no longer exists: ${worktreePath}`);
    out.newline();
    out.info('The worktree may have been removed. Options:');
    out.log(`  • Recreate: ${out.fmt.cyan(`cry spawn ${branch}`)}`);
    out.log(`  • Remove stale session: ${out.fmt.cyan(`cry prune`)}`);
    process.exit(1);
  }

  // If --cd flag, just print cd command
  if (options.cd) {
    console.log(`cd "${worktreePath}"`);
    return;
  }

  out.success(`Resuming session: ${out.fmt.branch(branch)}`);
  out.log(`  Session: ${out.fmt.dim(id)}`);
  out.log(`  Path:    ${out.fmt.path(worktreePath)}`);

  // If --agent flag, launch agent
  if (options.agent) {
    const agentCmd = options.agent;
    out.newline();

    if (!commandExists(agentCmd)) {
      out.error(`Agent command not found: ${agentCmd}`);
      out.info('Install Claude Code: npm install -g @anthropic-ai/claude-code');
      process.exit(1);
    }

    out.log(`Launching ${agentCmd}...`);
    const code = await runCommand(agentCmd, worktreePath);
    process.exit(code);
  }

  // Default: load config and try to launch agent, or show instructions
  const config = configExists(mainRepoRoot)
    ? getMergedConfig(mainRepoRoot)
    : { agentCommand: 'claude', editorCommand: 'code' };

  // Try to launch the configured agent
  if (commandExists(config.agentCommand)) {
    out.newline();
    out.log(`Launching ${config.agentCommand}...`);
    const code = await runCommand(config.agentCommand, worktreePath);
    process.exit(code);
  }

  // Fallback: show navigation instructions
  out.newline();
  out.log('To navigate there:');
  out.log(`  ${out.fmt.cyan(`cd "${worktreePath}"`)}`);
  out.newline();
  out.log('Or use:');
  out.log(`  ${out.fmt.cyan(`cry resume ${branch} --agent claude`)}`);
}
