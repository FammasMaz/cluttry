/**
 * Shell completion generators for cry CLI
 *
 * Generates completion scripts for bash, zsh, and fish shells.
 */

// All subcommands with descriptions
export const COMMANDS = [
  { name: 'init', description: 'Initialize cry in the current repository' },
  { name: 'spawn', description: 'Create a worktree for a branch' },
  { name: 'list', description: 'List all worktrees' },
  { name: 'ls', description: 'List all worktrees (alias)' },
  { name: 'open', description: 'Open a worktree in agent or editor' },
  { name: 'rm', description: 'Remove a worktree' },
  { name: 'prune', description: 'Clean up stale git worktree references' },
  { name: 'doctor', description: 'Check repository health' },
  { name: 'explain-copy', description: 'Show which files would be copied' },
  { name: 'shell', description: 'Print shell integration snippet' },
  { name: 'finish', description: 'Complete session with PR and cleanup' },
  { name: 'resume', description: 'Resume an existing session' },
  { name: 'gc', description: 'Clean up stale sessions' },
  { name: 'completions', description: 'Generate shell completions' },
];

// Common options that appear on multiple commands
const COMMON_OPTIONS = [
  { flag: '--help', short: '-h', description: 'Show help' },
];

// Command-specific options
export const COMMAND_OPTIONS: Record<string, Array<{ flag: string; short?: string; description: string }>> = {
  spawn: [
    { flag: '--new', short: '-n', description: 'Create new branch' },
    { flag: '--path', short: '-p', description: 'Custom worktree path' },
    { flag: '--base', description: 'Base directory for worktrees' },
    { flag: '--base-branch', description: 'Base branch for PR' },
    { flag: '--mode', short: '-m', description: 'Secret handling mode' },
    { flag: '--agent', short: '-a', description: 'Launch agent after spawn' },
    { flag: '--run', short: '-r', description: 'Run command after spawn' },
    { flag: '--finish-on-exit', description: 'Show finish menu when agent exits' },
    { flag: '--dry-run', description: 'Show what would happen' },
  ],
  finish: [
    { flag: '--json', description: 'Output as JSON' },
    { flag: '--dry-run', description: 'Show what would happen' },
    { flag: '--pr', description: 'Create PR even if no commits' },
    { flag: '--cleanup', description: 'Auto cleanup after PR' },
    { flag: '--no-cleanup', description: 'Skip cleanup prompt' },
    { flag: '--non-interactive', description: 'Never prompt' },
    { flag: '--allow-dirty', description: 'Allow uncommitted changes' },
    { flag: '--delete-branch', description: 'Delete branch on cleanup' },
    { flag: '--message', short: '-m', description: 'Commit message' },
    { flag: '--skip-commit', description: 'Skip commit step' },
  ],
  rm: [
    { flag: '--with-branch', short: '-b', description: 'Also delete branch' },
    { flag: '--force', short: '-f', description: 'Force remove dirty worktree' },
    { flag: '--yes', short: '-y', description: 'Skip confirmation' },
  ],
  open: [
    { flag: '--cmd', short: '-c', description: 'Custom command to run' },
    { flag: '--path-only', description: 'Print path only' },
    { flag: '--agent', short: '-a', description: 'Open in agent (claude)' },
    { flag: '--editor', short: '-e', description: 'Open in editor (code)' },
  ],
  resume: [
    { flag: '--agent', short: '-a', description: 'Launch agent in session' },
    { flag: '--cd', description: 'Print cd command' },
  ],
  gc: [
    { flag: '--dry-run', description: 'Show what would be cleaned' },
    { flag: '--yes', short: '-y', description: 'Skip confirmation' },
    { flag: '--manifests-only', description: 'Only clean manifests' },
  ],
  list: [
    { flag: '--json', description: 'Output as JSON' },
  ],
  init: [
    { flag: '--force', short: '-f', description: 'Overwrite existing config' },
  ],
  completions: [
    { flag: '--shell', short: '-s', description: 'Shell type (bash, zsh, fish)' },
  ],
};

/**
 * Generate Fish shell completions
 */
