import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { DomainException } from '../http/domain.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { missingScopes, SESSION_SCOPES } from './scopes.js';
import { PUBLIC_KEY, SCOPES_KEY } from './scopes.decorator.js';
import {
  hashSecret,
  readSessionCookie,
  secretsMatch,
  SESSION_IDLE_MS,
  SESSION_MAX_AGE_MS,
} from './session-cookie.js';
import { TokenAudit } from './token-audit.js';
import { createHash } from 'node:crypto';
import { dayKey } from '@reflexionia/domain';
import { applyRateLimitHeaders, TokenRateLimiter } from './token-rate-limit.js';
import { trustedMcpSource } from '../mcp/internal-source.js';
import { hashPersonalAccessToken, parseBearer } from './token-secret.js';

interface TokenRow {
  readonly id: string;
  readonly ownerId: string;
  readonly scopes: string[];
  readonly lastUsedAt: Date | null;
  readonly listRestricted: boolean;
  readonly listIds: string[];
}

const TOUCH_AFTER_MS = 60_000;

/**
 * Dev requests (X-Dev-User-Email, AUTH_MODE=dev) still receive every scope the route declares.
 * A bearer PAT does not: a missing scope is 403 scope_missing, and the dev header is ignored.
 */
@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenRateLimiter) private readonly rateLimit: TokenRateLimiter,
    @Inject(TokenAudit) private readonly audit: TokenAudit,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const cls = context.getClass();
    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(SCOPES_KEY, [
      handler,
      cls,
    ]);
    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, [handler, cls]) === true;
    if (isPublic) {
      return true;
    }
    const scopes = required ?? [];

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const bearer = parseBearer(request.header('authorization'));
    if (bearer.kind === 'invalid') {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid token');
    }
    if (bearer.kind === 'token') {
      await this.authenticateToken(request, response, bearer.token, scopes);
      return true;
    }
    const devEmail = request.header('x-dev-user-email');
    if (process.env.AUTH_MODE === 'dev' && (devEmail?.trim().length ?? 0) > 0) {
      request.user = await this.devUser(devEmail);
      return true;
    }
    const cookie = readSessionCookie(request.header('cookie'));
    if (cookie !== null) {
      request.user = await this.sessionUser(request, cookie);
      return true;
    }
    request.user = await this.devUser(devEmail);
    return true;
  }

  private async authenticateToken(
    request: Request & { user?: AuthUser },
    response: Response,
    secret: string,
    scopes: readonly string[],
  ): Promise<void> {
    const token = await this.findToken(secret);
    if (token === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid token');
    }
    const user = await this.loadUser(token.ownerId);
    const decision = this.rateLimit.consume(token.id);
    applyRateLimitHeaders(response, decision);
    request.user = {
      ...user,
      requestSource: trustedMcpSource({
        remoteAddress: request.socket.remoteAddress,
        method: request.method,
        path: request.originalUrl,
        authorization: request.header('authorization') ?? '',
        source: request.header('x-ttd-source'),
        timestamp: request.header('x-ttd-internal-time'),
        proof: request.header('x-ttd-internal-proof'),
      })
        ? 'mcp'
        : 'api',
      scopes: token.scopes,
      tokenId: token.id,
      sessionId: null,
      listIds: token.listRestricted ? token.listIds : null,
    };
    await this.touchLastUsed('token', token.id, token.lastUsedAt);
    const path = requestPath(request);
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.retryAfter));
      await this.audit.record({
        ownerId: user.id,
        tokenId: token.id,
        method: request.method,
        path,
        outcome: 'rate_limited',
      });
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: decision.retryAfter,
      });
    }
    const missing = missingScopes(token.scopes, scopes);
    if (missing.length > 0) {
      await this.audit.record({
        ownerId: user.id,
        tokenId: token.id,
        method: request.method,
        path,
        outcome: 'scope_missing',
      });
      throw new DomainException(HttpStatus.FORBIDDEN, 'scope_missing', 'Missing scope', {
        missing,
      });
    }
    await this.audit.record({
      ownerId: user.id,
      tokenId: token.id,
      method: request.method,
      path,
      outcome: 'allowed',
    });
  }

  private async findToken(secret: string): Promise<TokenRow | null> {
    const row = await this.prisma.personalAccessToken.findFirst({
      where: {
        tokenHash: hashPersonalAccessToken(secret),
        revokedAt: null,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        id: true,
        ownerId: true,
        scopes: true,
        lastUsedAt: true,
        listRestricted: true,
        listIds: true,
      },
    });
    return row;
  }

  private async loadUser(
    id: string,
  ): Promise<Omit<AuthUser, 'scopes' | 'tokenId' | 'sessionId' | 'listIds'>> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (user === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid token');
    }
    return {
      id: user.id,
      email: user.email,
      timeZone: user.timeZone,
      completeChildren: user.taskCompleteChildren,
    };
  }

  private async devUser(emailHeader: string | undefined): Promise<AuthUser> {
    if (process.env.AUTH_MODE !== 'dev') {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Authentication required');
    }
    const email = emailHeader?.trim() ?? '';
    if (email.length === 0) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Missing dev user');
    }
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (user === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Unknown dev user');
    }
    return {
      id: user.id,
      email: user.email,
      timeZone: user.timeZone,
      completeChildren: user.taskCompleteChildren,
      scopes: [...SESSION_SCOPES],
      tokenId: null,
      sessionId: null,
      listIds: null,
    };
  }

  private async sessionUser(
    request: Request & { csrfToken?: string },
    secret: string,
  ): Promise<AuthUser> {
    const row = await this.prisma.session.findFirst({
      where: { tokenHash: hashSecret(secret), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, csrfToken: true, lastUsedAt: true, createdAt: true },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid session');
    }
    const now = Date.now();
    const idle = now - row.lastUsedAt.getTime() > SESSION_IDLE_MS;
    const absolute = now - row.createdAt.getTime() > SESSION_MAX_AGE_MS;
    if (idle || absolute) {
      await this.prisma.session.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid session');
    }
    assertCsrf(request, row.csrfToken);
    request.csrfToken = row.csrfToken;
    await this.touchLastUsed('session', row.id, row.lastUsedAt);
    const user = await this.loadUser(row.userId);
    const date = dayKey(new Date().toISOString(), user.timeZone);
    if (date !== null) {
      // The existing UUID primary key makes concurrent first requests idempotent.
      const hash = createHash('sha256').update(`daily_use:${user.id}:${date}`).digest('hex');
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      await this.prisma.activityLog.createMany({
        data: [
          {
            id,
            ownerId: user.id,
            actorId: user.id,
            entityType: 'daily_use',
            entityId: user.id,
            action: 'accessed',
            changes: { date },
          },
        ],
        skipDuplicates: true,
      });
    }
    return {
      ...user,
      scopes: [...SESSION_SCOPES],
      tokenId: null,
      sessionId: row.id,
      listIds: null,
    };
  }

  private async touchLastUsed(
    kind: 'session' | 'token',
    id: string,
    lastUsedAt: Date | null,
  ): Promise<void> {
    if (lastUsedAt !== null && Date.now() - lastUsedAt.getTime() < TOUCH_AFTER_MS) {
      return;
    }
    const data = { lastUsedAt: new Date() };
    if (kind === 'session') {
      await this.prisma.session.update({ where: { id }, data });
      return;
    }
    await this.prisma.personalAccessToken.update({ where: { id }, data });
  }
}

function assertCsrf(request: Request, csrf: string): void {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return;
  }
  const header = request.header('x-csrf-token');
  if (header === undefined || header.length === 0) {
    throw new DomainException(HttpStatus.FORBIDDEN, 'csrf_required', 'CSRF token is required');
  }
  if (!secretsMatch(header, csrf)) {
    throw new DomainException(HttpStatus.FORBIDDEN, 'csrf_invalid', 'CSRF token is invalid');
  }
}

function requestPath(request: Request): string {
  const raw = request.originalUrl.length > 0 ? request.originalUrl : request.url;
  const path = raw.split('?')[0] ?? raw;
  return path.slice(0, 300);
}
