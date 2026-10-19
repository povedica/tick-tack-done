import { describe, expect, it } from 'vitest';
import { eventVisibleToCaller } from './sync-visibility';

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
});
