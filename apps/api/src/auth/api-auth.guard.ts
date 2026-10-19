import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';
import { missingScopes, SESSION_SCOPES } from './scopes';
import { PUBLIC_KEY, SCOPES_KEY } from './scopes.decorator';
import {
  hashSecret,
  secretsMatch,
  SESSION_COOKIE,
  SESSION_IDLE_MS,
  SESSION_MAX_AGE_MS,
} from './session-cookie';
import { TokenAudit } from './token-audit';
import { applyRateLimitHeaders, TokenRateLimiter } from './token-rate-limit';
import { hashPersonalAccessToken, parseBearer } from './token-secret';

interface TokenRow {
  readonly id: string;
  readonly ownerId: string;
  readonly scopes: string[];
}

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
    const cookie = readCookie(request);
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
    request.user = { ...user, scopes: token.scopes, tokenId: token.id, sessionId: null };
    await this.prisma.personalAccessToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
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
      where: { tokenHash: hashPersonalAccessToken(secret), revokedAt: null, deletedAt: null },
      select: { id: true, ownerId: true, scopes: true },
    });
    return row;
  }

  private async loadUser(id: string): Promise<Omit<AuthUser, 'scopes' | 'tokenId' | 'sessionId'>> {
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
    await this.prisma.session.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    const user = await this.loadUser(row.userId);
    return { ...user, scopes: [...SESSION_SCOPES], tokenId: null, sessionId: row.id };
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

function readCookie(request: Request): string | null {
  const header = request.header('cookie');
  if (header === undefined) {
    return null;
  }
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      const value = rest.join('=');
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function requestPath(request: Request): string {
  const raw = request.originalUrl.length > 0 ? request.originalUrl : request.url;
  const path = raw.split('?')[0] ?? raw;
  return path.slice(0, 300);
}
