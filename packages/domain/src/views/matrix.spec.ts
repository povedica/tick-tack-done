import { describe, expect, it } from 'vitest';
import {
  applyQuadrantDrop,
  defaultQuadrant,
  DEFAULT_QUADRANT_EFFECTS,
  quadrantOf,
  type MatrixTask,
} from './matrix';

const now = '2026-10-18T12:00:00.000Z';

function task(overrides: Partial<MatrixTask> = {}): MatrixTask {
  return {
    priority: 'none',
    dueDate: null,
    listId: 'list-1',
    tagNames: [],
    title: 'Informe',
    content: '',
    status: 'active',
    assigneeId: null,
    createdAt: now,
    isAllDay: false,
    timeZone: 'Europe/Madrid',
    deleted: false,
    ...overrides,
  };
}

describe('matrix', () => {
  it('RF-1004: overdue high priority is do', () => {
    expect(
      defaultQuadrant(task({ priority: 'high', dueDate: '2026-10-18T08:00:00.000Z' }), now),
    ).toBe('do');
  });

  it('RF-1004: medium priority next week is schedule', () => {
    expect(
      defaultQuadrant(task({ priority: 'medium', dueDate: '2026-10-25T12:00:00.000Z' }), now),
    ).toBe('schedule');
  });

  it('RF-1004: low priority due soon is delegate', () => {
    expect(
      defaultQuadrant(task({ priority: 'low', dueDate: '2026-10-18T18:00:00.000Z' }), now),
    ).toBe('delegate');
  });

  it('RF-1004: no date and no priority is drop', () => {
    expect(defaultQuadrant(task(), now)).toBe('drop');
  });

  it('RF-1004: an invalid date is not urgent', () => {
    expect(defaultQuadrant(task({ priority: 'low', dueDate: 'nope' }), now)).toBe('drop');
  });

  it('RF-1004: editable filter rules place a tagged task in do', () => {
    const placed = quadrantOf(
      task({ tagNames: ['casa'], priority: 'none' }),
      [
        {
          quadrant: 'do',
          rules: {
            combinator: 'AND',
            groups: [
              { combinator: 'AND', conditions: [{ field: 'tag', op: 'any_of', value: ['casa'] }] },
            ],
          },
        },
      ],
      { now, timeZone: 'Europe/Madrid' },
    );
    expect(placed).toBe('do');
  });

  it('RF-1004: a drop on schedule sets medium priority and a later date', () => {
    const patch = applyQuadrantDrop(DEFAULT_QUADRANT_EFFECTS.schedule, now);
    expect(patch.priority).toBe('medium');
    expect(patch.dueDate).toBe('2026-10-25T12:00:00.000Z');
  });

  it('RF-1004: a drop on drop clears the date', () => {
    expect(applyQuadrantDrop(DEFAULT_QUADRANT_EFFECTS.drop, now).dueDate).toBeNull();
  });

  it('RF-1004: a drop on do is due within 24 hours', () => {
    expect(applyQuadrantDrop(DEFAULT_QUADRANT_EFFECTS.do, 'not-a-date').dueDate).toBe(
      '2026-01-01T01:00:00.000Z',
    );
  });
});
