import { describe, expect, it } from 'vitest';
import { matchesFilter, nextOccurrence, parseQuickAdd } from './index';

describe('domain entry points', () => {
  it('RF-701: recurrence expansion is reserved and not implemented', () => {
    expect(() =>
      nextOccurrence({
        repeatRule: 'RRULE:FREQ=DAILY;INTERVAL=1',
        repeatFrom: 'due_date',
        dueDate: null,
        completedAt: null,
        timeZone: 'Europe/Madrid',
      }),
    ).toThrow(/recurrence is not implemented/);
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
