import { NotificationsController } from '../notifications/notifications.controller.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ReminderTransport } from '../scheduler/reminder.transport.js';
import { ViewPreferencesController } from './view-preferences.controller.js';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountService } from './account.service.js';
import { AttemptLimiter } from './attempt-limiter.js';
import { ApiAuthGuard } from './api-auth.guard.js';
import { AuthController } from './auth.controller.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';
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
    NotificationsController,
    ViewPreferencesController,
    TokensController,
    AuthController,
    PasswordResetController,
    OauthController,
    OauthBrowserController,
    OauthDiscoveryController,
    TotpController,
  ],
  providers: [
    MeService,
    NotificationsService,
    ReminderTransport,
    AccountService,
    AuthService,
    PasswordResetService,
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
