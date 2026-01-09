/**
 * Unit tests for configuration management
 */

import { describe, it, expect } from 'vitest';
import { mergeConfig } from '../src/lib/config.js';
import type { CryConfig, CryLocalConfig } from '../src/lib/types.js';

describe('mergeConfig', () => {
  const baseConfig: CryConfig = {
    defaultMode: 'copy',
    include: ['.env', '.env.local'],
    hooks: {
      postCreate: ['npm install'],
    },
    agentCommand: 'claude',
    worktreeBaseDir: '/default/base',
  };

  it('returns defaults when both configs are null', () => {
    const result = mergeConfig(null, null);
    expect(result.defaultMode).toBe('copy');
    expect(result.include).toContain('.env');
    expect(result.agentCommand).toBe('claude');
  });

  it('uses base config values when no local config', () => {
    const result = mergeConfig(baseConfig, null);
    expect(result.defaultMode).toBe('copy');
    expect(result.include).toEqual(['.env', '.env.local']);
    expect(result.hooks.postCreate).toEqual(['npm install']);
    expect(result.agentCommand).toBe('claude');
    expect(result.worktreeBaseDir).toBe('/default/base');
  });

  it('merges include arrays from both configs', () => {
    const localConfig: CryLocalConfig = {
      include: ['credentials.json', '.secrets'],
    };
    const result = mergeConfig(baseConfig, localConfig);
    expect(result.include).toEqual(['.env', '.env.local', 'credentials.json', '.secrets']);
  });

  it('local worktreeBaseDir overrides base', () => {
    const localConfig: CryLocalConfig = {
      worktreeBaseDir: '/custom/local/path',
    };
    const result = mergeConfig(baseConfig, localConfig);
    expect(result.worktreeBaseDir).toBe('/custom/local/path');
  });

  it('local agentCommand overrides base', () => {
    const localConfig: CryLocalConfig = {
      agentCommand: 'cursor',
    };
    const result = mergeConfig(baseConfig, localConfig);
    expect(result.agentCommand).toBe('cursor');
  });

  it('merges postCreate hooks from both configs', () => {
    const localConfig: CryLocalConfig = {
      hooks: {
        postCreate: ['npm run dev', 'code .'],
      },
    };
    const result = mergeConfig(baseConfig, localConfig);
    expect(result.hooks.postCreate).toEqual(['npm install', 'npm run dev', 'code .']);
  });

  it('handles empty include arrays', () => {
    const config: CryConfig = {
      defaultMode: 'none',
      include: [],
    };
    const localConfig: CryLocalConfig = {
      include: [],
    };
    const result = mergeConfig(config, localConfig);
    expect(result.include).toEqual([]);
  });

  it('handles missing hooks in configs', () => {
    const config: CryConfig = {
      defaultMode: 'symlink',
      include: ['.env'],
    };
    const result = mergeConfig(config, null);
    expect(result.hooks.postCreate).toEqual([]);
  });

  it('preserves defaultMode from base config', () => {
    const config: CryConfig = {
      defaultMode: 'symlink',
      include: [],
    };
    const localConfig: CryLocalConfig = {
      include: ['.env'],
    };
    const result = mergeConfig(config, localConfig);
    expect(result.defaultMode).toBe('symlink');
  });
});
