/**
 * Tests for shell completion generation
 */

import { describe, it, expect } from 'vitest';
import {
  generateFishCompletions,
  generateBashCompletions,
  generateZshCompletions,
  getCompletions,
  COMMANDS,
  COMMAND_OPTIONS,
} from '../src/lib/completions.js';
import { getSubcommands } from '../src/commands/completions.js';

describe('shell completions', () => {
  describe('COMMANDS list', () => {
    it('includes all expected subcommands', () => {
      const names = COMMANDS.map(c => c.name);

      expect(names).toContain('init');
      expect(names).toContain('spawn');
      expect(names).toContain('list');
      expect(names).toContain('open');
      expect(names).toContain('rm');
      expect(names).toContain('finish');
      expect(names).toContain('resume');
      expect(names).toContain('gc');
      expect(names).toContain('completions');
    });

    it('has descriptions for all commands', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.description).toBeTruthy();
        expect(cmd.description.length).toBeGreaterThan(5);
      }
    });
  });

  describe('COMMAND_OPTIONS', () => {
    it('has options for spawn command', () => {
      expect(COMMAND_OPTIONS.spawn).toBeDefined();
      const flags = COMMAND_OPTIONS.spawn.map(o => o.flag);
      expect(flags).toContain('--new');
      expect(flags).toContain('--agent');
      expect(flags).toContain('--dry-run');
    });

    it('has options for finish command', () => {
      expect(COMMAND_OPTIONS.finish).toBeDefined();
      const flags = COMMAND_OPTIONS.finish.map(o => o.flag);
      expect(flags).toContain('--json');
      expect(flags).toContain('--message');
      expect(flags).toContain('--cleanup');
    });

    it('has options for rm command', () => {
      expect(COMMAND_OPTIONS.rm).toBeDefined();
      const flags = COMMAND_OPTIONS.rm.map(o => o.flag);
      expect(flags).toContain('--force');
      expect(flags).toContain('--with-branch');
    });
  });

  describe('generateFishCompletions', () => {
    it('generates valid fish completion script', () => {
      const output = generateFishCompletions();

      // Check header
      expect(output).toContain('# Fish completions for cry CLI');

      // Check subcommand completions
      expect(output).toContain('complete -c cry');
      expect(output).toContain('-a "init"');
      expect(output).toContain('-a "spawn"');
      expect(output).toContain('-a "finish"');

      // Check command-specific options (fish uses -l for long options)
      expect(output).toContain('__fish_seen_subcommand_from spawn');
      expect(output).toContain('-l new');

      // Check dynamic completions
      expect(output).toContain('git branch');
    });

    it('includes all subcommands', () => {
      const output = generateFishCompletions();
      for (const cmd of COMMANDS) {
        expect(output).toContain(`-a "${cmd.name}"`);
      }
    });
  });

  describe('generateBashCompletions', () => {
    it('generates valid bash completion script', () => {
      const output = generateBashCompletions();

      // Check function definition
      expect(output).toContain('_cry_completions()');
      expect(output).toContain('complete -F _cry_completions cry');

      // Check subcommands are listed
      expect(output).toContain('init');
      expect(output).toContain('spawn');
      expect(output).toContain('finish');

      // Check case statement for commands
      expect(output).toContain('case "$cmd" in');
      expect(output).toContain('spawn)');
      expect(output).toContain('finish)');
    });

    it('includes agent options for spawn', () => {
      const output = generateBashCompletions();
      expect(output).toContain('claude cursor none');
    });
  });

  describe('generateZshCompletions', () => {
    it('generates valid zsh completion script', () => {
      const output = generateZshCompletions();

      // Check compdef header
      expect(output).toContain('#compdef cry');
      expect(output).toContain('_cry()');

      // Check commands array
      expect(output).toContain("'init:");
      expect(output).toContain("'spawn:");
      expect(output).toContain("'finish:");

      // Check _arguments usage
      expect(output).toContain('_arguments');
    });

    it('includes helper functions', () => {
      const output = generateZshCompletions();
      expect(output).toContain('__git_worktrees()');
      expect(output).toContain('__git_branch_names()');
    });
  });

  describe('getCompletions', () => {
    it('returns fish completions for fish shell', () => {
      const output = getCompletions('fish');
      expect(output).toContain('# Fish completions');
    });

    it('returns bash completions for bash shell', () => {
      const output = getCompletions('bash');
      expect(output).toContain('_cry_completions');
    });

    it('returns zsh completions for zsh shell', () => {
      const output = getCompletions('zsh');
      expect(output).toContain('#compdef cry');
    });

    it('throws for unknown shell', () => {
      expect(() => getCompletions('powershell' as any)).toThrow('Unknown shell');
    });
  });

  describe('getSubcommands', () => {
    it('returns list of subcommand names', () => {
      const subcommands = getSubcommands();

      expect(subcommands).toContain('init');
      expect(subcommands).toContain('spawn');
      expect(subcommands).toContain('finish');
      expect(subcommands).toContain('completions');
    });

    it('matches COMMANDS list', () => {
      const subcommands = getSubcommands();
      const commandNames = COMMANDS.map(c => c.name);

      expect(subcommands).toEqual(commandNames);
    });
  });
});
