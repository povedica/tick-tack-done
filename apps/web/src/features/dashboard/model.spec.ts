import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGETS, parseLayout, gardenLists } from './model';

describe('garden layout from the public API', () => {
  it('uses defaults only before a saved layout exists, allowing an intentionally empty garden', () => {
    expect(parseLayout(undefined)).toEqual(DEFAULT_WIDGETS);
    expect(parseLayout([])).toEqual([]);
  });
  it('merges legacy project and completion cards and adds the new KPI visibility settings once', () => {
    const layout = parseLayout([
      { widget_key: 'projects' },
      { widget_key: 'load' },
      { widget_key: 'completed_week' },
    ]);
    expect(layout.map((item) => item.widget_key)).toEqual([
      'load',
      'completed_today',
      'score',
      'streak',
      'tags',
      'in_flight_projects',
    ]);
    expect(parseLayout(layout)).toEqual(layout);
  });
  it('sorts list bars by pending count, preserves zero, and does not fabricate missing overdue counts', () => {
    const lists = gardenLists({
      load: {
        by_list: [
          { list_id: 'b', name: 'B', active: 0 },
          { list_id: 'a', name: 'A', active: 8 },
        ],
      },
    });
    expect(lists.map((item) => item.id)).toEqual(['a', 'b']);
    expect(lists[1]?.active).toBe(0);
    expect(lists[0]?.overdue).toBeNull();
  });
  it('preserves saved ordering and size while excluding duplicate or unsupported widgets', () => {
    expect(
      parseLayout([
        { widget_key: 'habits', position: 3, size: 'l' },
        { widget_key: 'load', position: 1, size: 's' },
        { widget_key: 'load', position: 2, size: 'm' },
        { widget_key: 'unknown', position: 0 },
        { widget_key: 'flow', position: 4 },
        { widget_key: 'integrations', position: 5 },
      ]),
    ).toEqual([
      { widget_key: 'load', size: 's' },
      { widget_key: 'habits', size: 'l' },
      { widget_key: 'in_flight_projects', size: 'l' },
    ]);
  });
  it('keeps a saved in-flight card where it was and leaves an empty garden empty', () => {
    expect(
      parseLayout([
        { widget_key: 'in_flight_projects', size: 'l' },
        { widget_key: 'habits', size: 'm' },
      ]).map((item) => item.widget_key),
    ).toEqual(['in_flight_projects', 'habits']);
  });
});
