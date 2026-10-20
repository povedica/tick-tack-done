import { randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { actorOf } from './auth-user.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainException } from '../http/domain.exception.js';
import { asJson } from '../http/json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Tx } from '../prisma/tx.js';
import type {
  CreateOauthClientDto,
  OauthClientDto,
  OauthConsentDto,
  OauthConsentViewDto,
  OauthRedirectDto,
  OauthTokenDto,
  OauthTokenResponseDto,
  RegisterOauthClientDto,
  RegisteredOauthClientDto,
} from './oauth.dto.js';
import { AttemptLimiter } from './attempt-limiter.js';
import {
  assertOauthResource,
  grantApprovedScopes,
  resolveRequestedScopes,
} from './oauth-grants.js';
import { classifyRefresh, revokeRefreshFamily } from './oauth-refresh.js';
import { acceptsPkceMethod, pkceMatches } from './pkce.js';
import { publicOrigin } from './public-origin.js';
import { isDynamicRedirectUri, isExactRedirect } from './redirect-uri.js';
import {
  hashSecret,
  readSessionCookie,
  SESSION_IDLE_MS,
  SESSION_MAX_AGE_MS,
} from './session-cookie.js';
import { requireBrowserSession } from './session-access.js';
import { TokenAudit } from './token-audit.js';
import { hashPersonalAccessToken, newOauthRefreshToken } from './token-secret.js';
import { TokensService } from './tokens.service.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class RefreshReuse extends Error {
  constructor(readonly familyId: string) {
    super('refresh reuse');
  }
}

