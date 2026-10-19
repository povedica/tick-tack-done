import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { actorOf, type AuthUser } from './auth-user.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { pageLimit } from '../http/cursor.js';
import { DomainException } from '../http/domain.exception.js';
import { asJson } from '../http/json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActivityEntryDto,
  ActivityPageDto,
  TokenCreatedDto,
  TokenDto,
  TokenPageDto,
} from './tokens.dto.js';
import { isApiScope } from './scopes.js';
import { requireBrowserSession } from './session-access.js';
import { newPersonalAccessToken } from './token-secret.js';

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async list(
    user: AuthUser,
    limitRaw: unknown,
    cursorRaw: string | undefined,
  ): Promise<TokenPageDto> {
    const limit = pageLimit(limitRaw);
    const cursor = decodeTimeCursor(cursorRaw);
    const rows = await this.prisma.personalAccessToken.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return pageTokens(rows, limit);
  }

  async create(
    user: AuthUser,
    nameRaw: string,
    scopes: readonly string[],
  ): Promise<TokenCreatedDto> {
    requireBrowserSession(user);
    const name = nameRaw.trim();
    if (name.length === 0 || name.length > 80) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'name must be 1 to 80 characters',
      );
    }
    const unique = dedupe(scopes);
    if (unique.length === 0 || unique.some((scope) => !isApiScope(scope))) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'scopes must be a non-empty list of known scopes',
      );
    }
    const issued = newPersonalAccessToken();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.personalAccessToken.create({
          data: {
            ownerId: user.id,
            name,
            tokenHash: issued.hash,
            tokenPrefix: issued.prefix,
            scopes: unique,
          },
        });
        const body = toToken(created);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.tokenCreated,
          entityType: 'personal_access_token',
          entityId: created.id,
          action: 'created',
          data: { token: asJson(body) },
          previous: null,
        });
        return created;
      });
      return Object.assign({}, toToken(row), { token: issued.token });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'token_name_taken',
          'An active token with this name already exists',
        );
      }
      throw error;
    }
  }

  async revoke(user: AuthUser, id: string): Promise<void> {
    requireBrowserSession(user);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.personalAccessToken.findFirst({
        where: { id, ownerId: user.id, deletedAt: null },
      });
      if (current === null) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'token_not_found', 'Token was not found');
      }
      if (current.revokedAt !== null) {
        return;
      }
      const row = await tx.personalAccessToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.tokenRevoked,
        entityType: 'personal_access_token',
        entityId: id,
        action: 'deleted',
        data: { token: asJson(toToken(row)) },
        previous: { revoked_at: null },
      });
    });
  }

  async activity(
    user: AuthUser,
    tokenId: string,
    limitRaw: unknown,
    cursorRaw: string | undefined,
  ): Promise<ActivityPageDto> {
    const token = await this.prisma.personalAccessToken.findFirst({
      where: { id: tokenId, ownerId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (token === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'token_not_found', 'Token was not found');
    }
    return this.activityPage(user.id, tokenId, limitRaw, cursorRaw);
  }

  accountActivity(
    user: AuthUser,
    limitRaw: unknown,
    cursorRaw: string | undefined,
  ): Promise<ActivityPageDto> {
    return this.activityPage(user.id, null, limitRaw, cursorRaw);
  }

  private async activityPage(
    ownerId: string,
    tokenId: string | null,
    limitRaw: unknown,
    cursorRaw: string | undefined,
  ): Promise<ActivityPageDto> {
    const limit = pageLimit(limitRaw);
    const cursor = decodeTimeCursor(cursorRaw);
    const rows = await this.prisma.activityLog.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(tokenId === null ? {} : { tokenId }),
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toActivity);
    const last = items.at(-1);
    return {
      items,
      next_cursor:
        hasMore && last !== undefined ? encodeTimeCursor(last.created_at, last.id) : null,
    };
  }
}

function toToken(row: TokenRow): TokenDto {
  return {
    id: row.id,
    name: row.name,
    token_prefix: row.tokenPrefix,
    scopes: [...row.scopes],
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt === null ? null : row.lastUsedAt.toISOString(),
    revoked_at: row.revokedAt === null ? null : row.revokedAt.toISOString(),
  };
}

function pageTokens(rows: readonly TokenRow[], limit: number): TokenPageDto {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toToken);
  const last = items.at(-1);
  return {
    items,
    next_cursor: hasMore && last !== undefined ? encodeTimeCursor(last.created_at, last.id) : null,
  };
}

function toActivity(row: {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  changes: Prisma.JsonValue;
  createdAt: Date;
  tokenId: string | null;
}): ActivityEntryDto {
  return {
    id: row.id,
    entity_type: row.entityType,
    entity_id: row.entityId,
    action: row.action,
    changes: changesObject(row.changes),
    created_at: row.createdAt.toISOString(),
    token_id: row.tokenId,
  };
}

function changesObject(value: Prisma.JsonValue): object {
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  return {};
}

function dedupe(scopes: readonly string[]): string[] {
  const unique: string[] = [];
  for (const scope of scopes) {
    if (!unique.includes(scope)) {
      unique.push(scope);
    }
  }
  return unique;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

interface TimeCursor {
  readonly createdAt: Date;
  readonly id: string;
}

function encodeTimeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt, i: id }), 'utf8').toString('base64url');
}

function decodeTimeCursor(cursor: string | undefined): TimeCursor | null {
  if (cursor === undefined || cursor.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('cursor');
    }
    const record = parsed as Record<string, unknown>;
    const stamp = record.t;
    const id = record.i;
    if (typeof stamp !== 'string' || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      throw new Error('cursor');
    }
    const createdAt = new Date(stamp);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('cursor');
    }
    return { createdAt, id };
  } catch (error) {
    if (error instanceof DomainException) {
      throw error;
    }
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'cursor is invalid');
  }
}
