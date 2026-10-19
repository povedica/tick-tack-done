import { describe, expect, it } from 'vitest';
import { eventVisibleToCaller, syncAndFilters } from './sync-visibility.js';

describe('sync visibility', () => {
  it('hides sessions and tokens from a tasks:read PAT and keeps task events', () => {
    const scopes = ['tasks:read'];
    expect(eventVisibleToCaller('task.created@v1', scopes, true)).toBe(true);
    expect(eventVisibleToCaller('session.created@v1', scopes, true)).toBe(false);
    expect(eventVisibleToCaller('token.created@v1', scopes, true)).toBe(false);
    expect(eventVisibleToCaller('telegram.linked@v1', scopes, true)).toBe(false);
    expect(eventVisibleToCaller('project.created@v1', scopes, true)).toBe(false);
    expect(eventVisibleToCaller('session.created@v1', scopes, false)).toBe(true);
  });

  it('S-22: the cursor OR does not replace the scope OR', () => {
    const occurredAt = new Date('2026-10-19T12:00:00.000Z');
    const and = syncAndFilters(
      { OR: [{ type: { startsWith: 'task.' } }, { type: { startsWith: 'checklist_item.' } }] },
      {
        OR: [{ occurredAt: { gt: occurredAt } }, { occurredAt, id: { gt: 'cursor' } }],
      },
    );
    expect(and).toHaveLength(2);
    expect(and[0]).toEqual({
      OR: [{ type: { startsWith: 'task.' } }, { type: { startsWith: 'checklist_item.' } }],
    });
    expect(and[1]).toEqual({
      OR: [{ occurredAt: { gt: occurredAt } }, { occurredAt, id: { gt: 'cursor' } }],
    });
  });
});
