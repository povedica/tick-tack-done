import { describe, expect, it } from 'vitest';
import { rangeQuery, sqlText, summaryQuery, type ZoomRead } from './calendar-zoom.sql.js';

const read: ZoomRead = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  from: '2026-03-01',
  to: '2026-03-31',
  lists: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  tags: [],
  cals: [],
  includeTasks: true,
  includeEvents: true,
  workMode: 'all',
  workProjects: [],
  workFolders: [],
  workTags: [],
  full: false,
  cursor: null,
  limit: 500,
};

describe('calendar zoom SQL', () => {
  it('filters lists before the summary aggregate and does not apply them to events', () => {
    const text = sqlText(summaryQuery(read));
    const tasks = text.split('event_days AS')[0] ?? '';
    const events = text.split('event_days AS')[1] ?? '';
    expect(tasks.indexOf('project_id')).toBeGreaterThan(-1);
    expect(tasks.indexOf('project_id')).toBeLessThan(tasks.indexOf('GROUP BY'));
    expect(events).toContain('s.visible = TRUE');
    expect(events).not.toContain('project_id');
    expect(text).not.toContain('calendar_entries');
  });

  it('pages with the keyset after the list predicate, and an empty allowlist drops tasks', () => {
    const text = sqlText(rangeQuery(read));
    expect(text.indexOf('project_id')).toBeLessThan(text.indexOf('ORDER BY'));
    expect(text.indexOf('ORDER BY')).toBeLessThan(text.indexOf('LIMIT'));
    expect(text).toContain('local_start_day, page.starts_at, page.id');
    const blocked = sqlText(rangeQuery({ ...read, lists: [] }));
    const taskSide = blocked.split('UNION ALL')[0] ?? '';
    expect(taskSide).toContain('FALSE');
    const eventSide = blocked.split('UNION ALL')[1] ?? '';
    expect(eventSide).toContain('s.visible = TRUE');
    expect(eventSide).not.toContain('project_id');
  });
});
