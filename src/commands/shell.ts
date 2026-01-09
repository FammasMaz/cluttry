/**
 * cry shell command
 *
 * Output shell integration code for easy directory navigation.
 */

import * as out from '../lib/output.js';

type ShellType = 'bash' | 'zsh' | 'fish';

const SHELL_FUNCTIONS: Record<ShellType, string> = {
  bash: `# cry shell integration (add to ~/.bashrc)
crycd() {
  local target
  target="$(cry open "$1" --path-only 2>/dev/null)"
  if [ -n "$target" ]; then
    cd "$target"
  else
    echo "Worktree not found: $1" >&2
    return 1
  fi
}

# Auto-completion for crycd
_crycd_completions() {
  local branches
  branches=$(cry list --json 2>/dev/null | grep -o '"branch":"[^"]*"' | cut -d'"' -f4)
  COMPREPLY=($(compgen -W "$branches" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _crycd_completions crycd
`,

  zsh: `# cry shell integration (add to ~/.zshrc)
crycd() {
  local target
  target="$(cry open "$1" --path-only 2>/dev/null)"
  if [[ -n "$target" ]]; then
    cd "$target"
  else
    echo "Worktree not found: $1" >&2
    return 1
  fi
}

# Auto-completion for crycd
_crycd() {
  local branches
  branches=(\${(f)"$(cry list --json 2>/dev/null | grep -o '"branch":"[^"]*"' | cut -d'"' -f4)"})
  _describe 'branch' branches
}
compdef _crycd crycd
`,

  fish: `# cry shell integration (add to ~/.config/fish/config.fish)
function crycd
  set -l target (cry open $argv[1] --path-only 2>/dev/null)
  if test -n "$target"
    cd $target
  else
    echo "Worktree not found: $argv[1]" >&2
    return 1
  end
end

# Auto-completion for crycd
complete -c crycd -f -a "(cry list --json 2>/dev/null | grep -o '\"branch\":\"[^\"]*\"' | cut -d'\"' -f4)"
`,
};

interface ShellOptions {
  shell?: string;
}

export async function shell(options: ShellOptions): Promise<void> {
  const shellEnv = process.env.SHELL ?? '';
  let detectedShell: ShellType = 'bash';

  if (options.shell) {
    if (options.shell === 'fish' || options.shell === 'zsh' || options.shell === 'bash') {
      detectedShell = options.shell;
    } else {
      out.error(`Unsupported shell: ${options.shell}`);
      out.info('Supported shells: bash, zsh, fish');
      process.exit(1);
    }
  } else if (shellEnv.includes('zsh')) {
    detectedShell = 'zsh';
  } else if (shellEnv.includes('fish')) {
    detectedShell = 'fish';
  }

  const script = SHELL_FUNCTIONS[detectedShell];

  out.log(out.fmt.dim(`# Shell integration for ${detectedShell}`));
  out.log(out.fmt.dim('# Copy and paste into your shell config, or run:'));
  out.log(out.fmt.dim(`#   cry shell >> ~/.${detectedShell === 'fish' ? 'config/fish/config.fish' : detectedShell + 'rc'}`));
  out.newline();
  console.log(script);
}
