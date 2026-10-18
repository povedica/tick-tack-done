import { describe, expect, it } from 'vitest';
import { proposeDaily, proposeWeekly, type ReviewCandidate } from './propose';

const now = '2026-10-18T12:00:00.000Z';

function task(overrides: Partial<ReviewCandidate>): ReviewCandidate {
  return {
    id: 'task-1',
    title: 'Informe',
    priority: 'low',
    dueDate: null,
    listId: 'list-1',
    listName: 'Trabajo',
    status: 'active',
    updatedAt: '2026-10-01T00:00:00.000Z',
    tagNames: [],
    assigneeId: null,
    content: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    isAllDay: false,
    timeZone: 'Europe/Madrid',
    ...overrides,
  };
}

describe('review', () => {
  it('RF-2301: overdue outranks a later low-priority task and the list stays at most 7', () => {
    const tasks = [
      task({ id: 'later', priority: 'low', dueDate: '2026-11-01T00:00:00.000Z' }),
      task({ id: 'late', priority: 'high', dueDate: '2026-10-17T00:00:00.000Z' }),
      task({ id: 'soon', priority: 'medium', dueDate: '2026-10-18T18:00:00.000Z' }),
      task({
        id: 'done',
        status: 'completed',
        priority: 'high',
        dueDate: '2026-10-17T00:00:00.000Z',
      }),
    ];
    const proposal = proposeDaily(tasks, now, null, { now, timeZone: 'Europe/Madrid' });
    expect(proposal.task_ids[0]).toBe('late');
    expect(proposal.task_ids).not.toContain('done');
    expect(proposal.rule).toContain('no decide sola');
  });

  it('RF-2301: a filter rule can drop a task before scoring', () => {
    const proposal = proposeDaily(
      [
        task({
          id: 'casa',
          tagNames: ['casa'],
          priority: 'high',
          dueDate: '2026-10-17T00:00:00.000Z',
        }),
      ],
      now,
      {
        combinator: 'AND',
        groups: [
          { combinator: 'AND', conditions: [{ field: 'tag', op: 'any_of', value: ['otra'] }] },
        ],
      },
      { now, timeZone: 'Europe/Madrid' },
    );
    expect(proposal.task_ids).toEqual([]);
  });

  it('RF-2302: weekly review lists overdue, undated, quiet lists and habits at risk', () => {
    const review = proposeWeekly(
      [
        task({ id: 'late', dueDate: '2026-10-01T00:00:00.000Z' }),
        task({ id: 'free', dueDate: null, listId: 'quiet' }),
      ],
      [
        { id: 'water', name: 'Agua', missedDays: 3 },
        { id: 'walk', name: 'Andar', missedDays: 1 },
      ],
      now,
      7,
    );
    expect(review.overdue_ids).toEqual(['late']);
    expect(review.undated_ids).toEqual(['free']);
    expect(review.stale_list_ids).toContain('quiet');
    expect(review.habits_at_risk).toEqual(['water']);
  });
});
