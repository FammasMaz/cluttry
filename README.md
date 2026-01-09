# cluttry

Git worktrees made painless for **vibecoders** running parallel AI-agent sessions.

**CLI command:** `cry`

## Why This Exists

When working with AI coding assistants like Claude, you often want to run multiple parallel sessions on different branches. Git worktrees are perfect for this—each worktree is a separate checkout where an agent can work independently.

But managing worktrees manually is tedious:
- You have to remember the `git worktree` commands
- You need to copy your `.env` files and secrets to each worktree
- You want to run setup commands like `npm install` automatically
- You want to launch your AI agent in the new worktree

**cry** solves all of this with one command.

## Installation

### Using Bun (recommended)

```bash
# Install globally with Bun
bun add -g cluttry

# Or clone and link
git clone https://github.com/your-username/cluttry.git
cd cluttry
bun install
bun link
```

### Using npm

```bash
# Install globally with npm
npm install -g cluttry

# Or clone and link
git clone https://github.com/your-username/cluttry.git
cd cluttry
npm install
npm link
```

**Requirements:** Bun 1.0+ or Node.js 18+, Git 2.5+

## Quick Start

```bash
# Initialize cry in your repository
cd your-repo
cry init

# Spawn a new worktree (shorthand)
cry feature-auth

# Or spawn with an AI agent
cry feature-auth claude

# List all worktrees
cry list

# Remove a worktree when done
cry rm feature-auth --with-branch
```

## Shorthand Syntax

The fastest way to start a new session:

```bash
# Create worktree for new branch
cry <branch-name>

# Create worktree and launch Claude
cry <branch-name> claude

# Create worktree and launch Cursor
cry <branch-name> cursor
```

**Examples:**

```bash
cry feat-oauth              # Creates .worktrees/feat-oauth
cry fix/login-bug           # Creates .worktrees/fix-login-bug
cry feat-api claude         # Creates worktree + launches Claude
cry refactor cursor         # Creates worktree + launches Cursor
```

The shorthand is equivalent to:
```bash
cry feat-auth         →  cry spawn feat-auth --new
cry feat-auth claude  →  cry spawn feat-auth --new --agent claude
```

## Commands

### `cry init`

Initialize cry configuration in your repository.

```bash
cry init [--force]
```

Creates:
- `.cry.json` — tracked config with defaults
- `.cry.local.json` — gitignored local overrides
- Updates `.gitignore` to ignore local config, `.worktrees/`, and `.cry/`

### `cry spawn <branch>`

Create a worktree for a branch with automatic secrets handling.

```bash
cry spawn <branch> [options]

Options:
  -n, --new            Create a new branch
  -p, --path <dir>     Explicit worktree path
  -b, --base <dir>     Base directory for worktrees
  --base-branch <branch>  Base branch for PRs (default: current branch)
  -m, --mode <mode>    Secret handling: copy, symlink, or none (default: copy)
  -r, --run <cmd>      Command to run after creation
  -a, --agent <agent>  Launch agent: claude or none (default: none)
  --finish-on-exit     After agent exits, show finish menu (commit, PR, cleanup)
  --dry-run            Show what would happen without creating the worktree
```

**Examples:**

```bash
# Create worktree for existing branch
cry spawn feature-auth

# Create new branch and worktree
cry spawn feature-oauth --new

# Spawn with npm install and launch Claude
cry spawn feature-api --new --run "npm install" --agent claude

# Use symlinks instead of copying secrets
cry spawn bugfix-123 --mode symlink

# Custom worktree location
cry spawn hotfix --path ~/worktrees/myrepo-hotfix

# Full lifecycle: spawn, work with agent, then finish
cry spawn feat-login --new --agent claude --finish-on-exit

# Preview what files will be copied (dry run)
cry spawn feature-test --new --dry-run

# Specify base branch for PR target
cry spawn feature-api --new --base-branch develop
```

### `cry list`

List all worktrees with their status.

```bash
cry list [--json]
```

Shows: branch name, commit SHA, dirty status, last modified time, and path.

### `cry open <branch-or-path>`

Navigate to or run a command in a worktree.

```bash
cry open <branch-or-path> [--cmd <cmd>]
```

**Examples:**

