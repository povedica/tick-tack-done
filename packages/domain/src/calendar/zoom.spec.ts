import { describe, expect, it } from 'vitest';
import {
  EVENT_COLOR_CAP,
  RANGE_MAX_DAYS,
  SUMMARY_MAX_DAYS,
  TASK_COLOR_CAP,
  authorizedLists,
  calendarScopeKey,
  decodeCalendarCursor,
  encodeCalendarCursor,
  inclusiveCivilDays,
  listScopeKey,
  parseCivilDay,
  zoomDensity,
} from './zoom';

describe('calendar zoom window', () => {
  it('counts inclusive civil days and rejects a calendar that does not exist', () => {
    expect(SUMMARY_MAX_DAYS).toBe(400);
    expect(RANGE_MAX_DAYS).toBe(62);
    expect(inclusiveCivilDays('2026-01-01', '2026-01-01')).toBe(1);
    expect(inclusiveCivilDays('2026-01-01', '2026-01-02')).toBe(2);
    expect(inclusiveCivilDays('2026-01-01', '2026-12-31')).toBe(365);
    expect(parseCivilDay('2026-02-31')).toBeNull();
    expect(inclusiveCivilDays('2026-03-02', '2026-03-01')).toBeNull();
    expect(inclusiveCivilDays('yesterday', '2026-03-01')).toBeNull();
  });
});

describe('calendar list authorization', () => {
  it('keeps an unrestricted caller open and intersects a token allowlist', () => {
    expect(authorizedLists(null, [])).toBeNull();
    expect(listScopeKey(null)).toBe('*');
    expect(authorizedLists(null, ['list-b', 'list-a'])).toEqual(['list-a', 'list-b']);
    expect(authorizedLists(['list-b', 'list-a'], [])).toEqual(['list-a', 'list-b']);
    expect(authorizedLists(['list-a'], ['list-b'])).toEqual([]);
    expect(listScopeKey(['list-b', 'list-a'])).toBe('list-a,list-b');
  });
});

describe('calendar keyset cursor', () => {
  it('round-trips the day, the instant and the id', () => {
    const key = {
      day: '2026-03-01',
      startsAt: '2026-03-01T08:00:00.000000Z',
      id: '11111111-1111-4111-8111-111111111111',
    };
    const encoded = encodeCalendarCursor(key);
    expect(encoded.includes('~')).toBe(true);
    expect(decodeCalendarCursor(encoded)).toEqual(key);
    expect(decodeCalendarCursor('not-a-cursor')).toBeNull();
    expect(decodeCalendarCursor(encodeCalendarCursor({ ...key, day: '2026-02-31' }))).toBeNull();
  });
});

describe('calendar representation scope', () => {
  it('changes the hash preimage when the allowlist, the token or the zone changes', () => {
    const scope = {
      kind: 'summary' as const,
      from: '2026-01-01',
      to: '2026-12-31',
      zone: 'Europe/Madrid',
      context: 'all',
      workMode: 'all',
      workProjects: [],
      workFolders: [],
      workTags: [],
      lists: '*',
      tokenId: 'session',
      tags: [],
      cals: [],
      include: 'events,tasks',
      grain: 'day',
      cursor: '',
    };
    const session = calendarScopeKey(scope);
    expect(session).not.toBe(calendarScopeKey({ ...scope, lists: 'list-a', tokenId: 'pat-1' }));
    expect(session).not.toBe(calendarScopeKey({ ...scope, tokenId: 'pat-open' }));
    expect(session).not.toBe(calendarScopeKey({ ...scope, zone: 'America/New_York' }));
    expect(session).not.toBe(calendarScopeKey({ ...scope, cursor: 'next' }));
  });
});

describe('calendar density', () => {
  it('caps task colors at three and event colors at eight, and folds a month', () => {
    expect(TASK_COLOR_CAP).toBe(3);
    expect(EVENT_COLOR_CAP).toBe(8);
    const day = zoomDensity(
      [
        {
          key: '2026-03-02',
          taskCount: 4,
          eventCount: 9,
          taskColors: ['#111111', '#222222', '#333333'],
          eventColors: [
            'accent',
            'accent',
            'accent',
            'accent',
            'accent',
            'accent',
            'accent',
            'accent',
          ],
          taskTruncated: true,
          eventTruncated: true,
        },
      ],
      'day',
    );
    expect(day.cells['2026-03-02']).toEqual({
      n: 13,
      c: [
        '#111111',
        '#222222',
        '#333333',
        'accent',
        'accent',
        'accent',
        'accent',
        'accent',
        'accent',
        'accent',
        'accent',
      ],
    });
    expect(day.truncated).toBe(true);
    const month = zoomDensity(
      [
        {
          key: '2026-03-02',
          taskCount: 1,
          eventCount: 0,
          taskColors: ['#111111'],
          eventColors: [],
          taskTruncated: false,
          eventTruncated: false,
        },
        {
          key: '2026-03-03',
          taskCount: 1,
          eventCount: 1,
          taskColors: ['#222222'],
          eventColors: ['accent'],
          taskTruncated: false,
          eventTruncated: false,
        },
      ],
      'month',
    );
    expect(month.cells['2026-03']).toEqual({ n: 3, c: ['#111111', '#222222', 'accent'] });
    expect(month.truncated).toBe(false);
    expect(zoomDensity([], 'day')).toEqual({ cells: {}, truncated: false });
  });
});