export function generateFishCompletions(): string {
  const lines: string[] = [
    '# Fish completions for cry CLI',
    '# Install: cry completions fish > ~/.config/fish/completions/cry.fish',
    '',
    '# Disable file completions by default',
    'complete -c cry -f',
    '',
    '# Subcommands',
  ];

  // Add subcommand completions
  for (const cmd of COMMANDS) {
    lines.push(`complete -c cry -n "__fish_use_subcommand" -a "${cmd.name}" -d "${cmd.description}"`);
  }

  lines.push('');
  lines.push('# Command-specific options');

  // Add command-specific options
  for (const [cmd, options] of Object.entries(COMMAND_OPTIONS)) {
    for (const opt of options) {
      const flagName = opt.flag.replace(/^--/, '');
      const shortFlag = opt.short ? `-s ${opt.short.replace(/^-/, '')}` : '';
      lines.push(`complete -c cry -n "__fish_seen_subcommand_from ${cmd}" -l ${flagName} ${shortFlag} -d "${opt.description}"`);
    }
  }

  lines.push('');
  lines.push('# Dynamic branch completion for spawn, open, rm, resume');
  lines.push('complete -c cry -n "__fish_seen_subcommand_from spawn open rm resume" -a "(git branch --format=\'%(refname:short)\' 2>/dev/null)"');

  lines.push('');
  lines.push('# Agent options for spawn --agent');
  lines.push('complete -c cry -n "__fish_seen_subcommand_from spawn; and __fish_contains_opt -s a agent" -a "claude cursor none"');

  lines.push('');
  lines.push('# Mode options for spawn --mode');
  lines.push('complete -c cry -n "__fish_seen_subcommand_from spawn; and __fish_contains_opt -s m mode" -a "copy symlink none"');

  lines.push('');
  lines.push('# Shell options for completions --shell');
  lines.push('complete -c cry -n "__fish_seen_subcommand_from completions; and __fish_contains_opt -s s shell" -a "bash zsh fish"');

  return lines.join('\n');
}

/**
 * Generate Bash shell completions
 */
export function generateBashCompletions(): string {
  const subcommands = COMMANDS.map(c => c.name).join(' ');

  return `# Bash completions for cry CLI
# Install: cry completions bash >> ~/.bashrc
# Or: cry completions bash > /etc/bash_completion.d/cry

_cry_completions() {
    local cur prev words cword
    _init_completion || return

    local commands="${subcommands}"

    # Complete subcommands
    if [[ $cword -eq 1 ]]; then
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
        return
    fi

    local cmd="\${words[1]}"

    case "$cmd" in
        spawn)
            case "$prev" in
                --agent|-a)
                    COMPREPLY=($(compgen -W "claude cursor none" -- "$cur"))
                    return
                    ;;
                --mode|-m)
                    COMPREPLY=($(compgen -W "copy symlink none" -- "$cur"))
                    return
                    ;;
                --base-branch)
                    COMPREPLY=($(compgen -W "$(git branch --format='%(refname:short)' 2>/dev/null)" -- "$cur"))
                    return
                    ;;
            esac
            if [[ "$cur" == -* ]]; then
                COMPREPLY=($(compgen -W "--new --path --base --base-branch --mode --agent --run --finish-on-exit --dry-run --help" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "$(git branch --format='%(refname:short)' 2>/dev/null)" -- "$cur"))
            fi
            ;;
        finish)
            COMPREPLY=($(compgen -W "--json --dry-run --pr --cleanup --no-cleanup --non-interactive --allow-dirty --delete-branch --message --skip-commit --help" -- "$cur"))
            ;;
        rm)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=($(compgen -W "--with-branch --force --yes --help" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "$(git worktree list --porcelain 2>/dev/null | grep '^branch' | cut -d' ' -f2 | sed 's|refs/heads/||')" -- "$cur"))
            fi
            ;;
        open|resume)
            if [[ "$cur" == -* ]]; then
                case "$cmd" in
                    open)
                        COMPREPLY=($(compgen -W "--cmd --path-only --agent --editor --help" -- "$cur"))
                        ;;
                    resume)
                        COMPREPLY=($(compgen -W "--agent --cd --help" -- "$cur"))
                        ;;
                esac
            else
                COMPREPLY=($(compgen -W "$(git worktree list --porcelain 2>/dev/null | grep '^branch' | cut -d' ' -f2 | sed 's|refs/heads/||')" -- "$cur"))
            fi
            ;;
        gc)
            COMPREPLY=($(compgen -W "--dry-run --yes --manifests-only --help" -- "$cur"))
            ;;
        list|ls)
            COMPREPLY=($(compgen -W "--json --help" -- "$cur"))
            ;;
        init)
            COMPREPLY=($(compgen -W "--force --help" -- "$cur"))
            ;;
        completions)
            case "$prev" in
                --shell|-s)
                    COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))
                    return
                    ;;
            esac
            COMPREPLY=($(compgen -W "bash zsh fish --shell --help" -- "$cur"))
            ;;
        *)
            COMPREPLY=($(compgen -W "--help" -- "$cur"))
            ;;
    esac
}

complete -F _cry_completions cry
`;
}

/**
 * Generate Zsh shell completions
 */