```bash
# Show path and cd instructions
cry open feature-auth

# Run a command in the worktree
cry open feature-auth --cmd "npm test"

# Open in VS Code
cry open feature-auth --cmd "code ."
```

### `cry rm <branch-or-path>`

Remove a worktree safely.

```bash
cry rm <branch-or-path> [options]

Options:
  -b, --with-branch    Also delete the branch
  -f, --force          Force removal even if dirty
  -y, --yes            Skip confirmation prompts
```

**Examples:**

```bash
# Remove worktree only
cry rm feature-auth

# Remove worktree and delete branch
cry rm feature-auth --with-branch

# Force remove dirty worktree
cry rm feature-auth --force --yes
```

### `cry prune`

Clean up stale worktree references.

```bash
cry prune
```

Runs `git worktree prune` and shows what was cleaned.

### `cry finish`

Complete a session: show summary, optionally create a PR, and cleanup. Run this from within a worktree when you're ready to wrap up.

```bash
cry finish [options]

Options:
  -j, --json           Output summary as JSON (no actions taken)
  -m, --message <msg>  Commit message (stages all, commits non-interactively)
  --skip-commit        Skip commit step entirely (still safe)
  --dry-run            Show what would happen without executing
  --pr                 Force PR creation path
  --cleanup            Auto-cleanup after PR (skip prompt)
  --skip-cleanup       Skip cleanup prompt entirely
  --non-interactive    Never prompt; errors on dirty unless --allow-dirty
  --allow-dirty        Allow proceeding with uncommitted changes
  --delete-branch      Delete branch during cleanup (with --cleanup)
```

**Default interactive flow:**
1. Shows session summary (branch, commits, diff stats)
2. If working tree is dirty, offers choices: view diff, commit changes, or abort
3. **Commit wizard** (when committing):
   - Shows staged vs unstaged files
   - Offers: stage all + commit, commit only staged, or abort
   - Suggests commit message based on branch name (e.g., `feat-login` → "Login")
4. If clean with commits, creates PR via `gh` (if available) or shows manual instructions
5. Offers cleanup prompt: remove worktree and optionally delete branch

**Examples:**

```bash
# Interactive flow (default)
cry finish

# Commit with provided message (non-interactive commit)
cry finish --message "Add user authentication"

# Skip commit step, just create PR from existing commits
cry finish --skip-commit

# Non-interactive with auto-cleanup
cry finish --non-interactive --cleanup

# Preview what would happen
cry finish --dry-run

# Output summary as JSON (for scripting)
cry finish --json

# Force proceed with uncommitted changes
cry finish --non-interactive --allow-dirty --skip-cleanup
```

**Sample output:**
```
Session Summary

  Branch:      feature-auth
  Base:        main
  Worktree:    /repo/.worktrees/feature-auth
  Session ID:  m5abc123-deadbeef

Working Tree Status:
  ✓ Clean

Changes vs main:
  3 files changed, 45 insertions(+), 12 deletions(-)

Commits:
  ↑ 2 ahead of main
    abc1234 Add authentication middleware
    def5678 Add login form component

Creating pull request...
✓ PR created: https://github.com/owner/repo/pull/42

Remove worktree and clean up? [y/N]
```

**Safety guarantees:**
- Never auto-merges PRs
- Never deletes anything without confirmation (or explicit `--cleanup`)
- Exits with code 0 when printing manual instructions (not an error)

### `cry doctor`

Check your cry configuration for issues.

```bash
cry doctor
```

Checks:
- Config file exists
- Local config is gitignored
- `.worktrees/` is gitignored
- Include files are safely gitignored
- Agent command is available

### `cry explain-copy`

Explain which files will be copied/symlinked and which are blocked. This helps you understand the security model before spawning.

```bash
cry explain-copy [--json]
```

**Output shows:**
- **Will copy**: Files that are gitignored and match include patterns (safe to copy)
- **Blocked**: Files that are tracked or not ignored (refused for safety)
- **Warnings**: If include patterns match tracked files

**Example output:**

