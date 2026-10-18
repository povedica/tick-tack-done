import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiAuthGuard } from './api-auth.guard';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { TokenAudit } from './token-audit';
import { TokenRateLimiter } from './token-rate-limit';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';

@Module({
  controllers: [MeController, TokensController],
  providers: [
    MeService,
    TokensService,
    TokenAudit,
    TokenRateLimiter,
    { provide: APP_GUARD, useClass: ApiAuthGuard },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AuthModule {}
