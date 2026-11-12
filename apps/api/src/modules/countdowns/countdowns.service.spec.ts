import { describe, expect, it, vi } from 'vitest';
import { CountdownsService } from './countdowns.service.js';
import type { AuthUser } from '../../auth/auth-user.js';

const user = { id: 'owner', timeZone: 'Europe/Madrid' } as AuthUser;
function row(id: string, date: string, pinned = false) {
  return {
    id,
    ownerId: user.id,
    title: id,
    targetDate: new Date(`${date}T00:00:00Z`),
    type: 'countdown',
    repeatRule: 'none',
    dayMode: 'standard',
    pinned,
    sortOrder: 0,
    emoji: null,
    notes: null,
    color: null,
    archivedAt: null,
    deletedAt: null,
    showInSidebar: true,
    showInSmartList: true,
    reminders: [],
  };
}

describe('RF-2431 countdown pagination', () => {
  it('RF-2404: paginates the computed pin/date order without duplicates and scopes cursors', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        row('late', '2099-12-31'),
        row('near', '2099-01-01'),
        row('pinned', '2099-06-01', true),
      ]);
    const service = new CountdownsService(
      { countdown: { findMany } } as never,
      {} as never,
      {} as never,
    );
    const first = await service.list(user, false, undefined, { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(['pinned', 'near']);
    expect(first.next_cursor).not.toBeNull();
    if (first.next_cursor === null) throw new Error('missing next cursor');
    const second = await service.list(user, false, undefined, {
      limit: 2,
      cursor: first.next_cursor,
    });
    expect(second.items.map((item) => item.id)).toEqual(['late']);
    expect(second.next_cursor).toBeNull();
    await expect(
      service.list(user, true, undefined, { limit: 2, cursor: first.next_cursor }),
    ).rejects.toThrow('cursor is invalid');
    await expect(
      service.list({ ...user, id: 'other' }, false, undefined, {
        limit: 2,
        cursor: first.next_cursor,
      }),
    ).rejects.toThrow('cursor is invalid');
    await expect(
      service.list(user, false, undefined, { limit: 2, cursor: 'invalid' }),
    ).rejects.toThrow('cursor is invalid');
    await expect(service.list(user, false, undefined, { limit: 0 })).rejects.toThrow('limit');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: user.id, deletedAt: null, archivedAt: null } }),
    );
  });

  it('RF-2434: filters due dates before pagination and retains unpaged callers', async () => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: user.timeZone }).format(new Date());
    const service = new CountdownsService(
      {
        countdown: {
          findMany: vi.fn().mockResolvedValue([row('today', today), row('later', '2099-12-31')]),
        },
      } as never,
      {} as never,
      {} as never,
    );
    expect((await service.list(user, false, 0, { limit: 1 })).items.map((item) => item.id)).toEqual(
      ['today'],
    );
    expect((await service.list(user, false)).items).toHaveLength(2);
  });
});