```
Copy Plan

Include patterns:
  • .env
  • .env.*

✓ Will copy (2 files):
  • .env
      gitignored and exists
  • .env.local
      gitignored and exists

⚠ Warnings:
  • Pattern matches tracked file: README.md — tracked files are NEVER copied

✗ Blocked (1 file):
  • 🔒 README.md
      File is tracked by git (would be committed)
```

This is equivalent to what `cry spawn --dry-run` shows for the copy plan.

## Configuration

### `.cry.json` (tracked)

```json
{
  "defaultMode": "copy",
  "include": [".env", ".env.*", ".env.local", "config/secrets/*.json"],
  "worktreeBaseDir": null,
  "hooks": {
    "postCreate": ["npm install"]
  },
  "agentCommand": "claude"
}
```

| Option | Description |
|--------|-------------|
| `defaultMode` | How to handle secrets: `copy`, `symlink`, or `none` |
| `include` | Glob patterns for files to copy/symlink |
| `worktreeBaseDir` | Base directory for worktrees (default: `.worktrees/`) |
| `hooks.postCreate` | Commands to run after spawning |
| `agentCommand` | Command to launch AI agent |

### `.cry.local.json` (gitignored)

Machine-specific overrides:

```json
{
  "worktreeBaseDir": "/home/user/worktrees",
  "include": ["config/local-secrets.json"],
  "hooks": {
    "postCreate": ["npm install", "./setup-dev.sh"]
  },
  "agentCommand": "cursor"
}
```

Local config merges with tracked config:
- `include` arrays are concatenated
- `hooks.postCreate` arrays are concatenated
- Other values override

## Security Model

**cry is safe by default.** It enforces strict rules about which files can be copied or symlinked:

### Rule 1: Never Copy Tracked Files

Files that are tracked by git are **never** copied or symlinked. This prevents accidentally exposing source code or committing secrets that should stay local.

```bash
# Checked with: git ls-files --error-unmatch <file>
# If file is tracked → REFUSED
```

### Rule 2: Only Copy Ignored Files

Files must be explicitly ignored by git (in `.gitignore`) to be eligible for copy/symlink.

```bash
# Checked with: git check-ignore -q <file>
# If file is NOT ignored → REFUSED
```

### Implications

- Your `.env` files must be in `.gitignore` ✓
- Your OAuth JSON files must be in `.gitignore` ✓
- Source files can never be in `include` patterns ✗

### Copy vs Symlink Tradeoffs

| Mode | Pros | Cons |
|------|------|------|
| `copy` | Independent copies, safe if original changes | Takes disk space, copies can drift |
| `symlink` | Always in sync, saves space | Changes affect all worktrees |
| `none` | No secrets copied | Must set up secrets manually |

**Recommendation:** Use `copy` (default) for most cases. Use `symlink` if you frequently update secrets and want all worktrees to stay in sync.

### Debugging the Security Model

Use these commands to understand what files will or won't be copied:

```bash
# See full copy plan with explanations
cry explain-copy

# Preview spawn without making changes
cry spawn feature-test --new --dry-run
```

Both commands show:
- Which files **will** be copied (safe: gitignored + in include patterns)
- Which files are **blocked** (tracked or not ignored)
- **Warnings** if include patterns match tracked files

**Example: Diagnosing a blocked file**

```bash
$ cry explain-copy
...
✗ Blocked (1 file):
  • ⚠ secrets.txt
      File is not ignored by git (could be accidentally committed)
```

**Fix:** Add the file to `.gitignore`:

```bash
echo "secrets.txt" >> .gitignore
```

## Using with AI Agents

### Full Lifecycle (Recommended)

The `--finish-on-exit` flag provides a complete session lifecycle in one command:

```bash
cry feat-login claude --finish-on-exit
```

This command:
1. Creates a new worktree for branch `feat-login`
2. Copies secrets to the worktree
3. Launches Claude Code in the worktree
4. **When Claude exits**, shows a menu:
   - **f) Finish session** — commit changes, create PR, cleanup
   - **c) Cleanup only** — remove worktree without PR
   - **n) Do nothing** — exit, finish later with `cry finish`

