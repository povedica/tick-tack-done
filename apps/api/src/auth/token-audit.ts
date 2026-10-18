import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TokenOutcome = 'allowed' | 'scope_missing' | 'rate_limited';

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
}
