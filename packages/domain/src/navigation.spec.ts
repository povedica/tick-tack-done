import { describe, expect, it } from 'vitest';
import { NAVIGATION_MODULES, navigationOrder, moveNavigationModule } from './navigation';

describe('account navigation order', () => {
  it('preserves saved order, removes unknown and duplicate values and appends new modules', () => {
    expect(
      navigationOrder(['dashboard', 'dashboard', 'unknown', 'statistics']).slice(0, 3),
    ).toEqual(['dashboard', 'statistics', 'calendar']);
    expect(navigationOrder(null)).toEqual([...NAVIGATION_MODULES]);
  });
  it('moves a module to a target position without losing disabled modules', () => {
    const moved = moveNavigationModule([...NAVIGATION_MODULES], 'dashboard', 'calendar');
    expect(moved[0]).toBe('dashboard');
    expect(new Set(moved).size).toBe(NAVIGATION_MODULES.length);
    expect(moveNavigationModule(moved, 'dashboard', 'dashboard')).toEqual(moved);
  });
  it('moves downward when dropped onto the immediately following module', () => {
    expect(moveNavigationModule(NAVIGATION_MODULES, 'calendar', 'matrix').slice(0, 2)).toEqual([
      'matrix',
      'calendar',
    ]);
  });
});
