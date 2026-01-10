# cluttry

**Worktrees for coding agents. Safe by default.**

**CLI command:** `cry`

## 60-Second Quickstart

```bash
# Install
npm install -g cluttry

# Initialize in your repo
cd your-repo
cry init

# One command: create worktree → launch Claude → auto-finish when done
cry feat-login claude --auto
```

That's it. When Claude exits, cry automatically commits, creates a PR, and cleans up.

## The Lifecycle

Every AI coding session follows four phases:

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  START  │ →  │  WORK   │ →  │ FINISH  │ →  │ CLEANUP │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
cry spawn      (agent works)   cry finish     (automatic)
```

### 1. Start

Create an isolated worktree with secrets copied:

```bash
# Shorthand (recommended)
cry feat-auth claude

# Explicit
cry spawn feat-auth --new --agent claude

# Full autopilot: agent exits → commit → PR → cleanup
cry feat-auth claude --auto

# Interactive finish menu when agent exits
cry feat-auth claude --finish-on-exit
```

### 2. Work

Your AI agent works in the isolated worktree. Each worktree has:

- Its own branch
- Copy of your `.env` and secret files (or injected env vars)
- Independent git state

Run multiple sessions in parallel—each in its own terminal.

### 3. Finish (PR-first or Cherry-pick)

From inside the worktree:

```bash
cry finish
```

Interactive flow:

1. Runs `preFinish` hooks (tests, lint, etc.)
2. Shows session summary (branch, commits, diff stats)
3. If dirty: offers to commit (with suggested message from branch name)
4. Pushes branch and creates PR via `gh` CLI
5. Offers merge options (PR only, local merge, or gh merge)
6. Runs `postFinish` hooks
7. Offers cleanup prompt

Non-interactive:

```bash
cry finish -m "Add user authentication" --cleanup
```

#### Cherry-pick workflow

As an alternative to creating a PR, you can cherry-pick your commits directly onto the base branch:

```bash
cry finish --cherry-pick
```

This will:

1. Get all commits ahead of the base branch
2. Switch to the base branch in the main worktree
3. Cherry-pick each commit in order
4. Push the updated base branch to origin

This is useful when you want to bypass the PR workflow and apply changes directly.

### 4. Cleanup

Handled automatically by `cry finish`, or manually:

```bash
cry rm feat-auth --with-branch
```

## Installation

```bash
npm install -g cluttry
# or
bun add -g cluttry
```

**Requirements:** Node.js 18+ or Bun 1.0+, Git 2.5+

### Shell Completions

```bash
# Fish
cry completions fish > ~/.config/fish/completions/cry.fish

# Bash
cry completions bash >> ~/.bashrc

# Zsh
cry completions zsh > ~/.zsh/completions/_cry
```

## Configuration

After `cry init`, edit `.cry.json`:

```json
{
  "include": [".env", ".env.*", "config/secrets.json"],
  "defaultMode": "copy",
  "hooks": {
    "postCreate": ["npm install"],
    "preFinish": ["npm test", "npm run lint"],
    "postFinish": ["echo 'PR created!'"],
    "preMerge": ["npm run build"]
  },
  "agentCommand": "claude"
}
```

| Key                | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `include`          | Glob patterns for files to copy/inject to worktrees   |
| `defaultMode`      | `copy`, `symlink`, `inject`, or `none`                |
| `hooks.postCreate` | Commands to run after spawn                           |
| `hooks.preFinish`  | Commands to run before finish (tests, lint)           |
| `hooks.postFinish` | Commands to run after PR creation                     |
| `hooks.preMerge`   | Commands to run before merge attempts                 |
| `agentCommand`     | Agent CLI command (default: `claude`)                 |
| `editorCommand`    | Editor command (default: `code`)                      |
| `injectNonEnv`     | For inject mode: `skip` or `symlink` non-dotenv files |
| `agents`           | Agent presets (see below)                             |

Machine-specific overrides go in `.cry.local.json` (gitignored).

### Agent Presets

Configure per-agent behavior:

```json
{
  "agents": {
    "claude": {
      "command": "claude",
      "deny": [".env", ".env.*"],
      "finishOnExitDefault": true
    },
    "cursor": {
      "command": "cursor",
      "args": ["."],
      "finishOnExitDefault": false
    }
  }
}
```

Built-in presets for `claude` and `cursor` are provided. Override or add your own.

## Security Model

**Tracked files are never copied.** This is enforced, not optional.

For a file to be copied to a worktree, it must pass both checks:

1. **Not tracked** by git (`git ls-files` returns nothing)
2. **Ignored** by git (listed in `.gitignore`)

This means:

- Your `.env` files copy automatically (they're gitignored)
- Your source code stays in git (tracked files can't be copied)
- Accidentally tracked secrets won't propagate

### Verify before spawning

```bash
# See exactly what will be copied
cry explain-copy

