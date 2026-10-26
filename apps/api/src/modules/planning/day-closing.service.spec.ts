import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayClosingService } from './day-closing.service.js';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'synthetic@example.test',
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask' as const,
  scopes: ['tasks:write'],
  tokenId: null,
  sessionId: null,
  listIds: null,
};
afterEach(() => vi.useRealTimers());
describe('TTD-AUD-113 replan validation', () => {
  it('rejects a future civil date before querying or creating a session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const db = { task: { findMany: vi.fn() }, planSession: { create: vi.fn() } };
    const service = new DayClosingService(db as never, {} as never, {} as never);
    await expect(
      service.replanTool(user, '2026-10-25', false, [], undefined),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.task.findMany).not.toHaveBeenCalled();
    expect(db.planSession.create).not.toHaveBeenCalled();
  });
  it('excludes due-today and future tasks even when planning a past date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const db = {
      task: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { dueDate: new Date('2026-10-23T22:00:00Z') },
            { dueDate: new Date('2026-10-26T22:00:00Z') },
          ]),
      },
    };
    const service = new DayClosingService(db as never, {} as never, {} as never);
    await expect(service.replanTool(user, '2026-10-20', false, [], undefined)).resolves.toEqual({
      session: null,
      reason: 'nothing_to_replan',
    });
  });
});
