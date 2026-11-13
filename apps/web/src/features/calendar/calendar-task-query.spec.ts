import { describe, expect, it } from 'vitest';
import { calendarTaskQuery, uniqueById } from './calendar-task-query';

describe('calendarTaskQuery', () => {
  it('asks for start, due and overlap and does not page by due alone', () => {
    const query = calendarTaskQuery('2026-01-01', '2027-01-01');
    expect(query).toEqual({
      status: 'active',
      limit: 100,
      sort: 'due',
      from: '2026-01-01',
      to: '2027-01-01',
      rangeField: 'any',
      context: 'auto',
    });
    expect(query).not.toHaveProperty('dueAfter');
    expect(query).not.toHaveProperty('dueBefore');
  });

  it('dedupes with a map and keeps the first row', () => {
    expect(
      uniqueById([
        { id: 'a', title: 'first' },
        { id: 'b', title: 'b' },
        { id: 'a', title: 'second' },
      ]),
    ).toEqual([
      { id: 'a', title: 'first' },
      { id: 'b', title: 'b' },
    ]);
  });
});