# Preview spawn without changes
cry spawn feat-test --new --dry-run
```

### Copy vs Symlink vs Inject

| Mode      | Behavior                                                                    |
| --------- | --------------------------------------------------------------------------- |
| `copy`    | Independent copies. Safe default.                                           |
| `symlink` | Linked to original. Changes sync everywhere.                                |
| `inject`  | **No files copied.** Env vars injected into commands. Safest for AI agents. |
| `none`    | Nothing copied. Set up secrets manually.                                    |

**Inject mode** is recommended when running AI agents:

- Parses `.env` files and injects variables into hooks and agent commands
- No secret files exist in the worktree for the agent to read
- Non-dotenv files are skipped (or optionally symlinked via `injectNonEnv: "symlink"`)

## Commands

### Session Lifecycle

| Command              | Purpose               |
| -------------------- | --------------------- |
| `cry spawn <branch>` | Create worktree       |
| `cry finish`         | Commit → PR → cleanup |
| `cry rm <branch>`    | Remove worktree       |

### Navigation

| Command               | Purpose              |
| --------------------- | -------------------- |
| `cry list`            | List all worktrees   |
| `cry open <branch>`   | Open in agent/editor |
| `cry resume <branch>` | Resume session       |

### Maintenance

| Command      | Purpose                 |
| ------------ | ----------------------- |
| `cry gc`     | Clean stale sessions    |
| `cry prune`  | Clean git worktree refs |
| `cry doctor` | Check configuration     |

## Key Flags

### `cry spawn`

```
-n, --new               Create new branch
-a, --agent <agent>     Launch agent (claude, cursor, or custom preset)
--finish-on-exit        Show finish menu when agent exits
--auto                  Autopilot: auto-commit, PR, cleanup when agent exits
--auto-merge            With --auto: also merge PR via gh
--auto-commit-message   With --auto: custom commit message
--base-branch <branch>  PR target branch
-m, --mode <mode>       Secret handling (copy, symlink, inject, none)
-r, --run <cmd>         Run command after spawn
--dry-run               Preview without creating
```

### `cry finish`

```
-m, --message <msg>     Commit with message (non-interactive)
--skip-hooks            Skip all hooks (preFinish, postFinish, preMerge)
--cherry-pick           Cherry-pick commits to base branch instead of creating PR
--merge                 Merge locally into base branch after PR
--pr-merge              Merge PR via GitHub (gh pr merge)
--no-merge              Skip merge prompt (PR only)
--cleanup               Auto-cleanup after PR
--skip-commit           Skip commit step
--non-interactive       Never prompt
--dry-run               Preview without executing
```

### `cry rm`

```
-b, --with-branch       Also delete the branch
-f, --force             Force remove dirty worktree
-y, --yes               Skip confirmation
```

## FAQ

### Why not just `git worktree`?

| Task            | git worktree                           | cry                    |
| --------------- | -------------------------------------- | ---------------------- |
| Create worktree | `git worktree add -b feat ../feat`     | `cry feat`             |
| Copy secrets    | Manual copy                            | Automatic              |
| Run setup       | `cd ../feat && npm install`            | `--run "npm install"`  |
| Launch agent    | `cd ../feat && claude`                 | `--agent claude`       |
| Create PR       | Switch context, push, open browser     | `cry finish`           |
| Cleanup         | `git worktree remove`, `git branch -d` | `cry rm --with-branch` |

cry handles the lifecycle. git worktree is just step 1.

### Can I use this without AI agents?

Yes. Skip `--agent` and use worktrees for any parallel work:

```bash
cry hotfix-123
# ... work manually ...
cry finish
```

### What if `gh` isn't installed?

`cry finish` prints manual PR instructions and exits cleanly (exit 0). Install `gh` for automatic PR creation:

```bash
brew install gh && gh auth login
```

### How do I prevent AI from reading secrets?

**Best option: Use inject mode** (no files copied to worktree):

```bash
cry spawn feat-auth --new --agent claude --mode inject
```

Or configure it as default in `.cry.json`:

```json
{ "defaultMode": "inject" }
```

For Claude Code specifically, you can also add to `.clauderc`:

```json
{ "deny": [".env", ".env.*"] }
```

### Can I change the worktree location?

Default is `.worktrees/` in your repo. Override:

```bash
# Per-spawn
cry spawn feat --path ~/worktrees/myrepo-feat

# Globally in .cry.local.json
{ "worktreeBaseDir": "/home/user/worktrees" }
```

## Troubleshooting

### "Not a git repository"

Run cry from inside a git repo.

### "Destination already exists"

The worktree path exists. Remove it or use `--path`:

```bash
rm -rf .worktrees/feat-auth
# or
cry spawn feat-auth --path .worktrees/feat-auth-v2
```

### "A worktree already exists for branch"

Remove the existing worktree first:

```bash
cry rm feat-auth
```

### "File is tracked by git" / "File is not ignored"

Files in `include` must be gitignored and untracked:

```bash
# Add to .gitignore
echo "secrets.json" >> .gitignore

# If already tracked, untrack it
git rm --cached secrets.json
```

### "Worktree has uncommitted changes"

Commit or discard changes before removing:

```bash
cry rm feat-auth --force  # discards changes
```

### Agent command not found

Install the agent CLI:

```bash
# Claude
npm install -g @anthropic-ai/claude-code

# Or set custom command
echo '{"agentCommand": "your-agent"}' > .cry.local.json
```

### PR creation failed

Check GitHub CLI auth:

```bash
gh auth status
gh auth login  # if needed
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