export function generateZshCompletions(): string {
  const subcommandList = COMMANDS.map(c => `'${c.name}:${c.description}'`).join('\n        ');

  return `#compdef cry
# Zsh completions for cry CLI
# Install: cry completions zsh > ~/.zsh/completions/_cry
# Then add to .zshrc: fpath=(~/.zsh/completions $fpath)

_cry() {
    local -a commands
    commands=(
        ${subcommandList}
    )

    _arguments -C \\
        '1: :->command' \\
        '*: :->args'

    case $state in
        command)
            _describe -t commands 'cry commands' commands
            ;;
        args)
            case $words[2] in
                spawn)
                    _arguments \\
                        '(-n --new)'{-n,--new}'[Create new branch]' \\
                        '(-p --path)'{-p,--path}'[Custom worktree path]:path:_files -/' \\
                        '--base[Base directory]:path:_files -/' \\
                        '--base-branch[Base branch for PR]:branch:__git_branch_names' \\
                        '(-m --mode)'{-m,--mode}'[Secret mode]:mode:(copy symlink none)' \\
                        '(-a --agent)'{-a,--agent}'[Launch agent]:agent:(claude cursor none)' \\
                        '(-r --run)'{-r,--run}'[Run command]:command:' \\
                        '--finish-on-exit[Show finish menu on exit]' \\
                        '--dry-run[Show what would happen]' \\
                        '*:branch:__git_branch_names'
                    ;;
                finish)
                    _arguments \\
                        '--json[Output as JSON]' \\
                        '--dry-run[Show what would happen]' \\
                        '--pr[Create PR even if no commits]' \\
                        '--cleanup[Auto cleanup after PR]' \\
                        '--no-cleanup[Skip cleanup prompt]' \\
                        '--non-interactive[Never prompt]' \\
                        '--allow-dirty[Allow uncommitted changes]' \\
                        '--delete-branch[Delete branch on cleanup]' \\
                        '(-m --message)'{-m,--message}'[Commit message]:message:' \\
                        '--skip-commit[Skip commit step]'
                    ;;
                rm)
                    _arguments \\
                        '(-b --with-branch)'{-b,--with-branch}'[Also delete branch]' \\
                        '(-f --force)'{-f,--force}'[Force remove]' \\
                        '(-y --yes)'{-y,--yes}'[Skip confirmation]' \\
                        '*:worktree:__git_worktrees'
                    ;;
                open)
                    _arguments \\
                        '(-c --cmd)'{-c,--cmd}'[Custom command]:command:' \\
                        '--path-only[Print path only]' \\
                        '(-a --agent)'{-a,--agent}'[Open in agent]' \\
                        '(-e --editor)'{-e,--editor}'[Open in editor]' \\
                        '*:worktree:__git_worktrees'
                    ;;
                resume)
                    _arguments \\
                        '(-a --agent)'{-a,--agent}'[Launch agent]:agent:' \\
                        '--cd[Print cd command]' \\
                        '*:session:'
                    ;;
                gc)
                    _arguments \\
                        '--dry-run[Show what would be cleaned]' \\
                        '(-y --yes)'{-y,--yes}'[Skip confirmation]' \\
                        '--manifests-only[Only clean manifests]'
                    ;;
                list|ls)
                    _arguments '--json[Output as JSON]'
                    ;;
                init)
                    _arguments '(-f --force)'{-f,--force}'[Overwrite existing]'
                    ;;
                completions)
                    _arguments \\
                        '(-s --shell)'{-s,--shell}'[Shell type]:shell:(bash zsh fish)' \\
                        '1:shell:(bash zsh fish)'
                    ;;
            esac
            ;;
    esac
}

# Helper to complete git worktrees
__git_worktrees() {
    local -a worktrees
    worktrees=($(git worktree list --porcelain 2>/dev/null | grep '^branch' | cut -d' ' -f2 | sed 's|refs/heads/||'))
    _describe -t worktrees 'worktrees' worktrees
}

# Helper to complete git branches
__git_branch_names() {
    local -a branches
    branches=($(git branch --format='%(refname:short)' 2>/dev/null))
    _describe -t branches 'branches' branches
}

_cry "$@"
`;
}

/**
 * Get completions for a specific shell
 */
export function getCompletions(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'fish':
      return generateFishCompletions();
    case 'bash':
      return generateBashCompletions();
    case 'zsh':
      return generateZshCompletions();
    default:
      throw new Error(`Unknown shell: ${shell}`);
  }
}

/**
 * Get install instructions for a shell
 */
export function getInstallInstructions(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'fish':
      return `# Fish: Save to completions directory
cry completions fish > ~/.config/fish/completions/cry.fish`;
    case 'bash':
      return `# Bash: Add to your ~/.bashrc
cry completions bash >> ~/.bashrc
# Or install system-wide:
cry completions bash | sudo tee /etc/bash_completion.d/cry`;
    case 'zsh':
      return `# Zsh: Save to completions directory and add to fpath
mkdir -p ~/.zsh/completions
cry completions zsh > ~/.zsh/completions/_cry
# Add to ~/.zshrc:
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit`;
  }
}
