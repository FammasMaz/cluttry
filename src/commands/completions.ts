/**
 * cry completions command
 *
 * Generate shell completions for bash, zsh, and fish.
 */

import {
  getCompletions,
  getInstallInstructions,
  COMMANDS,
} from '../lib/completions.js';
import * as out from '../lib/output.js';

type ShellType = 'bash' | 'zsh' | 'fish';

interface CompletionsOptions {
  shell?: ShellType;
}

const VALID_SHELLS = ['bash', 'zsh', 'fish'] as const;

function isValidShell(shell: string): shell is ShellType {
  return VALID_SHELLS.includes(shell as ShellType);
}

export async function completions(shell: string | undefined, options: CompletionsOptions): Promise<void> {
  // Determine shell from argument or option
  const targetShell = shell ?? options.shell;

  if (!targetShell) {
    // Show help for all shells
    out.header('Shell Completions');
    out.newline();
    out.log('Generate completions for your shell:');
    out.newline();

    for (const sh of VALID_SHELLS) {
      out.log(`${out.fmt.bold(sh)}:`);
      out.log(out.fmt.dim(getInstallInstructions(sh)));
      out.newline();
    }

    out.log('Usage:');
    out.log(`  ${out.fmt.cyan('cry completions fish')}    # Output fish completions`);
    out.log(`  ${out.fmt.cyan('cry completions bash')}    # Output bash completions`);
    out.log(`  ${out.fmt.cyan('cry completions zsh')}     # Output zsh completions`);
    return;
  }

  if (!isValidShell(targetShell)) {
    out.error(`Unknown shell: ${targetShell}`);
    out.info(`Supported shells: ${VALID_SHELLS.join(', ')}`);
    process.exit(1);
  }

  // Output completions to stdout (for piping to file)
  console.log(getCompletions(targetShell));
}

/**
 * Get list of subcommands (for testing)
 */
export function getSubcommands(): string[] {
  return COMMANDS.map(c => c.name);
}
