import { describe, expect, it } from 'vitest';
import { matchesFilter, nextOccurrence, parseQuickAdd } from './index';
import type { FilterSubject } from './index';

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

  it('RF-904: an empty AND matches every subject', () => {
    const subject: FilterSubject = {
      listId: null,
      tagIds: [],
      tagNames: [],
      dueDate: null,
      isAllDay: false,
      timeZone: 'Europe/Madrid',
      priority: 'none',
      title: 'Leer',
      content: '',
      status: 'active',
      assigneeId: null,
      deleted: false,
      createdAt: '2026-10-17T10:00:00.000Z',
    };
    expect(
      matchesFilter({ combinator: 'AND', groups: [] }, subject, {
        now: '2026-10-17T10:00:00.000Z',
        timeZone: 'Europe/Madrid',
      }),
    ).toBe(true);
  });

  it('RF-102: quick add keeps the date span offsets of the original text', () => {
    const text = 'comprar leche mañana 18:00';
    const parsed = parseQuickAdd(text, 'es', {
      now: '2026-10-17T10:00:00.000Z',
      timeZone: 'Europe/Madrid',
    });
    const span = parsed.spans.find((item) => item.kind === 'date');
    expect(span).toBeDefined();
    expect(text.slice(span?.start, span?.end)).toBe('mañana 18:00');
    expect(parsed.title).toBe('comprar leche');
  });
});
