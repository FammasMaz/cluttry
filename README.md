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

# Spawn a new worktree for a feature branch
cry spawn feature-auth --new

# List all worktrees
cry list

# Remove a worktree when done
cry rm feature-auth --with-branch
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
- Updates `.gitignore` to ignore local config and `.worktrees/`

### `cry spawn <branch>`

Create a worktree for a branch with automatic secrets handling.

```bash
cry spawn <branch> [options]

Options:
  -n, --new            Create a new branch
  -p, --path <dir>     Explicit worktree path
  -b, --base <dir>     Base directory for worktrees
  -m, --mode <mode>    Secret handling: copy, symlink, or none (default: copy)
  -r, --run <cmd>      Command to run after creation
  -a, --agent <agent>  Launch agent: claude or none (default: none)
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

## Using with AI Agents

### Recommended Pattern

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

5. **Clean up when done:**
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

# Run tests
npm test

# Watch mode
npm run dev
```

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
