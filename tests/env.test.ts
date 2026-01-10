/**
 * Tests for env.ts - dotenv parsing for inject mode
 */

import { describe, it, expect } from 'vitest';
import { parseDotenv, isDotenvFile } from '../src/lib/env.js';

describe('parseDotenv', () => {
  it('parses basic KEY=value pairs', () => {
    const content = `
KEY1=value1
KEY2=value2
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'value1',
      KEY2: 'value2',
    });
  });

  it('ignores comments and empty lines', () => {
    const content = `
# This is a comment
KEY1=value1

# Another comment
KEY2=value2
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'value1',
      KEY2: 'value2',
    });
  });

  it('handles double-quoted values', () => {
    const content = `
KEY1="hello world"
KEY2="with spaces"
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'hello world',
      KEY2: 'with spaces',
    });
  });

  it('handles single-quoted values', () => {
    const content = `
KEY1='hello world'
KEY2='with spaces'
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'hello world',
      KEY2: 'with spaces',
    });
  });

  it('handles export prefix', () => {
    const content = `
export KEY1=value1
export KEY2="value2"
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'value1',
      KEY2: 'value2',
    });
  });

  it('handles escape sequences in double quotes', () => {
    const content = `
KEY1="line1\\nline2"
KEY2="tab\\there"
`;
    const result = parseDotenv(content);
    expect(result.KEY1).toBe('line1\nline2');
    expect(result.KEY2).toBe('tab\there');
  });

  it('handles inline comments for unquoted values', () => {
    const content = `
KEY1=value1 # this is a comment
KEY2=value2
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'value1',
      KEY2: 'value2',
    });
  });

  it('handles empty values', () => {
    const content = `
KEY1=
KEY2=""
KEY3=''
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: '',
      KEY2: '',
      KEY3: '',
    });
  });

  it('handles values with equals signs', () => {
    const content = `
KEY1=value=with=equals
KEY2="also=has=equals"
`;
    const result = parseDotenv(content);
    expect(result).toEqual({
      KEY1: 'value=with=equals',
      KEY2: 'also=has=equals',
    });
  });
});

describe('isDotenvFile', () => {
  it('returns true for .env', () => {
    expect(isDotenvFile('.env')).toBe(true);
    expect(isDotenvFile('path/to/.env')).toBe(true);
  });

  it('returns true for .env.* files', () => {
    expect(isDotenvFile('.env.local')).toBe(true);
    expect(isDotenvFile('.env.production')).toBe(true);
    expect(isDotenvFile('.env.development')).toBe(true);
    expect(isDotenvFile('path/to/.env.local')).toBe(true);
  });

  it('returns true for *.env files', () => {
    expect(isDotenvFile('local.env')).toBe(true);
    expect(isDotenvFile('production.env')).toBe(true);
    expect(isDotenvFile('path/to/local.env')).toBe(true);
  });

  it('returns false for non-dotenv files', () => {
    expect(isDotenvFile('config.json')).toBe(false);
    expect(isDotenvFile('secrets.yaml')).toBe(false);
    expect(isDotenvFile('.envrc')).toBe(false);
    expect(isDotenvFile('environment.ts')).toBe(false);
  });
});
