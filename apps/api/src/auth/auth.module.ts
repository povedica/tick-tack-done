import { ViewPreferencesController } from './view-preferences.controller.js';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountService } from './account.service.js';
import { AttemptLimiter } from './attempt-limiter.js';
import { ApiAuthGuard } from './api-auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { OauthBrowserController } from './oauth-browser.controller.js';
import { OauthController } from './oauth.controller.js';
import { OauthDiscoveryController } from './oauth-discovery.controller.js';
import { OauthService } from './oauth.service.js';
import { TokenAudit } from './token-audit.js';
import { TokenRateLimiter } from './token-rate-limit.js';
import { TotpController, TotpService } from './totp.controller.js';
import { TokensController } from './tokens.controller.js';
import { TokensService } from './tokens.service.js';

@Module({
  controllers: [
    MeController,
    ViewPreferencesController,
    TokensController,
    AuthController,
    OauthController,
    OauthBrowserController,
    OauthDiscoveryController,
    TotpController,
  ],
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
