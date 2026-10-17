import { describe, expect, it } from 'vitest';
import { matchesFilter, nextOccurrence, parseQuickAdd } from './index';

describe('domain entry points', () => {
  it('RF-701: a daily rule yields the following occurrence', () => {
    const next = nextOccurrence({
      repeatRule: 'RRULE:FREQ=DAILY;INTERVAL=1',
      repeatFrom: 'due_date',
      dueDate: '2026-10-17T07:00:00.000Z',
      startDate: null,
      completedAt: null,
      timeZone: 'Europe/Madrid',
      isAllDay: false,
      occurrenceIndex: null,
    });
    expect(next).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-18T07:00:00.000Z', startDate: null },
    });
  });

  it('RF-904: filter evaluation is reserved and not implemented', () => {
    expect(() =>
      matchesFilter(
        { combinator: 'AND', groups: [] },
        {
          listId: null,
          tagNames: [],
          dueDate: null,
          priority: 'none',
          title: '',
          content: '',
          status: 'active',
          assigneeId: null,
        },
      ),
    ).toThrow(/filters are not implemented/);
  });

  it('RF-102: quick add parsing is reserved and not implemented', () => {
    expect(() => parseQuickAdd('mañana 18:00 comprar leche', 'es')).toThrow(
      /nlp is not implemented/,
    );
  });
});
