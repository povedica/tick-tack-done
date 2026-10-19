import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyService } from './idempotency.service.js';

describe('IdempotencyService.run', () => {
  it('gives the interactive transaction 15 seconds', async () => {
    const transaction = vi.fn((work: (tx: unknown) => Promise<unknown>) => work({}));
    const prisma = {
      idempotencyRecord: { findUnique: vi.fn() },
      $transaction: transaction,
    };
    const service = new IdempotencyService(prisma as never);
    await service.run({
      ownerId: 'owner',
      key: undefined,
      fingerprint: 'fingerprint',
      statusCode: 201,
      execute: () => Promise.resolve({ ok: true }),
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });

  it('logs P2028 with the call site and no request body', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('expired', {
      code: 'P2028',
      clientVersion: 'test',
    });
    const prisma = {
      idempotencyRecord: { findUnique: vi.fn() },
      $transaction: vi.fn(() => {
        throw error;
      }),
    };
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new IdempotencyService(prisma as never);
    await expect(
      service.run({
        ownerId: 'owner',
        key: undefined,
        fingerprint: 'fingerprint',
        statusCode: 201,
        execute: () => Promise.resolve({ secret: 'do-not-log' }),
      }),
    ).rejects.toBe(error);
    expect(logged).toHaveBeenCalledWith('interactive transaction timed out IdempotencyService.run');
    const text = logged.mock.calls.map((call) => String(call[0])).join('\n');
    expect(text).not.toContain('do-not-log');
    logged.mockRestore();
  });
});
