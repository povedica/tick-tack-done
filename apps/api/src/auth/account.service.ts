import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { actorOf, type AuthUser } from './auth-user.js';
import type { ChangePasswordDto, DeleteMeDto } from './me.dto.js';
import { isCommonPassword } from './common-passwords.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { publicOrigin } from './public-origin.js';
import { requireBrowserSession } from './session-access.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainException } from '../http/domain.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { renderPasswordChanged } from '../mail/templates/password-reset.js';
import { sendEmail } from '../mail/send-email.js';
import { sendSecurityNotice } from '../security/security-mail.js';
import { TotpService } from './totp.controller.js';

@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(TotpService) private readonly totp: TotpService,
  ) {}

  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
  ): Promise<void> {
    requireBrowserSession(user);
    if (dto.current_password === dto.new_password) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Choose a different password',
      );
    }
    if (isCommonPassword(dto.new_password)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'password_too_common',
        'Choose a less common password',
      );
    }
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: {
        passwordHash: true,
        email: true,
        locale: true,
        timeZone: true,
        displayName: true,
      },
    });
    if (row?.passwordHash == null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'password_required',
        'Set a password before changing it',
      );
    }
    const passwordOk = await verifyPassword(row.passwordHash, dto.current_password);
    if (!passwordOk) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'invalid_credentials',
        'Invalid credentials',
      );
    }
    const passwordHash = await hashPassword(dto.new_password);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(user.sessionId === null ? {} : { id: { not: user.sessionId } }),
        },
        data: { revokedAt: now },
      });
      await tx.oauthRefreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.personalAccessToken.updateMany({
        where: { ownerId: user.id, oauthClientId: { not: null }, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.accountPasswordChanged,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: { user: { id: user.id } },
        previous: null,
      });
    });
    const manuals = await this.prisma.personalAccessToken.findMany({
      where: { ownerId: user.id, oauthClientId: null, revokedAt: null, deletedAt: null },
      select: { name: true },
    });
    const locale = row.locale.toLowerCase().startsWith('en') ? 'en' : 'es';
    const origin = publicOrigin();
    const rendered = renderPasswordChanged({
      locale,
      displayName: row.displayName,
      when: now,
      timeZone: row.timeZone,
      ip: meta.ip ?? 'unknown',
      userAgent: meta.userAgent ?? 'unknown',
      manualTokens: manuals.map((item) => item.name),
      settingsUrl: `${origin}/settings/tokens`,
      forgotUrl: `${origin}/forgot-password`,
    });
    await sendEmail({
      to: row.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: `password-changed/${user.id}/${String(now.getTime())}`,
    });
  }

  async delete(user: AuthUser, dto: DeleteMeDto): Promise<void> {
    requireBrowserSession(user);
    if (dto.confirmation !== user.email) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'confirmation_required',
        'Confirmation must be the account email',
      );
    }
    const row = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { passwordHash: true, email: true },
    });
    if (row?.passwordHash == null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'password_required',
        'Set a password before deleting the account',
      );
    }
    const passwordOk = await verifyPassword(row.passwordHash, dto.password);
    if (!passwordOk) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'invalid_credentials',
        'Invalid credentials',
      );
    }
    await this.totp.assertLogin(user.id, {
      ...(dto.totp_code === undefined ? {} : { totp_code: dto.totp_code }),
      ...(dto.recovery_code === undefined ? {} : { recovery_code: dto.recovery_code }),
    });
    await sendSecurityNotice(
      row.email,
      'Account deletion',
      'Your account is being deleted. If this was not you, the deletion has already been confirmed with your password.',
    );
    await this.prisma.$transaction(async (tx) => {
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.accountDeleted,
        entityType: 'user',
        entityId: user.id,
        action: 'deleted',
        data: { user: { id: user.id } },
        previous: null,
      });
      const ownerId = user.id;
      await tx.activityLog.deleteMany({ where: { OR: [{ ownerId }, { actorId: ownerId }] } });
      await tx.outboxEvent.deleteMany({ where: { ownerId } });
      await tx.idempotencyRecord.deleteMany({ where: { ownerId } });
      await tx.oauthRefreshToken.deleteMany({ where: { userId: ownerId } });
      await tx.personalAccessToken.deleteMany({ where: { ownerId } });
      await tx.reminderDelivery.deleteMany({ where: { ownerId } });
      await tx.seriesAdvance.deleteMany({ where: { ownerId } });
      await tx.checklistItem.deleteMany({ where: { ownerId } });
      await tx.taskTag.deleteMany({ where: { task: { ownerId } } });
      await tx.attachment.deleteMany({ where: { ownerId } });
      await tx.comment.deleteMany({ where: { OR: [{ ownerId }, { authorId: ownerId }] } });
      await tx.focusSession.deleteMany({ where: { ownerId } });
      await tx.stickyNote.deleteMany({ where: { ownerId } });
      await tx.reminder.deleteMany({ where: { ownerId } });
      await tx.task.deleteMany({ where: { ownerId } });
      await tx.habitLog.deleteMany({ where: { ownerId } });
      await tx.habit.deleteMany({ where: { ownerId } });
      await tx.filter.deleteMany({ where: { ownerId } });
      await tx.smartList.deleteMany({ where: { ownerId } });
      await tx.column.deleteMany({ where: { ownerId } });
      await tx.project.deleteMany({ where: { ownerId } });
      await tx.folder.deleteMany({ where: { ownerId } });
      await tx.tag.deleteMany({ where: { ownerId } });
      await tx.externalEvent.deleteMany({ where: { ownerId } });
      await tx.calendarSubscription.deleteMany({ where: { ownerId } });
      await tx.pushSubscription.deleteMany({ where: { ownerId } });
      await tx.countdownReminder.deleteMany({ where: { countdown: { ownerId } } });
      await tx.countdown.deleteMany({ where: { ownerId } });
      await tx.template.deleteMany({ where: { ownerId } });
      await tx.dashboardLayout.deleteMany({ where: { ownerId } });
      await tx.weeklyReport.deleteMany({ where: { ownerId } });
      await tx.focusSettings.deleteMany({ where: { userId: ownerId } });
      await tx.session.deleteMany({ where: { userId: ownerId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: ownerId } });
      await tx.oauthAuthorizationCode.deleteMany({ where: { userId: ownerId } });
      await tx.oauthClient.deleteMany({ where: { ownerId } });
      await tx.telegramBotConfiguration.deleteMany({ where: { ownerId } });
      await tx.user.delete({ where: { id: ownerId } });
    });
  }
}
