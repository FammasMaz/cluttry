/**
 * Unit tests for session manifest management
 *
 * Note: These tests focus on the logic that can be tested without complex mocking.
 * Integration tests in integration.test.ts cover the full spawn->session flow.
 */

import { describe, it, expect } from 'vitest';
import {
  SESSIONS_DIR,
} from '../src/lib/session.js';

describe('session manifest constants', () => {
  it('has correct sessions directory path', () => {
    expect(SESSIONS_DIR).toBe('.cry/sessions');
  });
});

// Note: createSessionManifest, listSessions, etc. are tested via integration tests
// because they require real filesystem operations and the crypto module.
// See tests/integration.test.ts for full session lifecycle tests.
