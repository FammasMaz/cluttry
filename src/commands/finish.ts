/**
 * cry finish command
 *
 * Show session summary and optionally create PR, cleanup worktree.
 * Safe by default - never auto-merges, never deletes without confirmation.
 */

import { createInterface } from 'node:readline';
import { execSync, spawnSync } from 'node:child_process';
import {
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  git,
  listWorktrees,
  removeWorktree,
  deleteBranch,
  isWorktreeDirty,
  getDefaultBranch,
  getMergeBase,
  getUpstreamBranch,
} from '../lib/git.js';
import {
  findSessionForCwd,
  findMainRepoRoot,
  deleteSession,
  updateSessionManifest,
  type SessionManifest,
} from '../lib/session.js';
import { runHooks } from '../lib/hooks.js';
import { getMergedConfig } from '../lib/config.js';
import * as out from '../lib/output.js';
import { fail, errors, printError } from '../lib/errors.js';

export interface FinishOptions {
  json?: boolean;
  dryRun?: boolean;
  pr?: boolean;
  cleanup?: boolean;
  noCleanup?: boolean;
  nonInteractive?: boolean;
  allowDirty?: boolean;
  deleteBranch?: boolean;
  message?: string;
  skipCommit?: boolean;
  skipHooks?: boolean;
  merge?: boolean;
  prMerge?: boolean;
  noMerge?: boolean;
}

interface SessionSummary {
  branch: string;
  baseBranch: string;
  worktreePath: string;
  repoRoot: string;
  sessionId: string | null;
  status: {
    staged: string[];
    unstaged: string[];
    untracked: string[];
    clean: boolean;
  };
  diff: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    summary: string;
  };
  commits: {
    ahead: number;
    behind: number;
    list: Array<{ sha: string; message: string }>;
  };
}

type DirtyAction = 'diff' | 'commit' | 'abort';
type CommitAction = 'stage-all' | 'staged-only' | 'abort';

/**
 * Parse git status --porcelain output
 */
function parseGitStatus(output: string): SessionSummary['status'] {
  const lines = output.split('\n').filter(line => line.trim());
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    const index = line[0];
    const worktree = line[1];
    const file = line.slice(3);

    if (index === '?' && worktree === '?') {
      untracked.push(file);
    } else {
      if (index !== ' ' && index !== '?') {
        staged.push(file);
      }
      if (worktree !== ' ' && worktree !== '?') {
        unstaged.push(file);
      }
    }
  }

  return {
    staged,
    unstaged,
    untracked,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  };
}

/**
 * Parse git diff --stat output
 */
function parseDiffStat(output: string): SessionSummary['diff'] {
  const lines = output.trim().split('\n');
  if (lines.length === 0 || output.trim() === '') {
    return { filesChanged: 0, insertions: 0, deletions: 0, summary: 'No changes' };
  }

  // Last line contains summary like: "5 files changed, 100 insertions(+), 20 deletions(-)"
  const lastLine = lines[lines.length - 1];
  const filesMatch = lastLine.match(/(\d+) files? changed/);
  const insertMatch = lastLine.match(/(\d+) insertions?\(\+\)/);
  const deleteMatch = lastLine.match(/(\d+) deletions?\(-\)/);

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
    deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
    summary: lastLine.trim() || 'No changes',
  };
}

/**
 * Get commits ahead/behind base branch
 */
function getCommitInfo(baseBranch: string, cwd: string): SessionSummary['commits'] {
  const commits: SessionSummary['commits'] = {
    ahead: 0,
    behind: 0,
    list: [],
  };

  try {
    // Get commits ahead (on this branch but not on base)
    const aheadOutput = git(['rev-list', '--count', `${baseBranch}..HEAD`], cwd);
    commits.ahead = parseInt(aheadOutput, 10) || 0;

    // Get commits behind (on base but not on this branch)
    const behindOutput = git(['rev-list', '--count', `HEAD..${baseBranch}`], cwd);
    commits.behind = parseInt(behindOutput, 10) || 0;

    // Get list of commits ahead
    if (commits.ahead > 0) {
      const logOutput = git(
        ['log', '--oneline', '--no-decorate', `${baseBranch}..HEAD`],
        cwd
      );
      commits.list = logOutput.split('\n').filter(line => line.trim()).map(line => {
        const [sha, ...rest] = line.split(' ');
        return { sha, message: rest.join(' ') };
      });
    }
  } catch {
    // Base branch might not exist or be reachable
  }

  return commits;
}

