import { expect, it } from 'vitest';
import {
  markSession,
  readCsrfToken,
  rejectSession,
  sessionCheckGeneration,
  sessionStatus,
} from './session';

it('TTD-AUD-34: logout clears CSRF and invalidates a pending bootstrap generation', () => {
  markSession('authenticated', 'fixture-csrf');
  const pending = sessionCheckGeneration();
  markSession('anonymous');
  expect(sessionCheckGeneration()).not.toBe(pending);
  expect(sessionStatus()).toBe('anonymous');
  expect(readCsrfToken()).toBeUndefined();
  rejectSession(pending);
  expect(sessionStatus()).toBe('anonymous');
});
