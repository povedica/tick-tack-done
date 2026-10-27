import { describe, expect, it } from 'vitest';
import {
  PROJECT_STALE_DAYS,
  actionDateChip,
  activityLabel,
  nextAction,
  orderBoardItems,
  projectAttention,
  projectDayLabel,
  projectProgress,
  type ProjectTask,
} from './overview';

const now = '2026-10-27T12:00:00.000Z';

function task(patch: Partial<ProjectTask> & Pick<ProjectTask, 'id' | 'title'>): ProjectTask {
  return {
    status: 'active',
    parentId: null,
    isSomeday: false,
    startDate: null,
    dueDate: null,
    isAllDay: true,
    timeZone: 'UTC',
    sortOrder: 0,
    ...patch,
  };
}

describe('nextAction', () => {
  it('puts overdue tasks ahead of future dates and undated tasks by sort order', () => {
    const chosen = nextAction(
      [
        task({ id: 'later', title: 'Luego', dueDate: '2026-11-02T00:00:00.000Z', sortOrder: 1 }),
        task({ id: 'none-b', title: 'Sin B', sortOrder: 20 }),
        task({ id: 'none-a', title: 'Sin A', sortOrder: 10 }),
        task({ id: 'late', title: 'Ayer', dueDate: '2026-10-26T00:00:00.000Z', sortOrder: 99 }),
        task({
          id: 'child',
          title: 'Subtarea vencida',
          parentId: 'late',
          dueDate: '2026-10-01T00:00:00.000Z',
        }),
        task({
          id: 'dream',
          title: 'Algún día',
          isSomeday: true,
          dueDate: '2026-10-01T00:00:00.000Z',
        }),
        task({
          id: 'done',
          title: 'Hecha',
          status: 'completed',
          dueDate: '2026-10-01T00:00:00.000Z',
        }),
        task({
          id: 'gone',
          title: 'Borrada',
          deletedAt: now,
          dueDate: '2026-10-01T00:00:00.000Z',
        }),
      ],
      now,
    );
    expect(chosen?.taskId).toBe('late');
    expect(chosen?.overdue).toBe(true);
    const rest = nextAction(
      [
        task({ id: 'none-b', title: 'Sin B', sortOrder: 20 }),
        task({ id: 'none-a', title: 'Sin A', sortOrder: 10 }),
        task({ id: 'later', title: 'Luego', dueDate: '2026-11-02T00:00:00.000Z' }),
      ],
      now,
    );
    expect(rest?.taskId).toBe('later');
    expect(
      nextAction(
        [
          task({ id: 'none-b', title: 'Sin B', sortOrder: 20 }),
          task({ id: 'none-a', title: 'Sin A', sortOrder: 10 }),
        ],
        now,
      )?.taskId,
    ).toBe('none-a');
  });

  it('prefers start over due and returns null when nothing qualifies', () => {
    const chosen = nextAction(
      [
        task({
          id: 'both',
          title: 'Empieza antes',
          startDate: '2026-10-28T00:00:00.000Z',
          dueDate: '2026-10-20T00:00:00.000Z',
          isAllDay: true,
        }),
      ],
      now,
    );
    expect(chosen).toMatchObject({
      taskId: 'both',
      actionAt: '2026-10-28T00:00:00.000Z',
      overdue: false,
    });
    expect(nextAction([], now)).toBeNull();
    expect(nextAction([task({ id: 'x', title: 'x', status: 'cancelled' })], now)).toBeNull();
  });
});

describe('projectProgress', () => {
  it('counts top-level tasks and skips cancelled, deleted and subtasks', () => {
    expect(
      projectProgress([
        task({ id: 'open', title: 'Abierta' }),
        task({ id: 'done', title: 'Hecha', status: 'completed' }),
        task({ id: 'archived', title: 'Archivada', status: 'archived' }),
        task({ id: 'cancelled', title: 'No', status: 'cancelled' }),
        task({ id: 'child', title: 'Hija', parentId: 'open', status: 'completed' }),
        task({ id: 'deleted', title: 'Fuera', deletedAt: now, status: 'completed' }),
      ]),
    ).toEqual({ done_count: 1, total_count: 3, open_count: 1 });
    expect(projectProgress([])).toEqual({ done_count: 0, total_count: 0, open_count: 0 });
  });
});