/**
 * Detect session info from git when no manifest is available
 * Uses improved base branch detection via merge-base and upstream tracking
 */
function detectSessionFromGit(cwd: string): Partial<SessionManifest> | null {
  try {
    const branch = getCurrentBranch(cwd);
    if (!branch) return null;

    const repoRoot = getRepoRoot(cwd);
    const mainRepoRoot = findMainRepoRoot(cwd);

    // Determine base branch with fallback chain:
    // 1. Upstream tracking branch (e.g., origin/main)
    // 2. Default branch from origin/HEAD
    // 3. 'main' or 'master' if they exist
    // 4. Current branch as last resort
    let baseBranch: string | null = null;

    // Try upstream tracking branch
    const upstream = getUpstreamBranch(cwd);
    if (upstream) {
      // Extract branch name from origin/branch format
      const upstreamBranch = upstream.replace(/^origin\//, '');
      // Verify it's a different branch
      if (upstreamBranch !== branch) {
        baseBranch = upstreamBranch;
      }
    }

    // Try default branch
    if (!baseBranch) {
      const defaultBranch = getDefaultBranch(cwd);
      if (defaultBranch && defaultBranch !== branch) {
        baseBranch = defaultBranch;
      }
    }

    // Try common branch names
    if (!baseBranch) {
      for (const candidate of ['main', 'master', 'develop']) {
        try {
          git(['rev-parse', '--verify', `refs/heads/${candidate}`], cwd);
          if (candidate !== branch) {
            baseBranch = candidate;
            break;
          }
        } catch {
          // Branch doesn't exist, try next
        }
      }
    }

    // Last resort: use current branch (no comparison possible)
    if (!baseBranch) {
      baseBranch = branch;
    }

    return {
      branch,
      baseBranch,
      worktreePath: repoRoot,
      repoRoot: mainRepoRoot ?? repoRoot,
    };
  } catch {
    return null;
  }
}

/**
 * Build session summary
 */
function buildSummary(session: Partial<SessionManifest>, sessionId: string | null): SessionSummary {
  const cwd = session.worktreePath!;
  const baseBranch = session.baseBranch ?? 'main';

  // Get git status
  let statusOutput = '';
  try {
    statusOutput = git(['status', '--porcelain'], cwd);
  } catch {
    // Ignore errors
  }

  // Get diff stat against base branch
  let diffOutput = '';
  try {
    diffOutput = git(['diff', '--stat', baseBranch], cwd);
  } catch {
    // Base branch might not exist
  }

  return {
    branch: session.branch!,
    baseBranch,
    worktreePath: session.worktreePath!,
    repoRoot: session.repoRoot!,
    sessionId,
    status: parseGitStatus(statusOutput),
    diff: parseDiffStat(diffOutput),
    commits: getCommitInfo(baseBranch, cwd),
  };
}

/**
 * Print summary in human-readable format
 */
function printSummary(summary: SessionSummary): void {
  out.header('Session Summary');
  out.newline();

  // Basic info
  out.log(`  Branch:      ${out.fmt.branch(summary.branch)}`);
  out.log(`  Base:        ${out.fmt.branch(summary.baseBranch)}`);
  out.log(`  Worktree:    ${out.fmt.path(summary.worktreePath)}`);
  if (summary.sessionId) {
    out.log(`  Session ID:  ${out.fmt.dim(summary.sessionId)}`);
  }

  out.newline();

  // Status
  out.log(out.fmt.bold('Working Tree Status:'));
  if (summary.status.clean) {
    out.log(`  ${out.fmt.green('✓')} Clean`);
  } else {
    if (summary.status.staged.length > 0) {
      out.log(`  ${out.fmt.green('Staged:')} ${summary.status.staged.length} file(s)`);
      for (const file of summary.status.staged.slice(0, 5)) {
        out.log(`    ${out.fmt.green('+')} ${file}`);
      }
      if (summary.status.staged.length > 5) {
        out.log(`    ${out.fmt.dim(`... and ${summary.status.staged.length - 5} more`)}`);
      }
    }
    if (summary.status.unstaged.length > 0) {
      out.log(`  ${out.fmt.yellow('Modified:')} ${summary.status.unstaged.length} file(s)`);
      for (const file of summary.status.unstaged.slice(0, 5)) {
        out.log(`    ${out.fmt.yellow('~')} ${file}`);
      }
      if (summary.status.unstaged.length > 5) {
        out.log(`    ${out.fmt.dim(`... and ${summary.status.unstaged.length - 5} more`)}`);
      }
    }
    if (summary.status.untracked.length > 0) {
      out.log(`  ${out.fmt.gray('Untracked:')} ${summary.status.untracked.length} file(s)`);
      for (const file of summary.status.untracked.slice(0, 3)) {
        out.log(`    ${out.fmt.gray('?')} ${file}`);
      }
      if (summary.status.untracked.length > 3) {
        out.log(`    ${out.fmt.dim(`... and ${summary.status.untracked.length - 3} more`)}`);
      }
    }
  }

  out.newline();

  // Diff stats
  out.log(out.fmt.bold(`Changes vs ${summary.baseBranch}:`));
  if (summary.diff.filesChanged === 0 && summary.commits.ahead === 0) {
    out.log(`  ${out.fmt.dim('No changes')}`);
  } else {
    out.log(`  ${summary.diff.summary}`);
  }

  out.newline();

  // Commits
  out.log(out.fmt.bold('Commits:'));
  if (summary.commits.ahead === 0 && summary.commits.behind === 0) {
    out.log(`  ${out.fmt.dim('Up to date with')} ${summary.baseBranch}`);
  } else {
    if (summary.commits.ahead > 0) {
      out.log(`  ${out.fmt.green(`↑ ${summary.commits.ahead}`)} ahead of ${summary.baseBranch}`);
      for (const commit of summary.commits.list.slice(0, 5)) {
        out.log(`    ${out.fmt.dim(commit.sha)} ${commit.message}`);
      }
      if (summary.commits.list.length > 5) {
        out.log(`    ${out.fmt.dim(`... and ${summary.commits.list.length - 5} more`)}`);
      }
    }
    if (summary.commits.behind > 0) {
      out.log(`  ${out.fmt.yellow(`↓ ${summary.commits.behind}`)} behind ${summary.baseBranch}`);
    }
  }

  out.newline();
}

/**
 * Interactive prompt with choices
 */
async function promptChoice<T extends string>(message: string, choices: { key: string; label: string; value: T }[]): Promise<T> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  out.log(message);
  for (const choice of choices) {
    out.log(`  ${out.fmt.bold(choice.key)}) ${choice.label}`);
  }

  return new Promise((resolve) => {
    rl.question('Choice: ', (answer) => {
      rl.close();
      const match = choices.find(c => c.key.toLowerCase() === answer.toLowerCase());
      if (match) {
        resolve(match.value);
      } else {
        // Default to first choice or abort
        resolve(choices.find(c => c.value === 'abort')?.value ?? choices[0].value);
      }
    });
  });
}

