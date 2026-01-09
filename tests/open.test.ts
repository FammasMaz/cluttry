/**
 * Unit tests for cry open command
 *
 * Tests command resolution logic without actually executing commands.
 */

import { describe, it, expect } from 'vitest';
import { resolveOpenCommand } from '../src/commands/open.js';

describe('resolveOpenCommand', () => {
  const defaultConfig = {
    agentCommand: 'claude',
    editorCommand: 'code',
  };

  describe('with explicit --cmd', () => {
    it('uses provided command', () => {
      const result = resolveOpenCommand(
        { cmd: 'vim .' },
        defaultConfig
      );

      expect(result).toEqual({
        command: 'vim .',
        type: 'custom',
      });
    });

    it('--cmd takes precedence over --agent', () => {
      const result = resolveOpenCommand(
        { cmd: 'nvim .', agent: true },
        defaultConfig
      );

      expect(result).toEqual({
        command: 'nvim .',
        type: 'custom',
      });
    });

    it('--cmd takes precedence over --editor', () => {
      const result = resolveOpenCommand(
        { cmd: 'emacs .', editor: true },
        defaultConfig
      );

      expect(result).toEqual({
        command: 'emacs .',
        type: 'custom',
      });
    });
  });

  describe('with --agent flag', () => {
    it('uses agentCommand from config', () => {
      const result = resolveOpenCommand(
        { agent: true },
        defaultConfig
      );

      expect(result).toEqual({
        command: 'claude',
        type: 'agent',
      });
    });

    it('uses custom agentCommand from config', () => {
      const result = resolveOpenCommand(
        { agent: true },
        { agentCommand: 'cursor', editorCommand: 'code' }
      );

      expect(result).toEqual({
        command: 'cursor',
        type: 'agent',
      });
    });
  });

  describe('with --editor flag', () => {
    it('uses editorCommand from config', () => {
      const result = resolveOpenCommand(
        { editor: true },
        defaultConfig
      );

      expect(result).toEqual({
        command: 'code',
        type: 'editor',
      });
    });

    it('uses custom editorCommand from config', () => {
      const result = resolveOpenCommand(
        { editor: true },
        { agentCommand: 'claude', editorCommand: 'cursor' }
      );

      expect(result).toEqual({
        command: 'cursor',
        type: 'editor',
      });
    });

    it('supports various editor commands', () => {
      const editors = ['code', 'cursor', 'vim', 'nvim', 'emacs', 'subl', 'atom'];

      for (const editor of editors) {
        const result = resolveOpenCommand(
          { editor: true },
          { agentCommand: 'claude', editorCommand: editor }
        );

        expect(result).toEqual({
          command: editor,
          type: 'editor',
        });
      }
    });
  });

  describe('default behavior (no flags)', () => {
    it('defaults to agent command', () => {
      const result = resolveOpenCommand({}, defaultConfig);

      expect(result).toEqual({
        command: 'claude',
        type: 'agent',
      });
    });

    it('uses configured agent command', () => {
      const result = resolveOpenCommand(
        {},
        { agentCommand: 'my-agent', editorCommand: 'code' }
      );

      expect(result).toEqual({
        command: 'my-agent',
        type: 'agent',
      });
    });
  });

  describe('with --path-only flag', () => {
    it('still returns command info (caller handles path-only)', () => {
      // The --path-only flag is handled by the open() function,
      // not by resolveOpenCommand, so it should still return a command
      const result = resolveOpenCommand(
        { pathOnly: true },
        defaultConfig
      );

      expect(result).toEqual({
        command: 'claude',
        type: 'agent',
      });
    });
  });

  describe('priority order', () => {
    it('--cmd > --agent > --editor > default', () => {
      // All flags set - cmd wins
      expect(resolveOpenCommand(
        { cmd: 'custom', agent: true, editor: true },
        defaultConfig
      )).toEqual({ command: 'custom', type: 'custom' });

      // agent and editor - agent wins
      expect(resolveOpenCommand(
        { agent: true, editor: true },
        defaultConfig
      )).toEqual({ command: 'claude', type: 'agent' });

      // only editor
      expect(resolveOpenCommand(
        { editor: true },
        defaultConfig
      )).toEqual({ command: 'code', type: 'editor' });

      // no flags - defaults to agent
      expect(resolveOpenCommand(
        {},
        defaultConfig
      )).toEqual({ command: 'claude', type: 'agent' });
    });
  });
});
