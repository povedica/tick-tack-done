import { describe, expect, it } from 'vitest';
import {
  SYNC_PAGE_DEFAULT,
  SYNC_PAGE_MAX,
  isTombstoneType,
  syncLimit,
  tombstoneCutoff,
} from './page';

describe('sync page', () => {
  it('RF-13014: the default page is 100 and the maximum is 200', () => {
    expect(syncLimit(undefined)).toBe(SYNC_PAGE_DEFAULT);
    expect(syncLimit(1)).toBe(1);
    expect(syncLimit(SYNC_PAGE_MAX)).toBe(SYNC_PAGE_MAX);
    expect(syncLimit(0)).toBeNull();
    expect(syncLimit(SYNC_PAGE_MAX + 1)).toBeNull();
  });

  it('RF-13014: tombstones expire after 90 days', () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    expect(tombstoneCutoff(now).toISOString()).toBe('2026-07-20T12:00:00.000Z');
    expect(isTombstoneType('task.deleted@v1')).toBe(true);
    expect(isTombstoneType('task.updated@v1')).toBe(false);
  });
});
