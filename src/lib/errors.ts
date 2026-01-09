/**
 * Structured error handling for cry CLI
 *
 * Each error includes:
 * - what: What happened
 * - why: Why it likely happened
 * - fix: Exact command(s) the user should run
 */

import * as out from './output.js';

export interface CryError {
  what: string;
  why: string;
  fix: string | string[];
}

/**
 * Print a structured error message and exit
 */
export function fail(error: CryError): never {
  out.error(error.what);
  out.newline();
  out.log(`${out.fmt.bold('Why:')} ${error.why}`);
  out.newline();
  out.log(out.fmt.bold('Fix:'));
  const fixes = Array.isArray(error.fix) ? error.fix : [error.fix];
  for (const fix of fixes) {
    out.log(`  ${out.fmt.cyan(fix)}`);
  }
  process.exit(1);
}

/**
 * Print a structured error without exiting (for non-fatal errors)
 */
export function printError(error: CryError): void {
  out.error(error.what);
  out.newline();
  out.log(`${out.fmt.bold('Why:')} ${error.why}`);
  out.newline();
  out.log(out.fmt.bold('Fix:'));
  const fixes = Array.isArray(error.fix) ? error.fix : [error.fix];
  for (const fix of fixes) {
    out.log(`  ${out.fmt.cyan(fix)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Common error factories
// ─────────────────────────────────────────────────────────────────────────────

export const errors = {
  notGitRepo(): CryError {
    return {
      what: 'Not a git repository.',
      why: 'cry requires a git repository to manage worktrees. The current directory is not inside a git repo.',
      fix: [
        'cd /path/to/your/repo',
        'git init  # or clone an existing repo',
      ],
    };
  },

  gitNotInstalled(): CryError {
    return {
      what: 'Git is not installed or not in PATH.',
      why: 'cry requires git to manage worktrees. Git was not found on your system.',
      fix: [
        'brew install git  # macOS',
        'sudo apt install git  # Ubuntu/Debian',
        'https://git-scm.com/downloads',
      ],
    };
  },

  branchAlreadyExists(branch: string): CryError {
    return {
      what: `Branch '${branch}' already exists.`,
      why: 'You used --new but the branch already exists locally or remotely.',
      fix: [
        `cry spawn ${branch}  # use existing branch (without --new)`,
        `cry spawn ${branch}-v2 --new  # choose a different name`,
        `git branch -d ${branch}  # delete the existing branch first`,
      ],
    };
  },

  worktreeAlreadyExists(branch: string, existingPath: string): CryError {
    return {
      what: `A worktree already exists for branch '${branch}'.`,
      why: `The branch is already checked out in another worktree at: ${existingPath}`,
      fix: [
        `cry rm ${branch}  # remove the existing worktree`,
        `cry open ${branch}  # open the existing worktree instead`,
      ],
    };
  },

  destinationExists(path: string): CryError {
    return {
      what: `Destination already exists: ${path}`,
      why: 'The target directory for the worktree already exists on disk.',
      fix: [
        `rm -rf "${path}"  # remove the directory`,
        `cry spawn <branch> --path /different/path  # use a different path`,
      ],
    };
  },

  dirtyWorkingTree(branch: string): CryError {
    return {
      what: 'Worktree has uncommitted changes.',
      why: 'There are modified or untracked files that would be lost.',
      fix: [
        'git status  # see what changed',
        'git add . && git commit -m "WIP"  # commit changes',
        `cry rm ${branch} --force  # remove anyway (changes lost)`,
      ],
    };
  },

  ghNotInstalled(): CryError {
    return {
      what: 'GitHub CLI (gh) is not installed.',
      why: 'cry uses the gh CLI to create pull requests. It was not found on your system.',
      fix: [
        'brew install gh  # macOS',
        'sudo apt install gh  # Ubuntu/Debian',
        'https://cli.github.com/',
        'gh auth login  # after installing, authenticate',
      ],
    };
  },

  ghNotAuthenticated(): CryError {
    return {
      what: 'GitHub CLI is not authenticated.',
      why: 'You have gh installed but have not logged in yet.',
      fix: [
        'gh auth login',
        'gh auth status  # verify authentication',
      ],
    };
  },

  noRemoteConfigured(): CryError {
    return {
      what: 'No remote repository configured.',
      why: 'This repository has no origin remote, so there is nowhere to push or create PRs.',
      fix: [
        'git remote add origin https://github.com/user/repo.git',
        'git remote add origin git@github.com:user/repo.git',
        'git remote -v  # list current remotes',
      ],
    };
  },

  pushFailed(branch: string): CryError {
    return {
      what: `Failed to push branch '${branch}'.`,
      why: 'The push was rejected. This could be due to no remote, auth issues, or branch protection.',
      fix: [
        'git remote -v  # check remote is configured',
        'gh auth status  # check GitHub authentication',
        `git push -u origin ${branch}  # try manually`,
        'git fetch origin && git rebase origin/main  # if behind remote',
      ],
    };
  },

  permissionDenied(path: string): CryError {
    return {
      what: `Permission denied: ${path}`,
      why: 'You do not have permission to read or write to this path.',
      fix: [
        `ls -la "${path}"  # check permissions`,
        `sudo chown -R $(whoami) "${path}"  # take ownership (if appropriate)`,
        'Try a different directory with --path',
      ],
    };
  },

  worktreeNotFound(nameOrPath: string, available: string[]): CryError {
    const availableList = available.slice(0, 5).map(a => `  • ${a}`).join('\n');
    return {
      what: `Worktree not found: ${nameOrPath}`,
      why: 'No worktree matches that branch name or path.',
      fix: [
        'cry list  # see all worktrees',
        `Available:\n${availableList}`,
      ],
    };
  },

  sessionNotFound(nameOrId: string): CryError {
    return {
      what: `Session not found: ${nameOrId}`,
      why: 'No session matches that branch name or session ID.',
      fix: [
        'cry list  # see all worktrees and sessions',
        'cry spawn <branch> --new  # create a new session',
      ],
    };
  },

  detachedHead(): CryError {
    return {
      what: 'Cannot determine base branch: HEAD is detached.',
      why: 'You are not on a branch, so cry cannot determine the PR target.',
      fix: [
        'git checkout main  # switch to a branch first',
        'cry spawn <branch> --new --base-branch main  # specify base explicitly',
      ],
    };
  },

  configNotFound(): CryError {
    return {
      what: 'No .cry.json found.',
      why: 'This repository has not been initialized with cry.',
      fix: [
        'cry init  # initialize cry in this repo',
      ],
    };
  },

  agentNotFound(agent: string): CryError {
    return {
      what: `Agent command not found: ${agent}`,
      why: `The '${agent}' command is not installed or not in your PATH.`,
      fix: agent === 'claude' ? [
        'npm install -g @anthropic-ai/claude-code',
        'https://docs.anthropic.com/claude-code',
      ] : agent === 'cursor' ? [
        'Download Cursor from https://cursor.sh',
        'Ensure cursor CLI is in your PATH',
      ] : [
        `Install ${agent} or update agentCommand in .cry.json`,
      ],
    };
  },

  editorNotFound(editor: string): CryError {
    return {
      what: `Editor command not found: ${editor}`,
      why: `The '${editor}' command is not installed or not in your PATH.`,
      fix: editor === 'code' ? [
        'Install VS Code from https://code.visualstudio.com',
        'Run "Shell Command: Install code in PATH" from VS Code',
      ] : [
        `Install ${editor} or update editorCommand in .cry.json`,
      ],
    };
  },

  cannotRemoveMainWorktree(): CryError {
    return {
      what: 'Cannot remove the main worktree.',
      why: 'This is your primary repository checkout. Removing it would delete your repo.',
      fix: [
        'cry list  # see worktrees - the main one cannot be removed',
        'Use cry rm <branch> to remove other worktrees',
      ],
    };
  },

  worktreeMissing(path: string, branch: string): CryError {
    return {
      what: `Worktree no longer exists: ${path}`,
      why: 'The worktree directory was deleted but the session manifest still exists.',
      fix: [
        `cry spawn ${branch} --new  # recreate the worktree`,
        'cry gc  # clean up stale sessions',
        'cry prune  # clean up git worktree references',
      ],
    };
  },
};
