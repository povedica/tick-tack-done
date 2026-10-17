import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asJson } from '../http/json';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/tx';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IdempotentHit {
  readonly statusCode: number;
  readonly body: unknown;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async lookup(
    ownerId: string,
    key: string | undefined,
    fingerprint: string,
  ): Promise<IdempotentHit | null> {
    if (key === undefined) {
      return null;
    }
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { ownerId_key: { ownerId, key } },
    });
    if (existing === null) {
      return null;
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.idempotencyRecord.delete({ where: { id: existing.id } });
      return null;
    }
    if (existing.fingerprint !== fingerprint) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'idempotency_conflict',
        'Idempotency-Key was reused with a different request',
      );
    }
    return { statusCode: existing.statusCode, body: existing.responseBody };
  }

  async run<T>(input: {
    readonly ownerId: string;
    readonly key: string | undefined;
    readonly fingerprint: string;
    readonly statusCode: number;
    readonly execute: (tx: Tx) => Promise<T>;
  }): Promise<{ statusCode: number; body: T; replayed: boolean }> {
    const hit = await this.lookup(input.ownerId, input.key, input.fingerprint);
    if (hit !== null) {
      return { statusCode: hit.statusCode, body: hit.body as T, replayed: true };
    }
    try {
      const body = await this.prisma.$transaction(async (tx) => {
        const created = await input.execute(tx);
        await this.store(tx, {
          ownerId: input.ownerId,
          key: input.key,
          fingerprint: input.fingerprint,
          statusCode: input.statusCode,
          body: asJson(created),
        });
        return created;
      });
      return { statusCode: input.statusCode, body, replayed: false };
    } catch (error) {
      if (input.key !== undefined && isIdempotencyUnique(error)) {
        const again = await this.lookup(input.ownerId, input.key, input.fingerprint);
        if (again !== null) {
          return { statusCode: again.statusCode, body: again.body as T, replayed: true };
        }
      }
      throw error;
    }
  }

  async store(
    tx: Tx,
    input: {
      readonly ownerId: string;
      readonly key: string | undefined;
      readonly fingerprint: string;
      readonly statusCode: number;
      readonly body: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    if (input.key === undefined) {
      return;
    }
    await tx.idempotencyRecord.create({
      data: {
        ownerId: input.ownerId,
        key: input.key,
        fingerprint: input.fingerprint,
        statusCode: input.statusCode,
        responseBody: input.body,
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
  }
}

function isIdempotencyUnique(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('key');
  }
  return typeof target === 'string' && target.includes('key');
}
