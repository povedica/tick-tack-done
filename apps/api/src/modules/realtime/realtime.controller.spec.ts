import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../auth/auth-user.js';
import { RealtimeController } from './realtime.controller.js';

const user = {
  id: 'user-1',
  tokenId: null,
  scopes: ['tasks:read'],
} as AuthUser;

describe('realtime SSE', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a database failure during the stream is caught and does not reject', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const findMany = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('db down'));
    const controller = new RealtimeController({ outboxEvent: { findMany } } as never);
    const req = new EventEmitter();
    const res = { flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn() };

    await controller.stream(user, undefined, undefined, req as never, res as never);
    expect(findMany).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('"job":"stream"');
    expect(String(error.mock.calls[0]?.[0])).toContain('db down');
  });
});
