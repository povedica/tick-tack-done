import { describe, expect, it } from 'vitest';
import { stripNestedActivity, taskEventSnapshot } from './task-event-snapshot.js';

describe('taskEventSnapshot (TTD-AUD-65)', () => {
  it('omits activity and shrinks checklist/subtasks', () => {
    const detail = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Demo',
      checklist_progress: { completed: 0, total: 1 },
      items: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          status: 'active',
        },
      ],
      subtasks: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          status: 'active',
          title: 'Child',
        },
      ],
      activity: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          action: 'created',
          changes: { task: { title: 'Demo', activity: [{ action: 'created' }] } },
        },
      ],
    };
    const snap = taskEventSnapshot(detail);
    expect(snap).not.toHaveProperty('activity');
    expect(JSON.stringify(snap)).not.toContain('"activity"');
    expect(snap.items).toEqual([{ id: '44444444-4444-4444-8444-444444444444', status: 'active' }]);
    expect(snap.subtasks).toEqual([
      {
        id: '55555555-5555-4555-8555-555555555555',
        status: 'active',
        title: 'Child',
      },
    ]);
    expect(snap.item_count).toBe(1);
    expect(snap.title).toBe('Demo');
  });

  it('stripNestedActivity removes activity at any depth', () => {
    const cleaned = stripNestedActivity({
      data: {
        task: {
          title: 'x',
          activity: [{ changes: { data: { task: { activity: [] } } } }],
        },
      },
      previous: { activity: [{ id: '1' }], title: 'old' },
    });
    expect(cleaned).toEqual({
      data: { task: { title: 'x' } },
      previous: { title: 'old' },
    });
  });
});
