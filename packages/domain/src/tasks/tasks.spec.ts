import { describe, expect, it } from 'vitest';
import { decideParentCompletion } from './completion';
import { deriveDurationMinutes } from './duration';
import { normalizeTaskTitle, resolveSubtaskProject } from './subtask';
import { isIanaTimeZone } from './time-zone';

describe('tasks', () => {
  it('RF-205: a subtask keeps the parent list', () => {
    expect(
      resolveSubtaskProject({ requestedProjectId: 'list-a', parentProjectId: 'list-a' }),
    ).toEqual({ ok: true, projectId: 'list-a' });
    expect(
      resolveSubtaskProject({ requestedProjectId: 'list-b', parentProjectId: 'list-a' }),
    ).toEqual({ ok: false, reason: 'project_mismatch' });
    expect(resolveSubtaskProject({ requestedProjectId: 'list-b', parentProjectId: null })).toEqual({
      ok: true,
      projectId: 'list-b',
    });
  });

  it('RF-201: titles are trimmed and rejected when empty or over 500 characters', () => {
    expect(normalizeTaskTitle('  comprar  ')).toEqual({ ok: true, title: 'comprar' });
    expect(normalizeTaskTitle('   ')).toEqual({ ok: false });
    expect(normalizeTaskTitle('a'.repeat(501))).toEqual({ ok: false });
  });

  it('RF-206: asks when a parent still has active children and the policy is ask', () => {
    expect(decideParentCompletion({ activeChildCount: 2, choice: null, policy: 'ask' })).toEqual({
      action: 'needs_choice',
      activeChildCount: 2,
    });
  });

  it('RF-206: an explicit choice wins over the stored policy', () => {
    expect(
      decideParentCompletion({ activeChildCount: 2, choice: 'leave', policy: 'complete' }),
    ).toEqual({ action: 'complete_self' });
    expect(
      decideParentCompletion({ activeChildCount: 2, choice: 'complete', policy: 'leave' }),
    ).toEqual({ action: 'complete_with_children' });
  });

  it('RF-206: the stored policy applies when the request does not choose', () => {
    expect(
      decideParentCompletion({ activeChildCount: 1, choice: null, policy: 'complete' }),
    ).toEqual({ action: 'complete_with_children' });
    expect(decideParentCompletion({ activeChildCount: 1, choice: null, policy: 'leave' })).toEqual({
      action: 'complete_self',
    });
    expect(decideParentCompletion({ activeChildCount: 0, choice: null, policy: 'ask' })).toEqual({
      action: 'complete_self',
    });
  });

  it('derives duration from start and due, and keeps an explicit value otherwise', () => {
    expect(
      deriveDurationMinutes({
        startDate: '2026-10-17T09:00:00.000Z',
        dueDate: '2026-10-17T10:30:00.000Z',
        explicit: 5,
      }),
    ).toEqual({ ok: true, durationMinutes: 90 });
    expect(deriveDurationMinutes({ startDate: null, dueDate: null, explicit: 25 })).toEqual({
      ok: true,
      durationMinutes: 25,
    });
    expect(
      deriveDurationMinutes({
        startDate: '2026-10-17T11:00:00.000Z',
        dueDate: '2026-10-17T10:00:00.000Z',
        explicit: null,
      }),
    ).toEqual({ ok: false, reason: 'due_before_start' });
    expect(
      deriveDurationMinutes({
        startDate: 'nope',
        dueDate: '2026-10-17T10:00:00.000Z',
        explicit: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
  });

  it('RF-604: accepts IANA time zones and rejects unknown names', () => {
    expect(isIanaTimeZone('Europe/Madrid')).toBe(true);
    expect(isIanaTimeZone('Mars/Olympus')).toBe(false);
    expect(isIanaTimeZone('')).toBe(false);
  });
});
