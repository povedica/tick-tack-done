import { describe, expect, it } from 'vitest';
import {
  canonicalSmartKey,
  visibleFilters,
  visibleProjects,
  visibleSmartLists,
  type FilterRow,
  type ProjectRow,
  type SmartListRow,
} from './sidebar-model';

function smart(partial: Partial<SmartListRow> & Pick<SmartListRow, 'key'>): SmartListRow {
  return {
    enabled: true,
    sortOrder: '65536',
    taskCount: 0,
    ...partial,
  };
}

function project(partial: Partial<ProjectRow> & Pick<ProjectRow, 'id'>): ProjectRow {
  return {
    name: partial.id,
    color: '#4f46e5',
    kind: 'TASK',
    closed: false,
    isInbox: false,
    sortOrder: '65536',
    activeTaskCount: 1,
    ...partial,
  };
}

function filter(partial: Partial<FilterRow> & Pick<FilterRow, 'id'>): FilterRow {
  return {
    name: partial.id,
    color: '#4f46e5',
    sortOrder: '65536',
    taskCount: 2,
    ...partial,
  };
}

describe('sidebar model', () => {
  it('UI-102: enabled smart lists keep the backend count and leave trash last', () => {
    const links = visibleSmartLists([
      smart({ key: 'trash', sortOrder: '1', taskCount: 4 }),
      smart({ key: 'tomorrow', sortOrder: '3', taskCount: 2 }),
      smart({ key: 'today', sortOrder: '2', taskCount: 7 }),
      smart({ key: 'assigned_to_me', sortOrder: '4', taskCount: 9 }),
      smart({ key: 'next_7_days', sortOrder: '5', taskCount: 1, enabled: false }),
    ]);
    expect(links.map((link) => [link.key, link.count, link.to])).toEqual([
      ['today', 7, '/today'],
      ['tomorrow', 2, '/smart/tomorrow'],
      ['trash', 4, '/smart/trash'],
    ]);
    expect(links[2]?.separated).toBe(true);
    expect(canonicalSmartKey('next7')).toBe('next_7_days');
    expect(canonicalSmartKey('no-date')).toBe('no_date');
    expect(canonicalSmartKey('recent')).toBe('recently_added');
    expect(canonicalSmartKey('all')).toBe('all');
  });

  it('lists a task project with its color dot and hides inbox, notes and closed lists', () => {
    const lists = visibleProjects([
      project({ id: 'notes', kind: 'NOTE', name: 'Notas', sortOrder: '1' }),
      project({ id: 'inbox', isInbox: true, name: 'Bandeja', sortOrder: '2' }),
      project({ id: 'old', closed: true, name: 'Archivo', sortOrder: '3' }),
      project({
        id: 'personal',
        name: 'Personal',
        color: '#4F46E5',
        sortOrder: '20',
        activeTaskCount: 3,
      }),
      project({ id: 'work', name: 'Trabajo', color: 'blue', sortOrder: '100', activeTaskCount: 0 }),
    ]);
    expect(lists).toEqual([
      {
        id: 'personal',
        name: 'Personal',
        to: '/list/personal',
        color: '#4F46E5',
        count: 3,
      },
      { id: 'work', name: 'Trabajo', to: '/list/work', color: null, count: 0 },
    ]);
  });

  it('orders saved filters by sort order and omits the section when there are none', () => {
    expect(visibleFilters([])).toEqual([]);
    expect(
      visibleFilters([
        filter({ id: 'b', name: 'Luego', sortOrder: '131072', taskCount: 1, color: null }),
        filter({ id: 'a', name: 'Informes', sortOrder: '65536', taskCount: 8 }),
      ]).map((item) => [item.name, item.count, item.to]),
    ).toEqual([
      ['Informes', 8, '/filter/a'],
      ['Luego', 1, '/filter/b'],
    ]);
  });
});
