# cluttry

AI session lifecycle in git worktrees.

**CLI command:** `cry`

## 60-Second Quickstart

```bash
# Install
npm install -g cluttry

# Initialize in your repo
cd your-repo
cry init

# One command: create worktree → launch Claude → finish when done
cry feat-login claude --finish-on-exit
```

That's it. When Claude exits, you'll see a menu to commit, create a PR, and clean up.

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

# Full lifecycle in one command
cry feat-auth claude --finish-on-exit
```

### 2. Work

Your AI agent works in the isolated worktree. Each worktree has:
- Its own branch
- Copy of your `.env` and secret files
- Independent git state

Run multiple sessions in parallel—each in its own terminal.

### 3. Finish (PR-first)

From inside the worktree:

```bash
cry finish
```

Interactive flow:
1. Shows session summary (branch, commits, diff stats)
2. If dirty: offers to commit (with suggested message from branch name)
3. Pushes branch and creates PR via `gh` CLI
4. Offers cleanup prompt

Non-interactive:
```bash
cry finish -m "Add user authentication" --cleanup
```

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
  "hooks": { "postCreate": ["npm install"] },
  "agentCommand": "claude"
}
```

| Key | Description |
|-----|-------------|
| `include` | Glob patterns for files to copy to worktrees |
| `defaultMode` | `copy`, `symlink`, or `none` |
| `hooks.postCreate` | Commands to run after spawn |
| `agentCommand` | Agent CLI command (default: `claude`) |
| `editorCommand` | Editor command (default: `code`) |

Machine-specific overrides go in `.cry.local.json` (gitignored).

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

### Copy vs Symlink

| Mode | Behavior |
|------|----------|
| `copy` | Independent copies. Safe default. |
| `symlink` | Linked to original. Changes sync everywhere. |
| `none` | Nothing copied. Set up secrets manually. |

## Commands

### Session Lifecycle

| Command | Purpose |
|---------|---------|
| `cry spawn <branch>` | Create worktree |
| `cry finish` | Commit → PR → cleanup |
| `cry rm <branch>` | Remove worktree |

### Navigation

| Command | Purpose |
|---------|---------|
| `cry list` | List all worktrees |
| `cry open <branch>` | Open in agent/editor |
| `cry resume <branch>` | Resume session |

### Maintenance

| Command | Purpose |
|---------|---------|
| `cry gc` | Clean stale sessions |
| `cry prune` | Clean git worktree refs |
| `cry doctor` | Check configuration |

## Key Flags

### `cry spawn`

```
-n, --new               Create new branch
-a, --agent <agent>     Launch agent (claude, cursor, none)
--finish-on-exit        Show finish menu when agent exits
--base-branch <branch>  PR target branch
-m, --mode <mode>       Secret handling (copy, symlink, none)
-r, --run <cmd>         Run command after spawn
--dry-run               Preview without creating
```

### `cry finish`

```
-m, --message <msg>     Commit with message (non-interactive)
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

| Task | git worktree | cry |
|------|--------------|-----|
| Create worktree | `git worktree add -b feat ../feat` | `cry feat` |
| Copy secrets | Manual copy | Automatic |
| Run setup | `cd ../feat && npm install` | `--run "npm install"` |
| Launch agent | `cd ../feat && claude` | `--agent claude` |
| Create PR | Switch context, push, open browser | `cry finish` |
| Cleanup | `git worktree remove`, `git branch -d` | `cry rm --with-branch` |

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

For Claude Code, add to `.clauderc`:
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
