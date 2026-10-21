import { describe, expect, it } from 'vitest';
import { sectionOf, sectionShowsDetailPane, sectionShowsSidebar } from './section-of';

describe('sectionOf (TTD-AUD-61)', () => {
  it.each([
    ['/today', 'tasks'],
    ['/inbox', 'tasks'],
    ['/list/abc', 'tasks'],
    ['/smart/trash', 'tasks'],
    ['/calendar/month', 'calendar'],
    ['/calendar/day', 'calendar'],
    ['/matrix', 'matrix'],
    ['/focus', 'focus'],
    ['/habits', 'habits'],
    ['/countdowns', 'countdowns'],
    ['/statistics', 'stats'],
    ['/search', 'search'],
    ['/settings/features', 'settings'],
  ] as const)('%s → %s', (path, section) => {
    expect(sectionOf(path)).toBe(section);
  });

  it('hides the secondary sidebar outside tasks and calendar', () => {
    expect(sectionShowsSidebar('tasks')).toBe(true);
    expect(sectionShowsSidebar('calendar')).toBe(true);
    expect(sectionShowsSidebar('habits')).toBe(false);
    expect(sectionShowsSidebar('focus')).toBe(false);
    expect(sectionShowsSidebar('matrix')).toBe(false);
  });

  it('75.2/75.9 keeps the fixed detail column only in Tasks', () => {
    expect(sectionShowsDetailPane('tasks')).toBe(true);
    for (const section of [
      'calendar',
      'matrix',
      'search',
      'focus',
      'stats',
      'settings',
      'other',
    ] as const) {
      expect(sectionShowsDetailPane(section)).toBe(false);
    }
    expect(sectionShowsDetailPane('habits')).toBe(false);
  });
});