/**
 * Prompt for text input
 */
async function promptText(message: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = defaultValue
    ? `${message} [${defaultValue}]: `
    : `${message}: `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Simple yes/no confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Check if gh CLI is installed and authenticated
 */
function isGhAvailable(): boolean {
  try {
    const result = spawnSync('gh', ['auth', 'status'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if repo has an origin remote
 */
function hasOriginRemote(cwd: string): boolean {
  try {
    const remotes = git(['remote'], cwd);
    return remotes.split('\n').some(r => r.trim() === 'origin');
  } catch {
    return false;
  }
}

/**
 * Push branch to origin
 */
function pushToOrigin(branch: string, cwd: string): boolean {
  try {
    git(['push', '-u', 'origin', branch], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if branch is pushed to origin
 */
function isBranchPushed(branch: string, cwd: string): boolean {
  try {
    git(['rev-parse', `origin/${branch}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create PR using gh CLI
 */
function createPullRequest(branch: string, baseBranch: string, cwd: string): { success: boolean; url?: string; error?: string } {
  try {
    const result = spawnSync('gh', ['pr', 'create', '--base', baseBranch, '--head', branch, '--fill'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    if (result.status === 0) {
      const url = result.stdout.trim().split('\n').pop() || '';
      return { success: true, url };
    } else {
      return { success: false, error: result.stderr || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

type MergeAction = 'done' | 'local' | 'gh' | 'cancel';

/**
 * Perform local merge in the main worktree
 */
function performLocalMerge(
  mainRepoRoot: string,
  sessionBranch: string,
  baseBranch: string,
  dryRun: boolean
): { success: boolean; error?: string } {
  if (dryRun) {
    out.log(out.fmt.dim('[dry-run] Would perform local merge:'));
    out.log(out.fmt.dim(`  1. cd ${mainRepoRoot}`));
    out.log(out.fmt.dim(`  2. git fetch origin && git checkout ${baseBranch}`));
    out.log(out.fmt.dim(`  3. git merge --no-ff ${sessionBranch}`));
    out.log(out.fmt.dim(`  4. git push origin ${baseBranch}`));
    return { success: true };
  }

  try {
    // Check if main worktree is clean
    if (isWorktreeDirty(mainRepoRoot)) {
      return { success: false, error: 'Main worktree has uncommitted changes. Please commit or stash them first.' };
    }

    // Save current branch to restore on failure
    let originalBranch: string | null = null;
    try {
      originalBranch = getCurrentBranch(mainRepoRoot);
    } catch {
      // May be in detached HEAD
    }

    // Fetch and checkout base branch
    out.log(`Fetching and checking out ${out.fmt.branch(baseBranch)}...`);
    try {
      git(['fetch', 'origin'], mainRepoRoot);
    } catch {
      // Fetch may fail if no remote, continue anyway
    }
    git(['checkout', baseBranch], mainRepoRoot);

    // Try to merge
    out.log(`Merging ${out.fmt.branch(sessionBranch)} into ${out.fmt.branch(baseBranch)}...`);
    try {
      git(['merge', '--no-ff', sessionBranch, '-m', `Merge branch '${sessionBranch}'`], mainRepoRoot);
    } catch (mergeError) {
      // Conflict detected - abort and restore
      out.error('Merge conflict detected! Aborting merge...');
      try {
        git(['merge', '--abort'], mainRepoRoot);
      } catch {
        // Abort may fail if merge wasn't in progress
      }
      if (originalBranch && originalBranch !== baseBranch) {
        try {
          git(['checkout', originalBranch], mainRepoRoot);
        } catch {
          // Best effort restore
        }
      }
      return { success: false, error: 'Merge conflicts detected. Please resolve manually or use PR workflow.' };
    }

    // Push to origin
    out.log(`Pushing ${out.fmt.branch(baseBranch)} to origin...`);
    try {
      git(['push', 'origin', baseBranch], mainRepoRoot);
      out.success('Local merge and push completed');
    } catch (pushError) {
      out.warn('Merge succeeded locally but push failed. You may need to push manually.');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Merge PR using gh CLI
 */
function performPrMerge(branch: string, cwd: string): { success: boolean; error?: string } {
  try {
    const result = spawnSync('gh', ['pr', 'merge', '--merge', '--delete-branch', branch], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    if (result.status === 0) {
      return { success: true };
    } else {
      return { success: false, error: result.stderr || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Show git diff in pager
 */
function showDiff(cwd: string): void {
  try {
    execSync('git diff', {
      cwd,
      stdio: 'inherit',
    });
  } catch {
    // User may have quit pager
  }
}

/**
 * Generate a default commit message from branch name
 * feature/add-login -> Add login
 * fix-auth-bug -> Fix auth bug
 * feat-oauth -> Feat oauth
 */
function generateDefaultMessage(branch: string): string {
  // Remove common prefixes
  let message = branch
    .replace(/^(feature|feat|fix|bugfix|hotfix|chore|refactor|docs|test|ci)[\/\-]/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  // Capitalize first letter
  if (message.length > 0) {
    message = message.charAt(0).toUpperCase() + message.slice(1);
  }

  return message || branch;
}

/**
 * Stage all changes
 */
function stageAll(cwd: string): boolean {
  try {
    git(['add', '-A'], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a commit with the given message
 */
function createCommit(message: string, cwd: string): boolean {
  try {
    git(['commit', '-m', message], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there are staged changes
 */
function hasStagedChanges(cwd: string): boolean {
  try {
    const output = git(['diff', '--cached', '--name-only'], cwd);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Full commit wizard with staging options
 *
 * Returns true if commit was successful, false if aborted/failed
 */
async function runCommitWizard(
  cwd: string,
  branch: string,
  status: SessionSummary['status'],
  providedMessage?: string
): Promise<boolean> {
  const hasStaged = status.staged.length > 0;
  const hasUnstaged = status.unstaged.length > 0 || status.untracked.length > 0;

  // Non-interactive mode with provided message
  if (providedMessage) {
    out.log('Staging all changes...');
    if (!stageAll(cwd)) {
      out.error('Failed to stage changes.');
      return false;
    }

    out.log(`Committing with message: "${providedMessage}"`);
    if (!createCommit(providedMessage, cwd)) {
      out.error('Failed to create commit.');
      return false;
    }

    out.success('Commit created');
    return true;
  }

  // Interactive mode
  out.newline();
  out.header('Commit Wizard');
  out.newline();

  // Show current state
  if (hasStaged) {
    out.log(`  ${out.fmt.green('Staged:')} ${status.staged.length} file(s)`);
  }
  if (hasUnstaged) {
    out.log(`  ${out.fmt.yellow('Unstaged:')} ${status.unstaged.length + status.untracked.length} file(s)`);
  }
  out.newline();

  // Build choices based on current state
  const choices: { key: string; label: string; value: CommitAction }[] = [];

  if (hasUnstaged) {
    choices.push({ key: 'a', label: 'Stage all changes and commit', value: 'stage-all' });
  }

  if (hasStaged) {
    choices.push({ key: 's', label: 'Commit only staged changes', value: 'staged-only' });
  }

  choices.push({ key: 'x', label: 'Abort', value: 'abort' });

  // If nothing staged and nothing unstaged, nothing to do
  if (!hasStaged && !hasUnstaged) {
    out.log(out.fmt.dim('Nothing to commit.'));
    return true;
  }

  const action = await promptChoice<CommitAction>('How would you like to commit?', choices);

  if (action === 'abort') {
    out.log('Commit aborted.');
    return false;
  }

  // Stage if needed
  if (action === 'stage-all') {
    out.log('Staging all changes...');
    if (!stageAll(cwd)) {
      out.error('Failed to stage changes.');
      return false;
    }
  }

  // Verify we have something to commit
  if (!hasStagedChanges(cwd)) {
    out.warn('No changes staged for commit.');
    return false;
  }

  // Get commit message
  const defaultMessage = generateDefaultMessage(branch);
  const message = await promptText('Commit message', defaultMessage);

  if (!message) {
    out.warn('Empty commit message. Aborting.');
    return false;
  }

  // Create commit
  out.log('Creating commit...');
  if (!createCommit(message, cwd)) {
    out.error('Failed to create commit.');
    return false;
  }

  out.success('Commit created');
  return true;
}

/**
 * Print manual PR instructions when gh is not available
 */
function printManualInstructions(summary: SessionSummary): void {
  out.newline();
  out.header('Manual PR Instructions');
  out.newline();

  const { branch, baseBranch, worktreePath } = summary;

  out.log('GitHub CLI (gh) is not available. To create a PR manually:');
  out.newline();

  if (!isBranchPushed(branch, worktreePath)) {
    out.log(`  1. Push your branch:`);
    out.log(`     ${out.fmt.dim(`git push -u origin ${branch}`)}`);
    out.newline();
  }

  out.log(`  2. Create a PR on GitHub:`);
  out.log(`     ${out.fmt.dim(`https://github.com/<owner>/<repo>/compare/${baseBranch}...${branch}`)}`);
  out.newline();

  out.log(`  Or install gh CLI:`);
  out.log(`     ${out.fmt.dim('brew install gh && gh auth login')}`);
  out.newline();
}

/**
 * Perform cleanup: remove worktree, optionally delete branch and session
 */
async function performCleanup(
  summary: SessionSummary,
  options: FinishOptions,
  dryRun: boolean
): Promise<boolean> {
  const { branch, worktreePath, repoRoot, sessionId } = summary;

  if (dryRun) {
    out.log(out.fmt.dim('[dry-run] Would remove worktree:') + ` ${worktreePath}`);
    if (options.deleteBranch) {
      out.log(out.fmt.dim('[dry-run] Would delete branch:') + ` ${branch}`);
    }
    if (sessionId) {
      out.log(out.fmt.dim('[dry-run] Would delete session:') + ` ${sessionId}`);
    }
    return true;
  }

  // Remove worktree
  out.log(`Removing worktree: ${out.fmt.path(worktreePath)}`);
  try {
    removeWorktree(worktreePath, false, repoRoot);
    out.success('Worktree removed');
  } catch (error) {
    out.error(`Failed to remove worktree: ${(error as Error).message}`);
    return false;
  }

  // Delete branch if requested
  if (options.deleteBranch) {
    const currentBranch = getCurrentBranch(repoRoot);
    if (branch === currentBranch) {
      out.warn(`Cannot delete branch '${branch}' - it's currently checked out.`);
    } else {
      out.log(`Deleting branch: ${out.fmt.branch(branch)}`);
      try {
        deleteBranch(branch, false, repoRoot);
        out.success('Branch deleted');
      } catch (error) {
        out.warn(`Failed to delete branch: ${(error as Error).message}`);
      }
    }
  }

  // Delete session manifest
  if (sessionId) {
    if (deleteSession(repoRoot, sessionId)) {
      out.success('Session manifest removed');
    }
  }

  return true;
}

export async function finish(options: FinishOptions): Promise<void> {
  const cwd = process.cwd();

  // Check if we're in a git repo
  if (!isGitRepo(cwd)) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Not a git repository' }));
      process.exit(1);
    }
    fail(errors.notGitRepo());
  }

  // Try to find session manifest first
  let session = findSessionForCwd(cwd);
  let sessionId: string | null = null;

  if (session) {
    sessionId = session.id;
  } else {
    // Fallback to git introspection
    const detected = detectSessionFromGit(cwd);
    if (!detected) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Could not detect session info' }));
        process.exit(1);
      }
      fail(errors.sessionNotFound('current directory'));
    }
    session = detected as SessionManifest;
  }

  // Build summary
  let summary = buildSummary(session, sessionId);

  // JSON mode - just output and exit
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // Print summary
  printSummary(summary);

  // Load config for hooks
  const mainRepoRoot = findMainRepoRoot(cwd);
  const config = mainRepoRoot ? getMergedConfig(mainRepoRoot) : null;

  const isDirty = !summary.status.clean;
  const hasCommits = summary.commits.ahead > 0;
  const dryRun = options.dryRun ?? false;

  // Run preFinish hooks
  if (!options.skipHooks && config && config.hooks.preFinish.length > 0) {
    if (dryRun) {
      out.log(out.fmt.dim('[dry-run] Would run preFinish hooks:'));
      for (const hook of config.hooks.preFinish) {
        out.log(out.fmt.dim(`  - ${hook}`));
      }
    } else {
      const hookResult = await runHooks('preFinish', config.hooks.preFinish, { cwd });
      if (!hookResult.success) {
        out.error('preFinish hooks failed. Aborting finish.');
        process.exit(1);
      }
    }
  }

  // Handle dirty state
  if (isDirty) {
    // Skip commit entirely if --skip-commit is set
    if (options.skipCommit) {
      out.log(out.fmt.dim('Skipping commit (--skip-commit).'));
    } else if (options.message) {
      // Non-interactive commit with provided message
      if (dryRun) {
        out.log(out.fmt.dim(`[dry-run] Would stage all and commit with message: "${options.message}"`));
      } else {
        const success = await runCommitWizard(cwd, summary.branch, summary.status, options.message);
        if (!success) {
          out.error('Commit failed.');
          process.exit(1);
        }
        // Refresh summary
        summary = buildSummary(session, sessionId);
      }
    } else if (options.nonInteractive) {
      if (options.allowDirty) {
        out.warn('Working tree is dirty. Proceeding with --allow-dirty.');
      } else {
        out.error('Working tree has uncommitted changes.');
        out.info('Use --allow-dirty to proceed anyway, --message to commit, or --skip-commit to bypass.');
        process.exit(1);
      }
    } else {
      // Interactive dirty handling
      const action = await promptChoice<DirtyAction>(
        'Working tree has uncommitted changes. What would you like to do?',
        [
          { key: 'd', label: 'View diff', value: 'diff' },
          { key: 'c', label: 'Commit changes', value: 'commit' },
          { key: 'a', label: 'Abort', value: 'abort' },
        ]
      );

      if (action === 'diff') {
        showDiff(cwd);
        out.newline();
        // After viewing diff, ask again
        const nextAction = await promptChoice<'commit' | 'abort'>(
          'What next?',
          [
            { key: 'c', label: 'Commit changes', value: 'commit' },
            { key: 'a', label: 'Abort', value: 'abort' },
          ]
        );
        if (nextAction === 'abort') {
          out.log('Aborted.');
          process.exit(0);
        }
        // Run commit wizard
        const success = await runCommitWizard(cwd, summary.branch, summary.status);
        if (!success) {
          out.error('Commit failed or was cancelled.');
          process.exit(1);
        }
        // Refresh summary
        summary = buildSummary(session, sessionId);
      } else if (action === 'commit') {
        const success = await runCommitWizard(cwd, summary.branch, summary.status);
        if (!success) {
          out.error('Commit failed or was cancelled.');
          process.exit(1);
        }
        // Refresh summary
        summary = buildSummary(session, sessionId);
      } else {
        out.log('Aborted.');
        process.exit(0);
      }
    }
  }

  // Check for commits to create PR
  const updatedHasCommits = summary.commits.ahead > 0 || hasCommits;
  const ghAvailable = isGhAvailable();
  const hasOrigin = hasOriginRemote(cwd);
  const canCreatePr = ghAvailable && hasOrigin;

  if (updatedHasCommits || options.pr) {
    out.newline();

    if (dryRun) {
      out.log(out.fmt.dim('[dry-run] Would push branch and create PR'));
    } else if (canCreatePr) {
      // Push if needed
      if (!isBranchPushed(summary.branch, cwd)) {
        out.log(`Pushing branch: ${out.fmt.branch(summary.branch)}`);
        if (!pushToOrigin(summary.branch, cwd)) {
          fail(errors.pushFailed(summary.branch));
        }
        out.success('Branch pushed');
      }

      // Create PR
      out.log('Creating pull request...');
      const prResult = createPullRequest(summary.branch, summary.baseBranch, cwd);
      if (prResult.success) {
        out.success(`PR created: ${prResult.url}`);

        // Update session manifest with PR URL
        if (sessionId && mainRepoRoot) {
          updateSessionManifest(mainRepoRoot, sessionId, {
            prUrl: prResult.url,
            status: 'finished',
            lastActiveAt: new Date().toISOString(),
            lastFinishResult: {
              success: true,
              prCreated: true,
              checksRan: false,
            },
          });
        }
      } else {
        // PR might already exist
        if (prResult.error?.includes('already exists')) {
          out.info('A pull request already exists for this branch.');
        } else {
          out.warn(`Could not create PR: ${prResult.error}`);
        }

        // Update session manifest with finish result
        if (sessionId && mainRepoRoot) {
          updateSessionManifest(mainRepoRoot, sessionId, {
            status: prResult.error?.includes('already exists') ? 'finished' : 'error',
            lastActiveAt: new Date().toISOString(),
            lastFinishResult: {
              success: prResult.error?.includes('already exists') ?? false,
              prCreated: false,
              checksRan: false,
              message: prResult.error,
            },
          });
        }
      }

      // Merge options
      let mergeAction: MergeAction = 'done';

      // Handle non-interactive merge flags
      if (options.merge) {
        mergeAction = 'local';
      } else if (options.prMerge) {
        mergeAction = 'gh';
      } else if (!options.noMerge && !options.nonInteractive) {
        // Interactive merge menu
        out.newline();
        mergeAction = await promptChoice<MergeAction>(
          'What would you like to do next?',
          [
            { key: 'p', label: 'Done (PR only)', value: 'done' },
            { key: 'm', label: 'Merge locally into base branch', value: 'local' },
            { key: 'g', label: 'Merge PR via GitHub (gh pr merge)', value: 'gh' },
            { key: 'x', label: 'Cancel', value: 'cancel' },
          ]
        );
      }

      // Handle merge action
      if (mergeAction === 'cancel') {
        out.log('Cancelled.');
        process.exit(0);
      }

      if (mergeAction === 'local' || mergeAction === 'gh') {
        // Run preMerge hooks
        if (!options.skipHooks && config && config.hooks.preMerge.length > 0) {
          if (dryRun) {
            out.log(out.fmt.dim('[dry-run] Would run preMerge hooks:'));
            for (const hook of config.hooks.preMerge) {
              out.log(out.fmt.dim(`  - ${hook}`));
            }
          } else {
            const hookResult = await runHooks('preMerge', config.hooks.preMerge, { cwd });
            if (!hookResult.success) {
              out.error('preMerge hooks failed. Merge aborted.');
              process.exit(1);
            }
          }
        }

        // Perform the merge
        if (mergeAction === 'local') {
          out.newline();
          out.header('Local Merge');
          const mergeResult = performLocalMerge(mainRepoRoot!, summary.branch, summary.baseBranch, dryRun);
          if (!mergeResult.success) {
            out.error(`Local merge failed: ${mergeResult.error}`);
            process.exit(1);
          }
        } else if (mergeAction === 'gh') {
          out.newline();
          out.log('Merging PR via GitHub...');
          if (dryRun) {
            out.log(out.fmt.dim(`[dry-run] Would run: gh pr merge --merge --delete-branch ${summary.branch}`));
          } else {
            const mergeResult = performPrMerge(summary.branch, cwd);
            if (mergeResult.success) {
              out.success('PR merged and branch deleted via GitHub');
            } else {
              out.error(`PR merge failed: ${mergeResult.error}`);
              process.exit(1);
            }
          }
        }
      }
    } else if (!ghAvailable) {
      printManualInstructions(summary);
      // Exit 0 as requested - not an error
      process.exit(0);
    } else if (!hasOrigin) {
      printError(errors.noRemoteConfigured());
    }
  } else {
    out.log(out.fmt.dim('No commits to push.'));
  }

  // Run postFinish hooks
  if (!options.skipHooks && config && config.hooks.postFinish.length > 0) {
    if (dryRun) {
      out.log(out.fmt.dim('[dry-run] Would run postFinish hooks:'));
      for (const hook of config.hooks.postFinish) {
        out.log(out.fmt.dim(`  - ${hook}`));
      }
    } else {
      const hookResult = await runHooks('postFinish', config.hooks.postFinish, { cwd });
      if (!hookResult.success) {
        out.warn('postFinish hooks failed, but finish will continue.');
      }
    }
  }

  // Cleanup prompt
  if (options.noCleanup) {
    // Skip cleanup entirely
    out.newline();
    out.success('Done (cleanup skipped)');
    return;
  }

  if (options.cleanup) {
    // Auto cleanup
    out.newline();
    await performCleanup(summary, options, dryRun);
    out.newline();
    out.success('Done');
    return;
  }

  // Interactive cleanup prompt
  if (!options.nonInteractive) {
    out.newline();
    const shouldCleanup = await confirm('Remove worktree and clean up?');
    if (shouldCleanup) {
      let deleteBranchChoice = options.deleteBranch ?? false;
      if (!deleteBranchChoice) {
        deleteBranchChoice = await confirm('Also delete the branch?');
      }
      const cleanupOpts = { ...options, deleteBranch: deleteBranchChoice };
      await performCleanup(summary, cleanupOpts, dryRun);
    }
  }

  out.newline();
  out.success('Done');
}
