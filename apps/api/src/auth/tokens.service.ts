import { randomUUID } from 'node:crypto';
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
import type { Tx } from '../prisma/tx.js';
import { isApiScope, isOauthScope } from './scopes.js';
import { requireBrowserSession } from './session-access.js';
import { TokenAudit } from './token-audit.js';
import { newPersonalAccessToken } from './token-secret.js';
import { lockOauthGrant, revokeRefreshChainsForAccess } from './oauth-refresh.js';

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  oauthClientId: string | null;
  expiresAt: Date | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  oauthClient?: { name: string } | null;
  refreshTokens?: { rotatedAt: Date | null }[];
  activity?: { changes: Prisma.JsonValue }[];
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(TokenAudit) private readonly audit: TokenAudit,
  ) {}

  async list(
    user: AuthUser,
    limitRaw: unknown,
    cursorRaw: string | undefined,
    status?: string,
    kind?: string,
  ): Promise<TokenPageDto> {
    const limit = pageLimit(limitRaw);
    const cursor = decodeTimeCursor(cursorRaw);
    if (status !== undefined && status !== 'active' && status !== 'revoked') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'status must be active or revoked',
      );
    }
    if (kind !== undefined && kind !== 'personal' && kind !== 'oauth')
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'kind must be personal or oauth',
      );
    const where: Prisma.PersonalAccessTokenWhereInput = {
      ownerId: user.id,
      deletedAt: null,
      ...(kind === 'personal'
        ? { oauthClientId: null }
        : kind === 'oauth'
          ? { oauthClientId: { not: null } }
          : {}),
      ...(status === 'active' ? { revokedAt: null } : {}),
      ...(status === 'revoked'
        ? { revokedAt: { not: null }, refreshTokens: { none: { rotatedAt: { not: null } } } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.personalAccessToken.findMany({
        where: {
          ...where,
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
        select: {
          id: true,
          name: true,
          tokenPrefix: true,
          scopes: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
          oauthClientId: true,
          expiresAt: true,
          oauthClient: { select: { name: true } },
          refreshTokens: { select: { rotatedAt: true } },
          activity: {
            where: { entityType: 'oauth_token', action: 'deleted' },
            select: { changes: true },
          },
        },
      }),
      this.prisma.personalAccessToken.count({ where }),
    ]);
    return { ...pageTokens(rows, limit), total };
  }

  async create(
    user: AuthUser,
    nameRaw: string,
    scopes: readonly string[],
    expiresInDays?: number | null,
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
    if (expiresInDays != null && ![30, 90, 365].includes(expiresInDays))
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid token lifetime',
      );
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
            expiresAt:
              expiresInDays == null ? null : new Date(Date.now() + expiresInDays * 86_400_000),
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
      const now = new Date();
      const extra = await revokeRefreshChainsForAccess(tx, id, now);
      const row = await tx.personalAccessToken.update({
        where: { id },
        data: { revokedAt: now },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.tokenRevoked,
        entityType: 'personal_access_token',
        entityId: id,
        action: 'deleted',
        data: { token: asJson(toToken(row)) },
        previous: { revoked_at: null },
      });
      await this.audit.lifecycle(tx, { ownerId: user.id, tokenId: id, kind: 'revoked' });
      for (const sibling of extra) {
        await this.audit.lifecycle(tx, { ownerId: user.id, tokenId: sibling, kind: 'revoked' });
      }
    });
  }

  /** OAuth access token. The caller owns the transaction. Does not require a browser session. */
  async issueOauthAccess(
    tx: Tx,
    input: {
      readonly user: AuthUser;
      readonly name: string;
      readonly scopes: readonly string[];
      readonly clientId: string;
      readonly expiresAt: Date;
    },
  ): Promise<{ readonly id: string; readonly token: string }> {
    const unique = dedupe(input.scopes);
    if (unique.length === 0 || unique.some((scope) => !isOauthScope(scope))) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'scopes must be a non-empty list of known scopes',
      );
    }
    // Pick a distinct name before INSERT: a uniqueness error aborts the caller's PostgreSQL
    // transaction, so retrying inside it cannot recover. The UI displays the client name.
    const name = `${input.name.trim().slice(0, 43)}-${randomUUID()}`;
    const issued = newPersonalAccessToken();
    const created = await tx.personalAccessToken.create({
      data: {
        ownerId: input.user.id,
        name,
        tokenHash: issued.hash,
        tokenPrefix: issued.prefix,
        scopes: unique,
        expiresAt: input.expiresAt,
        oauthClientId: input.clientId,
      },
    });
    const body = toToken(created);
    await this.events.record(tx, actorOf(input.user), {
      type: DomainEvent.tokenCreated,
      entityType: 'personal_access_token',
      entityId: created.id,
      action: 'created',
      data: { token: asJson(body) },
      previous: null,
    });
    return { id: created.id, token: issued.token };
  }

  async renewals(user: AuthUser) {
    requireBrowserSession(user);
    const groups = await this.prisma.oauthRefreshToken.groupBy({
      by: ['clientId'],
      where: { userId: user.id, rotatedAt: { not: null } },
      _count: { _all: true },
    });
    const clients = await this.prisma.oauthClient.findMany({
      where: { id: { in: groups.map((group) => group.clientId) } },
      select: { id: true, name: true },
    });
    return {
      items: groups.map((group) => ({
        client_id: group.clientId,
        client_name: clients.find((client) => client.id === group.clientId)?.name ?? '',
        count: group._count._all,
        revoked_reason: 'rotated',
      })),
    };
  }

  async grants(user: AuthUser) {
    requireBrowserSession(user);
    const now = new Date();
    const [tokens, refresh] = await Promise.all([
      this.prisma.personalAccessToken.findMany({
        where: { ownerId: user.id, deletedAt: null, oauthClientId: { not: null } },
        include: { oauthClient: { select: { name: true } } },
      }),
      this.prisma.oauthRefreshToken.findMany({
        where: { userId: user.id },
        select: {
          clientId: true,
          familyId: true,
          revokedAt: true,
          expiresAt: true,
          rotatedAt: true,
        },
      }),
    ]);
    const ids = [
      ...new Set(tokens.map((row) => row.oauthClientId).filter((id): id is string => id !== null)),
    ];
    return {
      items: ids
        .flatMap((id) => {
          const rows = tokens.filter((row) => row.oauthClientId === id);
          const live = rows.filter(
            (row) => row.revokedAt === null && (row.expiresAt === null || row.expiresAt > now),
          );
          const families = new Set(
            refresh
              .filter((row) => row.clientId === id && row.revokedAt === null && row.expiresAt > now)
              .map((row) => row.familyId),
          );
          if (live.length === 0 && families.size === 0) return [];
          const used =
            rows
              .flatMap((row) => (row.lastUsedAt ? [row.lastUsedAt.toISOString()] : []))
              .sort()
              .at(-1) ?? null;
          return [
            {
              client_id: id,
              client_name: rows[0]?.oauthClient?.name ?? '',
              authorized_at:
                rows.map((row) => row.createdAt.toISOString()).sort()[0] ?? now.toISOString(),
              last_used_at: used,
              active_access_tokens: live.length,
              active_refresh_families: families.size,
              renewals: refresh.filter((row) => row.clientId === id && row.rotatedAt !== null)
                .length,
              scopes: [
                ...new Set(
                  [
                    ...live,
                    ...rows.filter(
                      (row) =>
                        refresh.some(
                          (item) =>
                            item.clientId === id && item.revokedAt === null && item.expiresAt > now,
                        ) && row.revokedAt === null,
                    ),
                  ].flatMap((row) => row.scopes),
                ),
              ],
            },
          ];
        })
        .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')),
    };
  }

  async revokeGrant(user: AuthUser, clientId: string): Promise<void> {
    requireBrowserSession(user);
    await this.prisma.$transaction(async (tx) => {
      await lockOauthGrant(tx, user.id, clientId);
      const rows = await tx.personalAccessToken.findMany({
        where: { ownerId: user.id, oauthClientId: clientId, deletedAt: null },
        select: { id: true, revokedAt: true },
      });
      if (rows.length === 0)
        throw new DomainException(HttpStatus.NOT_FOUND, 'not_found', 'Application was not found');
      const now = new Date();
      await tx.personalAccessToken.updateMany({
        where: { ownerId: user.id, oauthClientId: clientId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.oauthRefreshToken.updateMany({
        where: { userId: user.id, clientId, revokedAt: null },
        data: { revokedAt: now },
      });
      for (const row of rows.filter((item) => item.revokedAt === null)) {
        await this.audit.lifecycle(tx, { ownerId: user.id, tokenId: row.id, kind: 'revoked' });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.tokenRevoked,
          entityType: 'oauth_token',
          entityId: row.id,
          action: 'deleted',
          data: { client_id: clientId },
          previous: null,
        });
      }
    });
  }

  async grantActivity(
    user: AuthUser,
    clientId: string,
    limitRaw: unknown,
    cursorRaw: string | undefined,
  ): Promise<ActivityPageDto> {
    requireBrowserSession(user);
    const rows = await this.prisma.personalAccessToken.findMany({
      where: { ownerId: user.id, oauthClientId: clientId },
      select: { id: true },
    });
    if (rows.length === 0)
      throw new DomainException(HttpStatus.NOT_FOUND, 'not_found', 'Application was not found');
    return this.activityPage(
      user.id,
      rows.map((row) => row.id),
      limitRaw,
      cursorRaw,
    );
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
    tokenId: string | readonly string[] | null,
    limitRaw: unknown,
    cursorRaw: string | undefined,
  ): Promise<ActivityPageDto> {
    const limit = pageLimit(limitRaw);
    const cursor = decodeTimeCursor(cursorRaw);
    const rows = await this.prisma.activityLog.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(tokenId === null
          ? {}
          : { tokenId: typeof tokenId === 'string' ? tokenId : { in: [...tokenId] } }),
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
    revoked_reason:
      row.revokedAt === null
        ? null
        : row.activity?.some(
              (item) =>
                typeof item.changes === 'object' &&
                item.changes !== null &&
                !Array.isArray(item.changes) &&
                item.changes.outcome === 'reused',
            )
          ? 'reuse'
          : row.refreshTokens?.some((item) => item.rotatedAt !== null)
            ? 'rotated'
            : 'user',
    name: row.name,
    token_prefix: row.tokenPrefix,
    oauth_client_id: row.oauthClientId,
    expires_at: row.expiresAt?.toISOString() ?? null,
    scopes: [...row.scopes],
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt === null ? null : row.lastUsedAt.toISOString(),
    revoked_at: row.revokedAt === null ? null : row.revokedAt.toISOString(),
    client_name: row.oauthClient?.name ?? null,
  };
}

function pageTokens(rows: readonly TokenRow[], limit: number): Omit<TokenPageDto, 'total'> {
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
