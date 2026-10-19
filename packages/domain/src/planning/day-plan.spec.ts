import { describe, expect, it } from 'vitest';
import { planQueue, previewPlan, staleTaskIds, type PlanTaskInput } from './day-plan';

const LOCAL = '2026-10-19';
const ZONE = 'Europe/Madrid';

function task(patch: Partial<PlanTaskInput> & Pick<PlanTaskInput, 'id'>): PlanTaskInput {
  return {
    title: patch.id,
    priority: 'none',
    dueDate: null,
    isAllDay: false,
    timeZone: ZONE,
    status: 'active',
    kind: 'task',
    parentId: null,
    projectId: 'list-1',
    projectName: 'Trabajo',
    inbox: false,
    updatedAt: '2026-10-19T08:00:00.000Z',
    createdAt: '2026-10-18T08:00:00.000Z',
    ...patch,
  };
}

describe('planQueue', () => {
  it('keeps every commitment due today when the review cap is smaller', () => {
    const queue = planQueue(
      [
        task({
          id: 'late',
          dueDate: '2026-10-19T16:00:00.000Z',
          priority: 'low',
        }),
        task({
          id: 'early',
          dueDate: '2026-10-19T09:00:00.000Z',
          priority: 'none',
        }),
        task({
          id: 'day',
          dueDate: '2026-10-19T00:00:00.000Z',
          isAllDay: true,
          priority: 'high',
        }),
        task({ id: 'old-a', dueDate: '2026-10-17T10:00:00.000Z', priority: 'high' }),
        task({ id: 'old-b', dueDate: '2026-10-18T10:00:00.000Z', priority: 'low' }),
        task({ id: 'child', parentId: 'early', dueDate: '2026-10-19T09:30:00.000Z' }),
        task({ id: 'note', kind: 'note', dueDate: '2026-10-19T09:00:00.000Z' }),
        task({ id: 'gone', status: 'cancelled', dueDate: '2026-10-19T09:00:00.000Z' }),
      ],
      {
        localDate: LOCAL,
        timeZone: ZONE,
        sources: { today: true, overdue: true, inbox: false, undated: false },
        limit: 1,
      },
    );
    expect(queue.cards.map((card) => card.taskId)).toEqual(['early', 'late', 'day']);
    expect(queue.hiddenOverdue).toBe(2);
    expect(queue.totals.today).toBe(3);
    expect(queue.cards[0]?.reasonText).toContain('Vence hoy a las');
    expect(queue.cards[2]?.reason).toBe('due_today');
  });

  it('orders overdue by priority and keeps an explicit reason', () => {
    const queue = planQueue(
      [
        task({ id: 'low', dueDate: '2026-10-18T08:00:00.000Z', priority: 'low' }),
        task({ id: 'high', dueDate: '2026-10-18T18:00:00.000Z', priority: 'high' }),
      ],
      {
        localDate: LOCAL,
        timeZone: ZONE,
        sources: { today: true, overdue: true, inbox: false, undated: false },
        limit: null,
      },
    );
    expect(queue.cards.map((card) => card.taskId)).toEqual(['high', 'low']);
    expect(queue.cards[0]?.reasonText).toBe('Venció el 18/10/2026');
  });

  it('offers inbox and undated tasks only when those sources are on', () => {
    const tasks = [
      task({ id: 'box', inbox: true }),
      task({ id: 'loose' }),
      task({ id: 'future', dueDate: '2026-10-20T10:00:00.000Z' }),
    ];
    const closed = planQueue(tasks, {
      localDate: LOCAL,
      timeZone: ZONE,
      sources: { today: true, overdue: true, inbox: false, undated: false },
      limit: null,
    });
    const open = planQueue(tasks, {
      localDate: LOCAL,
      timeZone: ZONE,
      sources: { today: true, overdue: true, inbox: true, undated: true },
      limit: null,
    });
    expect(closed.cards).toEqual([]);
    expect(open.cards.map((card) => card.reason)).toEqual(['inbox', 'undated']);
  });
});

describe('previewPlan', () => {
  it('does not describe “La haré hoy” as a due-date change and does not count a cancel as done', () => {
    const queue = planQueue(
      [
        task({ id: 'a', title: 'Informe', dueDate: '2026-10-19T09:00:00.000Z' }),
        task({ id: 'b', title: 'Llamada', dueDate: '2026-10-18T09:00:00.000Z' }),
      ],
      {
        localDate: LOCAL,
        timeZone: ZONE,
        sources: { today: true, overdue: true, inbox: false, undated: false },
        limit: null,
      },
    );
    const preview = previewPlan(queue.cards, [
      { taskId: 'a', decision: 'plan_day', targetDate: null },
      { taskId: 'b', decision: 'cancel', targetDate: null },
    ]);
    expect(preview.plannedToday).toBe(1);
    expect(preview.cancel).toBe(1);
    expect(preview.complete).toBe(0);
    expect(preview.effects.every((effect) => effect.changesDue === false)).toBe(true);
    expect(preview.effects[0]?.summary).toContain('no cambia');
    expect(preview.effects[1]?.summary).toContain('No cuenta como completada');
  });
});

describe('staleTaskIds', () => {
  it('flags a task whose snapshot no longer matches', () => {
    expect(
      staleTaskIds(
        [{ taskId: 'a', updatedAt: '2026-10-19T08:00:00.000Z' }],
        [{ id: 'a', updatedAt: '2026-10-19T09:00:00.000Z' }],
      ),
    ).toEqual(['a']);
  });
});
