import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountService } from './account.service';
import { AttemptLimiter } from './attempt-limiter';
import { ApiAuthGuard } from './api-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { TokenAudit } from './token-audit';
import { TokenRateLimiter } from './token-rate-limit';
import { TotpController, TotpService } from './totp.controller';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';

@Module({
  controllers: [MeController, TokensController, AuthController, OauthController, TotpController],
  providers: [
    MeService,
    AccountService,
    AuthService,
    OauthService,
    TokensService,
    TotpService,
    TokenAudit,
    TokenRateLimiter,
    AttemptLimiter,
    { provide: APP_GUARD, useClass: ApiAuthGuard },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module is decorator-only
export class AuthModule {}
