/**
 * cry open command
 *
 * Open or navigate to a worktree by branch name or path.
 * Can launch agent (Claude) or editor (VS Code) in the worktree.
 */

import {
  isGitRepo,
  getRepoRoot,
  listWorktrees,
  runCommand,
  commandExists,
} from '../lib/git.js';
import { resolveBranchOrPath } from '../lib/paths.js';
import { getMergedConfig, configExists } from '../lib/config.js';
import * as out from '../lib/output.js';
import { fail, errors } from '../lib/errors.js';

interface OpenOptions {
  cmd?: string;
  pathOnly?: boolean;
  agent?: boolean;
  editor?: boolean;
}

/**
 * Determine the command to run based on options and config
 * Returns { command, type } or null if nothing to run
 */
export function resolveOpenCommand(
  options: OpenOptions,
  config: { agentCommand: string; editorCommand: string }
): { command: string; type: 'agent' | 'editor' | 'custom' } | null {
  // Explicit --cmd takes precedence
  if (options.cmd) {
    return { command: options.cmd, type: 'custom' };
  }

  // --agent flag
  if (options.agent) {
    return { command: config.agentCommand, type: 'agent' };
  }

  // --editor flag
  if (options.editor) {
    return { command: config.editorCommand, type: 'editor' };
  }

  // Default behavior: try agent first, then editor
  return { command: config.agentCommand, type: 'agent' };
}

/**
 * Check if a command is available and provide helpful error message
 */
function checkCommandAvailable(command: string, type: 'agent' | 'editor' | 'custom'): boolean {
  if (commandExists(command)) {
    return true;
  }

  if (type === 'agent') {
    fail(errors.agentNotFound(command));
  } else if (type === 'editor') {
    fail(errors.editorNotFound(command));
  } else {
    out.error(`Command not found: ${command}`);
  }

  return false;
}

export async function open(branchOrPath: string | undefined, options: OpenOptions): Promise<void> {
  // Check if we're in a git repo
  if (!isGitRepo()) {
    fail(errors.notGitRepo());
  }

  const repoRoot = getRepoRoot();
  const worktrees = listWorktrees(repoRoot);

  // Build lookup list
  const wtList = worktrees.map((wt) => ({
    branch: wt.branch ?? null,
    path: wt.worktree,
  }));

  // If no branch specified, try to use current directory as worktree
  let resolved: { path: string; branch: string | null } | null = null;

  if (!branchOrPath) {
    // Check if we're already in a worktree
    const cwd = process.cwd();
    const currentWt = wtList.find((wt) => cwd.startsWith(wt.path));
    if (currentWt) {
      resolved = { path: currentWt.path, branch: currentWt.branch };
    } else {
      const available = wtList.map(w => w.branch ?? w.path);
      fail(errors.worktreeNotFound('(current directory)', available));
    }
  } else {
    // Resolve the worktree by name or path
    resolved = resolveBranchOrPath(branchOrPath, wtList, repoRoot);
  }

  if (!resolved) {
    const available = wtList.map(w => w.branch ?? w.path);
    fail(errors.worktreeNotFound(branchOrPath!, available));
  }

  const { path: wtPath, branch } = resolved;

  // If --path-only, just print the path (for scripting)
  if (options.pathOnly) {
    console.log(wtPath);
    return;
  }

  // Load config for command resolution
  const config = configExists(repoRoot)
    ? getMergedConfig(repoRoot)
    : { agentCommand: 'claude', editorCommand: 'code' };

  // Resolve what command to run
  const cmdInfo = resolveOpenCommand(options, config);

  if (cmdInfo) {
    // Check if command is available
    if (!checkCommandAvailable(cmdInfo.command, cmdInfo.type)) {
      // If agent not available and we weren't explicitly requesting it, try editor
      if (cmdInfo.type === 'agent' && !options.agent) {
        out.newline();
        out.log('Trying editor instead...');
        if (commandExists(config.editorCommand)) {
          out.log(`Opening in ${config.editorCommand}...`);
          const code = await runCommand(`${config.editorCommand} "${wtPath}"`, wtPath);
          process.exit(code);
        } else {
          out.error(`Editor command not found: ${config.editorCommand}`);
          process.exit(1);
        }
      }
      process.exit(1);
    }

    // Build the command string
    const fullCommand = cmdInfo.type === 'custom'
      ? cmdInfo.command
      : `${cmdInfo.command} "${wtPath}"`;

    out.success(`Opening ${branch ? out.fmt.branch(branch) : '(detached)'} in ${cmdInfo.command}`);
    out.log(`  ${out.fmt.dim('$')} ${fullCommand}`);

    const code = await runCommand(fullCommand, wtPath);
    process.exit(code);
  }

  // Fallback: just print the path and helper
  out.success(`Found worktree: ${branch ? out.fmt.branch(branch) : '(detached)'}`);
  out.newline();
  out.log(`Path: ${out.fmt.path(wtPath)}`);
  out.newline();
  out.log('To navigate there:');
  out.log(`  ${out.fmt.cyan(`cd "${wtPath}"`)}`);

  // For shell integration hint
  out.newline();
  out.log(out.fmt.dim('Tip: Add this to your shell profile for easy navigation:'));
  out.log(out.fmt.dim('  crycd() { cd "$(cry open "$1" --path-only)"; }'));
  out.log(out.fmt.dim('  # Then use: crycd feature/my-branch'));
}
