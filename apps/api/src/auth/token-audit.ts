import { Inject, Injectable } from '@nestjs/common';
import type { Tx } from '../prisma/tx.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type TokenOutcome = 'allowed' | 'scope_missing' | 'rate_limited';
export type TokenLifecycle = 'issued' | 'refreshed' | 'revoked' | 'reused';

@Injectable()
export class TokenAudit {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: {
    readonly ownerId: string;
    readonly tokenId: string;
    readonly method: string;
    readonly path: string;
    readonly outcome: TokenOutcome;
  }): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        ownerId: input.ownerId,
        actorId: input.ownerId,
        tokenId: input.tokenId,
        entityType: 'http_request',
        entityId: input.tokenId,
        action: 'accessed',
        changes: {
          method: input.method,
          path: input.path,
          outcome: input.outcome,
        },
      },
    });
  }

  /** Issuance, refresh, revocation and reuse of an OAuth token. No secret is stored. */
  async lifecycle(
    tx: Tx,
    input: { readonly ownerId: string; readonly tokenId: string; readonly kind: TokenLifecycle },
  ): Promise<void> {
    const action =
      input.kind === 'revoked' || input.kind === 'reused'
        ? 'deleted'
        : input.kind === 'refreshed'
          ? 'updated'
          : 'created';
    await tx.activityLog.create({
      data: {
        ownerId: input.ownerId,
        actorId: input.ownerId,
        tokenId: input.tokenId,
        entityType: 'oauth_token',
        entityId: input.tokenId,
        action,
        changes: { outcome: input.kind },
      },
    });
  }
}