**Sample session:**
```
$ cry feat-login claude --finish-on-exit

Creating worktree
  Branch: feat-login (new)
  Path:   /repo/.worktrees/feat-login
  Mode:   copy

✓ Worktree created
✓ Session created: m5abc123-deadbeef

Launching claude...

# ... Claude Code session runs here ...

Agent Session Ended
  Agent exited successfully

What would you like to do?
  f) Finish session (commit, PR, cleanup)
  c) Cleanup only (remove worktree)
  n) Do nothing (exit)
Choice [f/c/n]: f

# ... finish flow runs (commit wizard, PR creation, cleanup) ...
```

### Manual Pattern

If you prefer more control, use separate commands:

1. **Initialize once per repo:**
   ```bash
   cry init
   ```

2. **Configure your secrets:**
   Edit `.cry.json` to include your secret files:
   ```json
   {
     "include": [".env", ".env.local", "config/oauth*.json"]
   }
   ```

3. **Spawn a worktree for each task:**
   ```bash
   cry spawn fix-auth-bug --new --run "npm install" --agent claude
   ```

4. **Work with your AI agent in the worktree**

5. **Finish the session:**
   ```bash
   cry finish
   ```

6. **Or clean up manually:**
   ```bash
   cry rm fix-auth-bug --with-branch
   ```

### Denying AI Access to Secrets

If you want to prevent AI agents from reading your secret files:

**For Claude Code:** Add to your `.clauderc`:
```json
{
  "deny": [".env", ".env.*", "config/secrets/**"]
}
```

**For other agents:** Check their documentation for file access controls.

### Multiple Parallel Sessions

Run multiple agents on different features simultaneously:

```bash
# Terminal 1
cry spawn feature-auth --new --agent claude

# Terminal 2
cry spawn feature-payments --new --agent claude

# Terminal 3
cry spawn bugfix-123 --agent claude
```

Each agent works in an isolated worktree with its own copy of secrets.

## Project Structure

```
.worktrees/           # Default worktree location (gitignored)
├── feature-auth/     # Worktree for feature-auth branch
├── feature-payments/ # Worktree for feature-payments branch
└── bugfix-123/       # Worktree for bugfix-123 branch

.cry.json             # Tracked config
.cry.local.json       # Local overrides (gitignored)
```

## Troubleshooting

### "Not a git repository"

Run cry commands from within a git repository.

### "Worktree already exists for branch"

A worktree already exists for that branch. Remove it first:
```bash
cry rm <branch>
```

### "Destination already exists"

The target directory exists. Either remove it or specify a different path:
```bash
cry spawn feature --path ./different-path
```

### "File is tracked by git"

A file in your `include` patterns is tracked by git. Remove it from tracking:
```bash
git rm --cached <file>
echo "<file>" >> .gitignore
```

### "File is not ignored by git"

A file in your `include` patterns isn't in `.gitignore`. Add it:
```bash
echo "<file>" >> .gitignore
```

### Agent command not found

Install the AI agent CLI or update `agentCommand` in your config:
```bash
# For Claude
npm install -g @anthropic-ai/claude-code

# Or override in .cry.local.json
{
  "agentCommand": "your-agent-command"
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run all tests (unit + integration)
npm test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npx vitest run tests/paths.test.ts

# Run tests matching a pattern
npx vitest run -t "sanitizeBranchName"

# Run with coverage
npm run test:coverage

# TypeScript watch mode
npm run dev
```

### Test Structure

- `tests/*.test.ts` — Unit tests (mocked, fast)
- `tests/integration.test.ts` — Integration tests (real git repos, ~5s)
- `tests/helpers/integration.ts` — Test utilities for creating repos, running CLI

Integration tests create temporary git repositories, run the actual CLI binary, and verify behavior end-to-end. They are deterministic and require no network access.

## Tech Stack

- **Language:** TypeScript (Node.js)
- **CLI Framework:** Commander.js
- **Testing:** Vitest
- **Dependencies:** Minimal (commander, glob)

### Why TypeScript/Node.js?

1. **Accessible:** Most developers working with web projects have Node.js installed
2. **Cross-platform:** Works on macOS, Linux, and Windows
3. **Contribution-friendly:** TypeScript is widely known and well-typed
4. **Rich ecosystem:** Excellent CLI tooling available

## License

MIT

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## Acknowledgments

Inspired by the need to run parallel AI coding sessions efficiently. Built for vibecoders everywhere.
