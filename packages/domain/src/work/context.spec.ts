import { describe, expect, it } from 'vitest';
import { isWorkTask, isWorkTime, nextWorkStart, workHiddenNow } from './context';
import { weekdayCodes, weekdayNumbers } from './weekdays';

const office = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const night = { start: '22:00', end: '06:00', days: [1] };

describe('work context', () => {
  it('isWorkTask: list, folder or any tag makes the task work', () => {
    const membership = {
      workFolderIds: ['folder-work'],
      workProjectIds: ['list-notes'],
      workTagIds: ['tag-curro'],
      folderOf: (projectId: string) => (projectId === 'list-trabajo' ? 'folder-work' : null),
    };
    expect(isWorkTask({ projectId: 'list-notes', tagIds: [] }, membership)).toBe(true);
    expect(isWorkTask({ projectId: 'list-trabajo', tagIds: [] }, membership)).toBe(true);
    expect(isWorkTask({ projectId: 'list-casa', tagIds: ['tag-curro'] }, membership)).toBe(true);
    expect(isWorkTask({ projectId: 'list-casa', tagIds: ['tag-personal'] }, membership)).toBe(
      false,
    );
    expect(isWorkTask({ projectId: 'list-casa', tagIds: [] }, membership)).toBe(false);
  });

  it('isWorkTime: Tuesday 21:00 in Madrid is outside 09:00–18:00', () => {
    expect(isWorkTime('2026-10-27T20:00:00.000Z', 'Europe/Madrid', office)).toBe(false);
    expect(isWorkTime('2026-10-27T08:30:00.000Z', 'Europe/Madrid', office)).toBe(true);
    expect(isWorkTime('2026-10-27T17:00:00.000Z', 'Europe/Madrid', office)).toBe(false);
    expect(isWorkTime('2026-10-25T10:00:00.000Z', 'Europe/Madrid', office)).toBe(false);
  });

  it('isWorkTime: an overnight shift belongs to the day it started', () => {
    expect(isWorkTime('2026-01-05T22:30:00.000Z', 'Europe/Madrid', night)).toBe(true);
    expect(isWorkTime('2026-01-06T04:30:00.000Z', 'Europe/Madrid', night)).toBe(true);
    expect(isWorkTime('2026-01-06T05:00:00.000Z', 'Europe/Madrid', night)).toBe(false);
    expect(isWorkTime('2026-01-06T22:30:00.000Z', 'Europe/Madrid', night)).toBe(false);
  });

  it('nextWorkStart: Tuesday night resumes at 09:00 the next working day', () => {
    expect(nextWorkStart('2026-10-27T20:00:00.000Z', 'Europe/Madrid', office)).toBe(
      '2026-10-28T08:00:00.000Z',
    );
    expect(nextWorkStart('2026-10-23T19:00:00.000Z', 'Europe/Madrid', office)).toBe(
      '2026-10-26T08:00:00.000Z',
    );
  });

  it('nextWorkStart: the DST fallback on 25 Oct 2026 does not shift Monday 09:00', () => {
    expect(isWorkTime('2026-10-25T00:30:00.000Z', 'Europe/Madrid', office)).toBe(false);
    expect(isWorkTime('2026-10-25T01:30:00.000Z', 'Europe/Madrid', office)).toBe(false);
    expect(nextWorkStart('2026-10-24T20:00:00.000Z', 'Europe/Madrid', office)).toBe(
      '2026-10-26T08:00:00.000Z',
    );
  });

  it('nextWorkStart: overnight windows resume at the next listed start', () => {
    expect(nextWorkStart('2026-01-05T20:00:00.000Z', 'Europe/Madrid', night)).toBe(
      '2026-01-05T21:00:00.000Z',
    );
    expect(nextWorkStart('2026-01-06T09:00:00.000Z', 'Europe/Madrid', night)).toBe(
      '2026-01-12T21:00:00.000Z',
    );
    expect(nextWorkStart('2026-01-06T09:00:00.000Z', 'Europe/Madrid', { ...night, days: [] })).toBe(
      null,
    );
  });

  it('workHiddenNow: hiding is off by default and "show work" lasts until the next start', () => {
    const outside = '2026-10-27T20:00:00.000Z';
    const base = { ...office, timeZone: 'Europe/Madrid', showWorkUntil: null };
    expect(workHiddenNow({ ...base, hideWorkOutsideHours: false }, outside)).toBe(false);
    expect(workHiddenNow({ ...base, hideWorkOutsideHours: true }, outside)).toBe(true);
    expect(workHiddenNow({ ...base, hideWorkOutsideHours: true }, '2026-10-27T08:30:00.000Z')).toBe(
      false,
    );
    const until = nextWorkStart(outside, 'Europe/Madrid', office);
    expect(
      workHiddenNow({ ...base, hideWorkOutsideHours: true, showWorkUntil: until }, outside),
    ).toBe(false);
    expect(
      workHiddenNow(
        { ...base, hideWorkOutsideHours: true, showWorkUntil: '2026-10-27T19:00:00.000Z' },
        outside,
      ),
    ).toBe(true);
  });

  it('weekday codes use Sunday as 0 and round-trip the default week', () => {
    expect(weekdayCodes([1, 2, 3, 4, 5])).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
    expect(weekdayNumbers(['FR', 'MO', 'MO', 'NO'])).toBeNull();
    expect(weekdayNumbers(['FR', 'MO', 'MO'])).toEqual([1, 5]);
    expect(weekdayCodes([0, 6])).toEqual(['SA', 'SU']);
  });
});
