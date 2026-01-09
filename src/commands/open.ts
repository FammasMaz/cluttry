/**
 * cry open command
 *
 * Open or navigate to a worktree by branch name or path.
 */

import {
  isGitRepo,
  getRepoRoot,
  listWorktrees,
  runCommand,
} from '../lib/git.js';
import { resolveBranchOrPath } from '../lib/paths.js';
import * as out from '../lib/output.js';

interface OpenOptions {
  cmd?: string;
}

export async function open(branchOrPath: string, options: OpenOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    out.error('Not a git repository. Run this command from within a git repo.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const worktrees = listWorktrees(repoRoot);

  // Build lookup list
  const wtList = worktrees.map((wt) => ({
    branch: wt.branch ?? null,
    path: wt.worktree,
  }));

  // Resolve the worktree
  const resolved = resolveBranchOrPath(branchOrPath, wtList, repoRoot);

  if (!resolved) {
    out.error(`Worktree not found: ${branchOrPath}`);
    out.info('Available worktrees:');
    for (const wt of wtList) {
      out.log(`  • ${wt.branch ?? '(detached)'} → ${wt.path}`);
    }
    process.exit(1);
  }

  const { path: wtPath, branch } = resolved;

  // If --cmd is provided, run it
  if (options.cmd) {
    out.log(`Running in ${out.fmt.path(wtPath)}:`);
    out.log(`  ${out.fmt.dim('$')} ${options.cmd}`);
    const code = await runCommand(options.cmd, wtPath);
    process.exit(code);
  }

  // Otherwise, print the path and helper
  out.success(`Found worktree: ${branch ? out.fmt.branch(branch) : '(detached)'}`);
  out.newline();
  out.log(`Path: ${out.fmt.path(wtPath)}`);
  out.newline();
  out.log('To navigate there:');
  out.log(`  ${out.fmt.cyan(`cd "${wtPath}"`)}`);

  // For shell integration hint
  out.newline();
  out.log(out.fmt.dim('Tip: Use command substitution in your shell:'));
  out.log(out.fmt.dim(`  cd "$(vwt open ${branchOrPath} 2>/dev/null | grep "^Path:" | cut -d' ' -f2-)"`));
}