@Injectable()
export class OauthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(AttemptLimiter) private readonly attempts: AttemptLimiter,
    @Inject(TokenAudit) private readonly audit: TokenAudit,
  ) {}

  async createClient(user: AuthUser, dto: CreateOauthClientDto): Promise<OauthClientDto> {
    requireBrowserSession(user);
    if (dto.redirect_uris.some((uri) => !isExactRedirect(uri))) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'redirect_uri must be an exact URI',
      );
    }
    const row = await this.prisma.oauthClient.create({
      data: { ownerId: user.id, name: dto.name.trim(), redirectUris: dto.redirect_uris },
    });
    return { id: row.id, name: row.name, redirect_uris: [...row.redirectUris] };
  }

  async registerDynamic(
    dto: RegisterOauthClientDto,
    ip: string,
  ): Promise<RegisteredOauthClientDto> {
    await this.attempts.assertRegistration(ip);
    await this.attempts.recordRegistration(ip);
    if (dto.redirect_uris.some((uri) => !isDynamicRedirectUri(uri))) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'redirect_uri is not allowed',
      );
    }
    if (dto.grant_types?.length === 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'grant_types is invalid',
      );
    }
    if (dto.response_types?.length === 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'response_types is invalid',
      );
    }
    const name = clientName(dto.client_name, dto.redirect_uris);
    const row = await this.prisma.oauthClient.create({
      data: { name, redirectUris: dto.redirect_uris, dynamic: true },
    });
    return {
      client_id: row.id,
      client_name: row.name,
      redirect_uris: [...row.redirectUris],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async describe(user: AuthUser, query: ConsentQuery, ip: string): Promise<OauthConsentViewDto> {
    await this.limitAuthorize(ip, query.client_id);
    this.assertAuthorizeShape(query);
    const client = await this.requireClient(user.id, query.client_id, query.redirect_uri);
    return {
      client_name: client.name,
      scopes: resolveRequestedScopes(query.scope),
      redirect_uri: query.redirect_uri,
    };
  }

  async browserAuthorize(
    query: ConsentQuery,
    cookieHeader: string | undefined,
    ip: string,
  ): Promise<string> {
    await this.attempts.assertAllowed(ip, `oauth-authorize:${query.client_id}`);
    await this.attempts.recordAttempt(ip);
    this.assertAuthorizeShape(query);
    await this.requirePublicClient(query.client_id, query.redirect_uri);
    const params = authorizeParams(query);
    if (!(await this.hasBrowserSession(cookieHeader))) {
      return `/login?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`;
    }
    return `/oauth/consent?${params}`;
  }

  async consent(user: AuthUser, dto: OauthConsentDto, ip: string): Promise<OauthRedirectDto> {
    await this.limitAuthorize(ip, dto.client_id);
    const client = await this.requireClient(user.id, dto.client_id, dto.redirect_uri);
    if (!acceptsPkceMethod(dto.code_challenge_method)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'PKCE method must be S256',
      );
    }
    const resource = assertOauthResource(dto.resource);
    const url = new URL(dto.redirect_uri);
    url.searchParams.set('state', dto.state);
    url.searchParams.set('iss', publicOrigin());
    if (!dto.allow) {
      url.searchParams.set('error', 'access_denied');
      return { redirect_to: url.toString() };
    }
    const scopes = grantApprovedScopes(dto.requested_scope, dto.scope);
    const code = newAuthorizationCode();
    await this.prisma.oauthAuthorizationCode.create({
      data: {
        clientId: client.id,
        userId: user.id,
        codeHash: hashSecret(code),
        codeChallenge: dto.code_challenge,
        scopes,
        redirectUri: dto.redirect_uri,
        ...(resource === null ? {} : { resource }),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    url.searchParams.set('code', code);
    return { redirect_to: url.toString() };
  }

  async token(dto: OauthTokenDto, ip: string): Promise<OauthTokenResponseDto> {
    if (dto.client_secret !== undefined && dto.client_secret.length > 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_client',
        'Public clients have no secret',
      );
    }
    const clientId = dto.client_id ?? 'unknown';
    await this.attempts.assertAllowed(ip, `oauth:${clientId}`);
    await this.attempts.recordAttempt(ip);
    if (dto.grant_type === 'refresh_token') {
      return this.refresh(dto);
    }
    return this.exchangeCode(dto);
  }

  async revokePresented(token: string, ip: string): Promise<void> {
    await this.attempts.assertAllowed(ip, 'oauth-revoke');
    await this.attempts.recordAttempt(ip);
    const hash = hashPersonalAccessToken(token);
    const access = await this.prisma.personalAccessToken.findFirst({
      where: { tokenHash: hash, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (access !== null) {
      await this.revokeAccess(access.ownerId, access.id);
      return;
    }
    const refresh = await this.prisma.oauthRefreshToken.findFirst({
      where: { tokenHash: hash },
      select: { familyId: true, userId: true, accessTokenId: true },
    });
    if (refresh !== null) {
      await this.revokeFamily(refresh.familyId, refresh.userId, 'revoked');
    }
  }

  private async exchangeCode(dto: OauthTokenDto): Promise<OauthTokenResponseDto> {
    if (
      dto.code === undefined ||
      dto.redirect_uri === undefined ||
      dto.client_id === undefined ||
      dto.code_verifier === undefined
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Authorization code is invalid',
      );
    }
    const code = dto.code;
    const redirectUri = dto.redirect_uri;
    const clientId = dto.client_id;
    const verifier = dto.code_verifier;
    const row = await this.prisma.oauthAuthorizationCode.findFirst({
      where: { codeHash: hashSecret(code), consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (row?.clientId !== clientId || row.redirectUri !== redirectUri) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Authorization code is invalid',
      );
    }
    if (!pkceMatches(verifier, row.codeChallenge)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'PKCE verification failed',
      );
    }
    const presented = assertOauthResource(dto.resource);
    if (row.resource !== null && presented !== row.resource) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'invalid_grant', 'resource does not match');
    }
    if (row.resource === null && presented !== null) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'invalid_grant', 'resource does not match');
    }
    const owner = await this.loadOwner(row.userId);
    const client = await this.prisma.oauthClient.findFirst({
      where: { id: row.clientId, deletedAt: null },
      select: { name: true },
    });
    if (client === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Authorization code is invalid',
      );
    }
    const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
    const issued = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.oauthAuthorizationCode.updateMany({
        where: { id: row.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'invalid_grant',
          'Authorization code was already used',
        );
      }
      return this.issuePair(tx, {
        owner,
        clientId: row.clientId,
        clientName: client.name,
        scopes: row.scopes,
        familyId: randomUUID(),
        expiresAt,
        kind: 'issued',
        event: DomainEvent.oauthTokenIssued,
      });
    });
    return issued;
  }

  private async refresh(dto: OauthTokenDto): Promise<OauthTokenResponseDto> {
    if (dto.refresh_token === undefined || dto.client_id === undefined) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Refresh token is invalid',
      );
    }
    const clientId = dto.client_id;
    const hash = hashPersonalAccessToken(dto.refresh_token);
    const row = await this.prisma.oauthRefreshToken.findFirst({
      where: { tokenHash: hash },
      include: { accessToken: { select: { scopes: true, oauthClientId: true } } },
    });
    const decision = classifyRefresh(row, new Date());
    if (
      row === null ||
      decision === 'unknown' ||
      decision === 'expired' ||
      row.clientId !== clientId
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Refresh token is invalid',
      );
    }
    if (decision === 'reuse') {
      await this.revokeFamily(row.familyId, row.userId, 'reused');
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Refresh token was already used',
      );
    }
    const owner = await this.loadOwner(row.userId);
    const client = await this.prisma.oauthClient.findFirst({
      where: { id: row.clientId, deletedAt: null },
      select: { name: true },
    });
    if (client === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Refresh token is invalid',
      );
    }
    const scopes =
      dto.scope === undefined
        ? [...row.accessToken.scopes]
        : grantApprovedScopes(row.accessToken.scopes.join(' '), dto.scope);
    const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const marked = await tx.oauthRefreshToken.updateMany({
          where: { id: row.id, rotatedAt: null, revokedAt: null },
          data: { rotatedAt: new Date() },
        });
        if (marked.count !== 1) {
          throw new RefreshReuse(row.familyId);
        }
        await tx.personalAccessToken.update({
          where: { id: row.accessTokenId },
          data: { revokedAt: new Date() },
        });
        return this.issuePair(tx, {
          owner,
          clientId: row.clientId,
          clientName: client.name,
          scopes,
          familyId: row.familyId,
          expiresAt,
          kind: 'refreshed',
          event: DomainEvent.oauthTokenRefreshed,
        });
      });
    } catch (error) {
      if (error instanceof RefreshReuse) {
        await this.revokeFamily(error.familyId, row.userId, 'reused');
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'invalid_grant',
          'Refresh token was already used',
        );
      }
      throw error;
    }
  }

  private async issuePair(
    tx: Tx,
    input: {
      readonly owner: OwnerRow;
      readonly clientId: string;
      readonly clientName: string;
      readonly scopes: readonly string[];
      readonly familyId: string;
      readonly expiresAt: Date;
      readonly kind: 'issued' | 'refreshed';
      readonly event: string;
    },
  ): Promise<OauthTokenResponseDto> {
    const user: AuthUser = {
      id: input.owner.id,
      email: input.owner.email,
      timeZone: input.owner.timeZone,
      completeChildren: input.owner.completeChildren,
      scopes: input.scopes,
      tokenId: null,
      sessionId: null,
    };
    const access = await this.tokens.issueOauthAccess(tx, {
      user,
      name: input.clientName,
      scopes: input.scopes,
      clientId: input.clientId,
      expiresAt: input.expiresAt,
    });
    const refresh = newOauthRefreshToken();
    await tx.oauthRefreshToken.create({
      data: {
        familyId: input.familyId,
        clientId: input.clientId,
        userId: input.owner.id,
        accessTokenId: access.id,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const actorUser: AuthUser = { ...user, tokenId: access.id };
    await this.events.record(tx, actorOf(actorUser), {
      type: input.event,
      entityType: 'oauth_client',
      entityId: input.clientId,
      action: input.kind === 'issued' ? 'created' : 'updated',
      data: asJson({ client_id: input.clientId, scopes: [...input.scopes] }),
      previous: null,
    });
    await this.audit.lifecycle(tx, {
      ownerId: input.owner.id,
      tokenId: access.id,
      kind: input.kind,
    });
    return {
      access_token: access.token,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refresh.token,
      scope: input.scopes.join(' '),
    };
  }

  private async revokeAccess(ownerId: string, accessTokenId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const links = await tx.oauthRefreshToken.findMany({
        where: { accessTokenId },
        select: { familyId: true },
      });
      const families = [...new Set(links.map((link) => link.familyId))];
      if (families.length === 0) {
        await tx.personalAccessToken.updateMany({
          where: { id: accessTokenId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.lifecycle(tx, { ownerId, tokenId: accessTokenId, kind: 'revoked' });
        return;
      }
      for (const familyId of families) {
        await this.revokeFamilyTx(tx, familyId, ownerId, 'revoked');
      }
    });
  }

  private async revokeFamily(
    familyId: string,
    ownerId: string,
    kind: 'revoked' | 'reused',
  ): Promise<void> {
    await this.prisma.$transaction((tx) => this.revokeFamilyTx(tx, familyId, ownerId, kind));
  }

  private async revokeFamilyTx(
    tx: Tx,
    familyId: string,
    ownerId: string,
    kind: 'revoked' | 'reused',
  ): Promise<void> {
    const now = new Date();
    const accessIds = await revokeRefreshFamily(tx, familyId, now);
    if (accessIds.length === 0) {
      return;
    }
    const active = await tx.personalAccessToken.findMany({
      where: { id: { in: [...accessIds] }, revokedAt: null },
      select: { id: true },
    });
    await tx.personalAccessToken.updateMany({
      where: { id: { in: [...accessIds] }, revokedAt: null },
      data: { revokedAt: now },
    });
    for (const token of active) {
      await this.audit.lifecycle(tx, { ownerId, tokenId: token.id, kind });
      await this.events.record(
        tx,
        {
          ownerId,
          actorId: ownerId,
          actorKind: 'user',
          tokenId: token.id,
        },
        {
          type: DomainEvent.tokenRevoked,
          entityType: 'personal_access_token',
          entityId: token.id,
          action: 'deleted',
          data: asJson({ revoked: true, reason: kind }),
          previous: { revoked_at: null },
        },
      );
    }
  }

  private async limitAuthorize(subject: string, clientId: string): Promise<void> {
    await this.attempts.assertAllowed(subject, `oauth-authorize:${clientId}`);
    await this.attempts.recordAttempt(subject);
  }

  private assertAuthorizeShape(query: ConsentQuery): void {
    if (
      !acceptsPkceMethod(query.code_challenge_method) ||
      query.state.trim().length < 8 ||
      query.code_challenge.length < 43 ||
      query.code_challenge.length > 128
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid authorize request',
      );
    }
    assertOauthResource(query.resource);
    resolveRequestedScopes(query.scope);
  }

  private async requireClient(
    ownerId: string,
    clientId: string,
    redirectUri: string,
  ): Promise<{ id: string; name: string }> {
    const client = await this.prisma.oauthClient.findFirst({
      where: { id: clientId, deletedAt: null },
    });
    if (client?.redirectUris.includes(redirectUri) !== true) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_client',
        'OAuth client was not found',
      );
    }
    if (client.ownerId !== null && client.ownerId !== ownerId) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_client',
        'OAuth client was not found',
      );
    }
    return client;
  }

  private async requirePublicClient(clientId: string, redirectUri: string): Promise<void> {
    const client = await this.prisma.oauthClient.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { redirectUris: true },
    });
    if (client?.redirectUris.includes(redirectUri) !== true) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_client',
        'OAuth client was not found',
      );
    }
  }

  private async hasBrowserSession(cookieHeader: string | undefined): Promise<boolean> {
    const secret = readSessionCookie(cookieHeader);
    if (secret === null) {
      return false;
    }
    const row = await this.prisma.session.findFirst({
      where: { tokenHash: hashSecret(secret), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { lastUsedAt: true, createdAt: true },
    });
    if (row === null) {
      return false;
    }
    const now = Date.now();
    return (
      now - row.lastUsedAt.getTime() <= SESSION_IDLE_MS &&
      now - row.createdAt.getTime() <= SESSION_MAX_AGE_MS
    );
  }

  private async loadOwner(id: string): Promise<OwnerRow> {
    const owner = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (owner === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Authorization code is invalid',
      );
    }
    return {
      id: owner.id,
      email: owner.email,
      timeZone: owner.timeZone,
      completeChildren: owner.taskCompleteChildren,
    };
  }
}

interface ConsentQuery {
  readonly client_id: string;
  readonly redirect_uri: string;
  readonly scope: string;
  readonly state: string;
  readonly code_challenge: string;
  readonly code_challenge_method: string;
  readonly resource?: string;
}

interface OwnerRow {
  readonly id: string;
  readonly email: string;
  readonly timeZone: string;
  readonly completeChildren: AuthUser['completeChildren'];
}

function clientName(requested: string | undefined, redirects: readonly string[]): string {
  const trimmed = requested?.trim() ?? '';
  if (trimmed.length > 0) {
    return trimmed.slice(0, 80);
  }
  return redirects.some((uri) => uri.startsWith('https://chatgpt.com/')) ? 'ChatGPT' : 'OAuth';
}

function authorizeParams(query: ConsentQuery): string {
  const params = new URLSearchParams({
    client_id: query.client_id,
    redirect_uri: query.redirect_uri,
    scope: query.scope,
    state: query.state,
    code_challenge: query.code_challenge,
    code_challenge_method: 'S256',
  });
  if (query.resource !== undefined && query.resource.length > 0) {
    params.set('resource', query.resource);
  }
  return params.toString();
}

function newAuthorizationCode(): string {
  return randomBytes(32).toString('base64url');
}
