import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from './auth-user';
import { actorOf } from './auth-user';
import { DomainEvent } from '../events/domain-events';
import { EventRecorder } from '../events/event-recorder';
import { DomainException } from '../http/domain.exception';
import { asJson } from '../http/json';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateOauthClientDto,
  OauthClientDto,
  OauthConsentDto,
  OauthConsentViewDto,
  OauthRedirectDto,
  OauthTokenDto,
  OauthTokenResponseDto,
} from './oauth.dto';
import { pkceMatches } from './pkce';
import { isApiScope } from './scopes';
import { hashSecret } from './session-cookie';
import { TokensService } from './tokens.service';

const CODE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class OauthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async createClient(user: AuthUser, dto: CreateOauthClientDto): Promise<OauthClientDto> {
    const row = await this.prisma.oauthClient.create({
      data: { ownerId: user.id, name: dto.name.trim(), redirectUris: dto.redirect_uris },
    });
    return { id: row.id, name: row.name, redirect_uris: [...row.redirectUris] };
  }

  async describe(user: AuthUser, query: ConsentQuery): Promise<OauthConsentViewDto> {
    const client = await this.requireClient(user.id, query.client_id, query.redirect_uri);
    return {
      client_name: client.name,
      scopes: parseScopes(query.scope),
      redirect_uri: query.redirect_uri,
    };
  }

  async consent(user: AuthUser, dto: OauthConsentDto): Promise<OauthRedirectDto> {
    const client = await this.requireClient(user.id, dto.client_id, dto.redirect_uri);
    const scopes = parseScopes(dto.scope);
    const url = new URL(dto.redirect_uri);
    url.searchParams.set('state', dto.state);
    if (!dto.allow) {
      url.searchParams.set('error', 'access_denied');
      return { redirect_to: url.toString() };
    }
    const code = randomBytes(32).toString('base64url');
    await this.prisma.oauthAuthorizationCode.create({
      data: {
        clientId: client.id,
        userId: user.id,
        codeHash: hashSecret(code),
        codeChallenge: dto.code_challenge,
        scopes,
        redirectUri: dto.redirect_uri,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    url.searchParams.set('code', code);
    return { redirect_to: url.toString() };
  }

  async token(dto: OauthTokenDto): Promise<OauthTokenResponseDto> {
    const row = await this.prisma.oauthAuthorizationCode.findFirst({
      where: { codeHash: hashSecret(dto.code), consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (row === null || row.clientId !== dto.client_id || row.redirectUri !== dto.redirect_uri) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Authorization code is invalid',
      );
    }
    if (!pkceMatches(dto.code_verifier, row.codeChallenge)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'PKCE verification failed',
      );
    }
    const consumed = await this.prisma.oauthAuthorizationCode.updateMany({
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
    const owner = await this.prisma.user.findFirst({
      where: { id: row.userId, deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (owner === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_grant',
        'Authorization code is invalid',
      );
    }
    const user: AuthUser = {
      id: owner.id,
      email: owner.email,
      timeZone: owner.timeZone,
      completeChildren: owner.taskCompleteChildren,
      scopes: row.scopes,
      tokenId: null,
      sessionId: null,
    };
    const issued = await this.tokens.create(
      user,
      `oauth:${row.clientId.slice(0, 8)}:${randomBytes(3).toString('hex')}`,
      row.scopes,
    );
    await this.prisma.$transaction((tx) =>
      this.events.record(tx, actorOf(user), {
        type: DomainEvent.oauthTokenIssued,
        entityType: 'oauth_client',
        entityId: row.clientId,
        action: 'created',
        data: asJson({ client_id: row.clientId, scopes: row.scopes }),
        previous: null,
      }),
    );
    return { access_token: issued.token, token_type: 'Bearer', scope: row.scopes.join(' ') };
  }

  private async requireClient(
    ownerId: string,
    clientId: string,
    redirectUri: string,
  ): Promise<{ id: string; name: string; redirectUris: string[] }> {
    const client = await this.prisma.oauthClient.findFirst({
      where: { id: clientId, ownerId, deletedAt: null },
    });
    if (client?.redirectUris.includes(redirectUri) !== true) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_client',
        'OAuth client was not found',
      );
    }
    return client;
  }
}

interface ConsentQuery {
  readonly client_id: string;
  readonly redirect_uri: string;
  readonly scope: string;
}

export function parseScopes(raw: string): string[] {
  const scopes = raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  const unique = [...new Set(scopes)];
  if (unique.length === 0 || unique.some((scope) => !isApiScope(scope))) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'scope must list known scopes',
    );
  }
  return unique;
}
