import { describe, expect, it } from 'vitest';
import { fromOpenTask, toOpenProject, toOpenTask } from './ticktick';

describe('open api', () => {
  it('maps our task onto TickTick field names', () => {
    const open = toOpenTask({
      id: 'task-1',
      projectId: 'list-1',
      title: 'Informe',
      content: 'texto',
      isAllDay: false,
      startDate: null,
      dueDate: '2026-10-18T10:00:00.000Z',
      timeZone: 'Europe/Madrid',
      repeatRule: 'RRULE:FREQ=DAILY',
      priority: 'high',
      status: 'completed',
      completedAt: '2026-10-18T11:00:00.000Z',
      sortOrder: '65536',
      items: [
        {
          id: 'item-1',
          title: 'Paso',
          status: 'completed',
          completedAt: null,
          isAllDay: false,
          sortOrder: '65536',
          startDate: null,
          timeZone: 'Europe/Madrid',
        },
      ],
    });
    expect(open.projectId).toBe('list-1');
    expect(open.priority).toBe(5);
    expect(open.status).toBe(2);
    expect(open.repeatFlag).toBe('RRULE:FREQ=DAILY');
  });

  it('reads a TickTick write back into our fields', () => {
    expect(fromOpenTask(null)).toBeNull();
    const write = fromOpenTask({
      title: 'Informe',
      projectId: 'list-1',
      priority: 1,
      isAllDay: true,
      dueDate: '2026-10-18T10:00:00.000Z',
      repeatFlag: null,
      content: 'texto',
      startDate: null,
      timeZone: 'Europe/Madrid',
      status: 2,
      completedTime: '2026-01-02T10:00:00.000Z',
    });
    expect(write?.priority).toBe('low');
    expect(write?.status).toBe('completed');
    expect(write?.completedAt).toBe('2026-01-02T10:00:00.000Z');
    expect(write?.repeatRule).toBeNull();
    expect(
      toOpenProject({
        id: 'list-1',
        name: 'Trabajo',
        color: null,
        sortOrder: '65536',
        closed: false,
        folderId: null,
        viewMode: 'list',
        kind: 'TASK',
      }).viewMode,
    ).toBe('list');
  });
});
