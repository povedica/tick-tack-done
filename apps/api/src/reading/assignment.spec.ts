import { describe, expect, it } from 'vitest';
import { assignmentOf, keptAssignedBy, latestAssignment, type AssignmentEvent } from './assignment';

const at = (iso: string): Date => new Date(iso);

describe('assignment', () => {
  it('keeps the newest assignment and marks it unread until the assignee opens it', () => {
    const events: AssignmentEvent[] = [
      { action: 'assigned', actorId: 'maria', createdAt: at('2026-11-10T09:00:00.000Z') },
      { action: 'assigned', actorId: 'lucas', createdAt: at('2026-11-10T12:00:00.000Z') },
      { action: 'accessed', actorId: 'ana', createdAt: at('2026-11-10T10:00:00.000Z') },
    ];
    expect(latestAssignment(events)?.actorId).toBe('lucas');
    const actors = new Map([['lucas', { name: 'Lucas', avatarUrl: null }]]);
    expect(assignmentOf({ assigneeId: 'ana', viewerId: 'ana', events, actors })).toMatchObject({
      assigned_by: { id: 'lucas', name: 'Lucas', avatar_url: null },
      assigned_at: '2026-11-10T12:00:00.000Z',
      unread: true,
    });
    const seen: AssignmentEvent[] = [
      ...events,
      { action: 'accessed', actorId: 'ana', createdAt: at('2026-11-10T13:00:00.000Z') },
    ];
    expect(assignmentOf({ assigneeId: 'ana', viewerId: 'ana', events: seen, actors })?.unread).toBe(
      false,
    );
    expect(assignmentOf({ assigneeId: 'ana', viewerId: 'lucas', events, actors })?.unread).toBe(
      false,
    );
    expect(assignmentOf({ assigneeId: null, viewerId: 'ana', events, actors })).toBeNull();
  });

  it('drops a task once another person reassigns it', () => {
    const rows = [
      { entityId: 'task-1', actorId: 'me', createdAt: at('2026-11-10T09:00:00.000Z') },
      { entityId: 'task-1', actorId: 'other', createdAt: at('2026-11-11T09:00:00.000Z') },
      { entityId: 'task-2', actorId: 'me', createdAt: at('2026-11-11T08:00:00.000Z') },
    ];
    expect(keptAssignedBy('me', rows)).toEqual(['task-2']);
  });
});