describe('projectAttention', () => {
  const action = { taskId: 'a' };

  it('flags a missing next action and a 14-day gap only while the project is active', () => {
    expect(PROJECT_STALE_DAYS).toBe(14);
    expect(
      projectAttention({ state: 'active', nextAction: null, lastActivityAt: now }, now, 'UTC'),
    ).toBe('no_next_action');
    expect(
      projectAttention(
        { state: 'active', nextAction: action, lastActivityAt: '2026-10-13T12:00:00.000Z' },
        now,
        'UTC',
      ),
    ).toBe('stale');
    expect(
      projectAttention(
        { state: 'active', nextAction: action, lastActivityAt: '2026-10-14T12:00:00.000Z' },
        now,
        'UTC',
      ),
    ).toBeNull();
    expect(
      projectAttention({ state: 'active', nextAction: action, lastActivityAt: null }, now, 'UTC'),
    ).toBe('stale');
    expect(
      projectAttention({ state: 'paused', nextAction: null, lastActivityAt: null }, now, 'UTC'),
    ).toBeNull();
    expect(
      projectAttention({ state: 'archived', nextAction: action, lastActivityAt: null }, now, 'UTC'),
    ).toBeNull();
    expect(
      projectAttention(
        { state: 'active', nextAction: action, lastActivityAt: 'not-a-date' },
        now,
        'UTC',
      ),
    ).toBe('stale');
  });
});

describe('activity labels', () => {
  it('says today, yesterday, a day count, then a calendar day', () => {
    expect(activityLabel(now, now, 'UTC')).toBe('activo hoy');
    expect(activityLabel('2026-10-26T08:00:00.000Z', now, 'UTC')).toBe('activo ayer');
    expect(activityLabel('2026-10-24T08:00:00.000Z', now, 'UTC')).toBe('activo hace 3 días');
    expect(activityLabel('2026-10-20T08:00:00.000Z', now, 'UTC')).toBe('activo el 20 oct');
    expect(activityLabel('2026-10-20T08:00:00.000Z', now, 'UTC', 'en')).toBe('active on Oct 20');
    expect(activityLabel('nope', now, 'UTC')).toBe('');
    expect(projectDayLabel('2026-10-18T22:30:00.000Z', 'Europe/Madrid')).toBe('19 oct');
  });

  it('colors yesterday as overdue and today as today', () => {
    expect(
      actionDateChip(
        {
          startDate: null,
          dueDate: '2026-10-26T00:00:00.000Z',
          isAllDay: true,
          timeZone: 'UTC',
        },
        now,
      ),
    ).toEqual({ text: 'ayer', tone: 'overdue' });
    expect(
      actionDateChip(
        {
          startDate: null,
          dueDate: '2026-10-27T00:00:00.000Z',
          isAllDay: true,
          timeZone: 'UTC',
        },
        now,
      ),
    ).toEqual({ text: 'hoy', tone: 'today' });
    expect(
      actionDateChip(
        {
          startDate: null,
          dueDate: '2026-10-30T00:00:00.000Z',
          isAllDay: true,
          timeZone: 'UTC',
        },
        now,
      )?.tone,
    ).toBe('later');
    expect(
      actionDateChip({ startDate: null, dueDate: null, isAllDay: true, timeZone: 'UTC' }, now),
    ).toBeNull();
  });
});

describe('orderBoardItems', () => {
  it('orders open projects by overdue, date and name, and archived by closed_at', () => {
    const ordered = orderBoardItems([
      {
        id: 'plain',
        name: 'zeta',
        state: 'active' as const,
        closedAt: null,
        nextAction: null,
      },
      {
        id: 'future',
        name: 'beta',
        state: 'paused' as const,
        closedAt: null,
        nextAction: { overdue: false, actionAt: '2026-11-01T00:00:00.000Z' },
      },
      {
        id: 'older-archive',
        name: 'viejo',
        state: 'archived' as const,
        closedAt: '2026-10-01T00:00:00.000Z',
        nextAction: null,
      },
      {
        id: 'late',
        name: 'alfa',
        state: 'active' as const,
        closedAt: null,
        nextAction: { overdue: true, actionAt: '2026-10-20T00:00:00.000Z' },
      },
      {
        id: 'newer-archive',
        name: 'nuevo',
        state: 'archived' as const,
        closedAt: '2026-10-18T00:00:00.000Z',
        nextAction: null,
      },
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      'late',
      'future',
      'plain',
      'newer-archive',
      'older-archive',
    ]);
  });
});
