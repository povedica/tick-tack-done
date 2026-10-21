import { describe, expect, it } from 'vitest';
import {
  defaultQuadrant,
  minimalQuadrantPatch,
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
  it('TTD-AUD-01 RF-904: custom matrix filters receive the task start', () => {
    const candidate = { ...task(), startDate: '2026-10-19T09:00:00Z' };
    expect(
      quadrantOf(
        candidate,
        [
          {
            quadrant: 'do',
            rules: {
              combinator: 'AND',
              groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: 'tomorrow' }] }],
            },
          },
        ],
        { now, timeZone: 'Europe/Madrid' },
      ),
    ).toBe('do');
  });
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

  it('TTD-AUD-62: low tomorrow all-day to do becomes high today all-day', () => {
    const tomorrow = '2026-10-19T22:00:00.000Z'; // Madrid midnight 20th? use parse
    const patch = minimalQuadrantPatch(
      {
        priority: 'low',
        dueDate: tomorrow,
        isAllDay: true,
        timeZone: 'Europe/Madrid',
      },
      'do',
      now,
    );
    expect(patch.priority).toBe('high');
    expect(patch.isAllDay).toBe(true);
    expect(patch.dueDate).not.toBeNull();
    expect(patch.unchanged).toBe(false);
  });

  it('TTD-AUD-62: drop never clears the due date', () => {
    const patch = minimalQuadrantPatch(
      {
        priority: 'high',
        dueDate: '2026-10-18T10:00:00.000Z',
        isAllDay: false,
        timeZone: 'Europe/Madrid',
      },
      'drop',
      now,
    );
    expect(patch.dueDate).toBe('2026-10-18T10:00:00.000Z');
    expect(patch.priority).toBe('none');
  });

  it('TTD-AUD-62: same-state patch is unchanged', () => {
    const patch = minimalQuadrantPatch(
      {
        priority: 'high',
        dueDate: '2026-10-18T10:00:00.000Z',
        isAllDay: false,
        timeZone: 'Europe/Madrid',
      },
      'do',
      now,
    );
    expect(patch.unchanged).toBe(true);
  });
});
