# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2025-01-09

### Added

- **Shell completions** for bash, zsh, and fish (`cry completions <shell>`)
- **`cry gc`** command to clean up stale session manifests
- **`cry resume`** command to resume sessions by branch name or ID
- **`cry finish`** command with full commit wizard and PR creation
- **`--finish-on-exit`** flag for spawn to show finish menu when agent exits
- **`--base-branch`** option for spawn to specify PR target branch
- **`cry explain-copy`** command to preview which files will be copied
- **`--dry-run`** flag for spawn to preview without creating worktree
- **Session manifests** stored in `.cry/sessions/` for tracking
- **Structured error messages** with What/Why/Fix format for all failures
- **`cry shell`** command for shell integration (`crycd` function)

### Changed

- **README rewritten** with AI session lifecycle positioning
- **Improved `cry open`** with agent/editor fallback support
- **Hardened base branch detection** using current branch or origin/HEAD
- **Better CLI help** with examples, finish flow, and safety notes

### Fixed

- Proper handling of detached HEAD state
- Commander.js `--no-cleanup` flag parsing
- Git commit messages with spaces

## [1.0.3] - 2024-12-XX

### Added

- Initial release
- `cry spawn` - Create worktrees with secrets handling
- `cry list` - List all worktrees
- `cry rm` - Remove worktrees safely
- `cry open` - Open worktrees in editor
- `cry init` - Initialize configuration
- `cry doctor` - Check configuration health
- `cry prune` - Clean up git worktree references
- Automatic secrets copying (gitignored files only)
- Post-create hooks support
- Agent launch integration (Claude, Cursor)

---

## Version Bump Instructions

### For maintainers

1. Update version in `package.json`
2. Update version in `src/index.ts` (`.version('X.Y.Z')`)
3. Add entry to this CHANGELOG
4. Commit: `git commit -am "chore: bump version to X.Y.Z"`
5. Tag: `git tag vX.Y.Z`
6. Push: `git push && git push --tags`
7. Publish: `npm publish`

### Versioning guidelines

- **MAJOR** (X.0.0): Breaking changes to CLI interface or config format
- **MINOR** (0.X.0): New commands, flags, or features
- **PATCH** (0.0.X): Bug fixes, documentation, internal improvements
