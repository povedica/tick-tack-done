import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { EventActor } from './auth-user.js';
import { AttemptLimiter } from './attempt-limiter.js';
import { isCommonPassword } from './common-passwords.js';
import { humanCheckFromEnv, type HumanCheck } from './human-check.js';
import { hashPassword, verifyPassword } from './passwords.js';
import type {
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  PasswordResetVerifyResponseDto,
} from './password-reset.dto.js';
import { isWellFormedToken, newResetSecret } from './password-reset-token.js';
import { publicOrigin } from './public-origin.js';
import { passwordResetFloorMs, withMinimumDuration } from './response-floor.js';
import type { RequestMeta } from './auth.service.js';
import { hashSecret } from './session-cookie.js';
import { TotpService } from './totp.controller.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainException } from '../http/domain.exception.js';
import { sendEmail, type EmailResult } from '../mail/send-email.js';
import { renderPasswordChanged, renderPasswordReset } from '../mail/templates/password-reset.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_FACTOR_FAILURES = 5;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly humans: HumanCheck = humanCheckFromEnv();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(AttemptLimiter) private readonly attempts: AttemptLimiter,
  ) {}

  async request(dto: PasswordResetRequestDto, meta: RequestMeta): Promise<void> {
    const floor = passwordResetFloorMs();
    await withMinimumDuration(() => this.requestInner(dto, meta), floor.ms, floor.jitter);
  }

  async verify(token: string, meta: RequestMeta): Promise<PasswordResetVerifyResponseDto> {
    await this.guardConfirmIp(meta);
    const row = await this.findLive(token);
    if (row === null) {
      throw invalidToken();
    }
    return {
      valid: true,
      totp_required: row.user.totpEnabled,
      expires_at: row.expiresAt.toISOString(),
    };
  }

  async confirm(dto: PasswordResetConfirmDto, meta: RequestMeta): Promise<void> {
    await this.guardConfirmIp(meta);
    const row = await this.findLive(dto.token);
    if (row === null) {
      throw invalidToken();
    }
    try {
      await this.totp.assertLogin(row.userId, {
        ...(dto.totp_code === undefined ? {} : { totp_code: dto.totp_code }),
        ...(dto.recovery_code === undefined ? {} : { recovery_code: dto.recovery_code }),
      });
    } catch (error) {
      await this.bumpFailures(row.id);
      throw error;
    }
    if (isCommonPassword(dto.new_password)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'password_too_common',
        'Choose a less common password',
      );
    }
    if (
      row.user.passwordHash !== null &&
      (await verifyPassword(row.user.passwordHash, dto.new_password))
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'password_reused',
        'Choose a different password',
      );
    }
    const passwordHash = await hashPassword(dto.new_password);
    const now = new Date();
    const actor: EventActor = {
      ownerId: row.userId,
      actorId: row.userId,
      actorKind: 'user',
      tokenId: null,
    };
    await this.prisma.$transaction(async (tx) => {
      const spent = await tx.passwordResetToken.updateMany({
        where: {
          id: row.id,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (spent.count !== 1) {
        throw invalidToken();
      }
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.oauthRefreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.personalAccessToken.updateMany({
        where: { ownerId: row.userId, oauthClientId: { not: null }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.activityLog.create({
        data: {
          ownerId: row.userId,
          actorId: row.userId,
          entityType: 'user',
          entityId: row.userId,
          action: 'updated',
          changes: { outcome: 'password_reset', ip: meta.ip },
        },
      });
      await this.events.record(tx, actor, {
        type: DomainEvent.accountPasswordReset,
        entityType: 'user',
        entityId: row.userId,
        action: 'updated',
        data: { user: { id: row.userId } },
        previous: null,
      });
    });
    await this.attempts.clearSubject(row.user.email);
    const manuals = await this.prisma.personalAccessToken.findMany({
      where: { ownerId: row.userId, oauthClientId: null, revokedAt: null, deletedAt: null },
      select: { name: true },
    });
    void this.sendChanged(
      row,
      meta,
      manuals.map((item) => item.name),
    ).catch(() => undefined);
  }

  private async requestInner(dto: PasswordResetRequestDto, meta: RequestMeta): Promise<void> {
    await this.humans.assert(dto.captcha_token);
    const email = dto.email.trim().toLowerCase();
    const ip = meta.ip ?? 'unknown';
    await this.attempts.assertNamed(`reset-ip:${ip}`);
    await this.attempts.consumeNamed(`reset-ip:${ip}`);
    const emailBucket = `reset-email:${hashSecret(email)}`;
    const emailAllowed = await this.attempts.allowed(emailBucket);
    await this.attempts.consumeNamed(emailBucket);
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        timeZone: true,
      },
    });
    if (!emailAllowed || user === null) {
      return;
    }
    const issued = newResetSecret();
    const minutes = resetTtlMinutes();
    const expiresAt = new Date(Date.now() + minutes * 60_000);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      const token = await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: issued.hash,
          expiresAt,
          requestedIp: meta.ip,
          requestedUserAgent: meta.userAgent,
        },
      });
      await tx.activityLog.create({
        data: {
          ownerId: user.id,
          actorId: user.id,
          entityType: 'user',
          entityId: user.id,
          action: 'updated',
          changes: { outcome: 'password_reset_requested' },
        },
      });
      return token;
    });
    const locale = mailLocale(user.locale, dto.locale);
    const url = `${publicOrigin()}/reset-password#token=${issued.token}`;
    void this.dispatchReset(user.id, created.id, locale, user.displayName, url, minutes).catch(
      () => undefined,
    );
  }

  private async dispatchReset(
    userId: string,
    tokenId: string,
    locale: 'es' | 'en',
    displayName: string,
    url: string,
    minutes: number,
  ): Promise<void> {
    const rendered = renderPasswordReset({ locale, displayName, url, minutes });
    const message = {
      to: await this.recipient(userId),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: resetHeaders(tokenId),
      idempotencyKey: `password-reset/${tokenId}`,
    };
    if (message.to.length === 0) {
      return;
    }
    let result = await sendEmail(message);
    if (result.status === 'rate_limited' || result.status === 'unknown') {
      result = await sendEmail(message);
    }
    this.logger.log(`password reset mail userId=${userId} status=${result.status}`);
  }

  private async sendChanged(
    row: LiveToken,
    meta: RequestMeta,
    manualTokens: readonly string[],
  ): Promise<void> {
    const locale = mailLocale(row.user.locale, undefined);
    const origin = publicOrigin();
    const rendered = renderPasswordChanged({
      locale,
      displayName: row.user.displayName,
      when: new Date(),
      timeZone: row.user.timeZone,
      ip: meta.ip ?? 'unknown',
      userAgent: meta.userAgent ?? 'unknown',
      manualTokens,
      settingsUrl: `${origin}/settings/tokens`,
      forgotUrl: `${origin}/forgot-password`,
    });
    const result: EmailResult = await sendEmail({
      to: row.user.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Entity-Ref-ID': row.id,
      },
      idempotencyKey: `password-reset-notice/${row.id}`,
    });
    this.logger.log(`password changed mail userId=${row.userId} status=${result.status}`);
  }

  private async recipient(userId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true },
    });
    return user?.email ?? '';
  }

  private async guardConfirmIp(meta: RequestMeta): Promise<void> {
    const ip = meta.ip ?? 'unknown';
    await this.attempts.assertNamed(`reset-confirm-ip:${ip}`);
    await this.attempts.consumeNamed(`reset-confirm-ip:${ip}`);
  }

  private async findLive(token: string): Promise<LiveToken | null> {
    if (!isWellFormedToken(token)) {
      return null;
    }
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashSecret(token),
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            passwordHash: true,
            totpEnabled: true,
            deletedAt: true,
            locale: true,
            timeZone: true,
            displayName: true,
          },
        },
      },
    });
    if (row?.user.deletedAt !== null) {
      return null;
    }
    return row;
  }

  private async bumpFailures(id: string): Promise<void> {
    const updated = await this.prisma.passwordResetToken.update({
      where: { id },
      data: { failedAttempts: { increment: 1 } },
    });
    if (updated.failedAttempts >= MAX_FACTOR_FAILURES) {
      await this.prisma.passwordResetToken.update({
        where: { id },
        data: { invalidatedAt: new Date() },
      });
    }
  }
}

interface LiveToken {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly passwordHash: string | null;
    readonly totpEnabled: boolean;
    readonly deletedAt: Date | null;
    readonly locale: string;
    readonly timeZone: string;
    readonly displayName: string;
  };
}

function invalidToken(): DomainException {
  return new DomainException(
    HttpStatus.BAD_REQUEST,
    'reset_token_invalid',
    'This reset link is no longer valid',
  );
}

function resetTtlMinutes(): number {
  const parsed = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? '30');
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 60) {
    return 30;
  }
  return parsed;
}

function mailLocale(stored: string, requested: 'es' | 'en' | undefined): 'es' | 'en' {
  const preferred = stored.trim().toLowerCase();
  if (preferred.startsWith('en')) {
    return 'en';
  }
  if (preferred.startsWith('es')) {
    return 'es';
  }
  return requested ?? 'es';
}

function resetHeaders(tokenId: string): Record<string, string> {
  return {
    'Auto-Submitted': 'auto-generated',
    'X-Entity-Ref-ID': tokenId,
  };
}
