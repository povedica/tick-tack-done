import { setTelegramStatus } from '../integrations/telegram-status.js';
import { isUUID } from 'class-validator';
import { asJson } from '../http/json.js';
import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_CHANNELS,
  notificationDefault,
  type NotificationChannel,
} from '@reflexionia/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReminderTransport } from '../scheduler/reminder.transport.js';
import { DomainException } from '../http/domain.exception.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainEvent } from '../events/domain-events.js';
import { actorOf, type AuthUser } from '../auth/auth-user.js';
import type { NotificationSettingsWriteDto } from './notifications.dto.js';
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReminderTransport) private readonly transport: ReminderTransport,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}
  async settings(user: AuthUser) {
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { telegramLinks: { where: { deletedAt: null }, take: 1 } },
    });
    const saved = await this.prisma.notificationPreference.findMany({ where: { userId: user.id } });
    const telegram = owner.telegramLinks[0];
    const state = telegram as { status?: string; username?: string } | undefined;
    return {
      time_zone: owner.timeZone,
      preferences: NOTIFICATION_KINDS.flatMap((kind) =>
        NOTIFICATION_CHANNELS.map((channel) => ({
          kind,
          channel,
          enabled:
            saved.find((pref) => pref.kind === kind && pref.channel === channel)?.enabled ??
            notificationDefault(kind, channel, !!telegram),
        })),
      ),
      quiet_hours: {
        start: owner.quietHoursStart,
        end: owner.quietHoursEnd,
        days: owner.quietHoursDays,
        allow_high: owner.quietAllowHigh,
      },
      channels: {
        push: {
          configured: !!process.env.VAPID_PUBLIC_KEY,
          public_key: process.env.VAPID_PUBLIC_KEY ?? '',
        },
        email: { address: owner.email, configured: !!process.env.SMTP_HOST },
        telegram: {
          linked: !!telegram,
          status: state?.status ?? (telegram ? 'connected' : 'not_linked'),
          username: state?.username ?? null,
        },
      },
    };
  }
  async update(user: AuthUser, dto: NotificationSettingsWriteDto) {
    if ((dto.preferences?.length ?? 0) > 24)
      throw new DomainException(400, 'validation_failed', 'At most 24 preferences');
    await this.prisma.$transaction(async (tx) => {
      for (const pref of dto.preferences ?? [])
        await tx.notificationPreference.upsert({
          where: {
            userId_kind_channel: { userId: user.id, kind: pref.kind, channel: pref.channel },
          },
          create: { userId: user.id, kind:pref.kind,channel:pref.channel,enabled:pref.enabled },
          update: { enabled: pref.enabled },
        });
      if (dto.quiet_hours)
        await tx.user.update({
          where: { id: user.id },
          data: {
            quietHoursStart: dto.quiet_hours.start,
            quietHoursEnd: dto.quiet_hours.end,
            quietHoursDays: dto.quiet_hours.days,
            quietAllowHigh: dto.quiet_hours.allow_high,
          },
        });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.notificationSettingsUpdated,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: { settings: asJson(dto) },
        previous: null,
      });
    });
    return this.settings(user);
  }
  async test(user: AuthUser, channel: NotificationChannel) {
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        pushSubscriptions: { where: { deletedAt: null } },
        telegramLinks: { where: { deletedAt: null }, take: 1 },
      },
    });
    if (channel === 'push' && (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY))
      throw new DomainException(503, 'push_not_configured', 'Push is not configured');
    if (channel === 'push' && !owner.pushSubscriptions.length)
      throw new DomainException(
        409,
        'push_not_subscribed',
        'This browser has no push subscription',
      );
    if (channel === 'email' && (!process.env.SMTP_HOST || !process.env.SMTP_FROM))
      throw new DomainException(503, 'email_not_configured', 'Email is not configured');
    if (channel === 'telegram' && !owner.telegramLinks.length)
      throw new DomainException(409, 'telegram_not_linked', 'Telegram is not linked');
    if (channel === 'telegram' && !process.env.TELEGRAM_BOT_TOKEN)
      throw new DomainException(503, 'telegram_not_configured', 'Telegram is not configured');
    const result = await this.transport.deliver({
      channel: channel === 'email' ? 'email' : 'push',
      allowPush: channel === 'push',
      allowEmail: channel === 'email',
      allowTelegram: channel === 'telegram',
      email: owner.email,
      subscriptions: owner.pushSubscriptions,
      telegramChatId: owner.telegramLinks[0]?.chatId ?? null,
      title: 'tick-tack-done',
      body: 'Prueba de notificación',
    });
    const outcome = result[channel];
    if(channel==='telegram' && outcome==='disconnected')await setTelegramStatus(this.prisma,user.id,'blocked');
    await this.prisma.notificationReceipt.create({
      data: {
        ownerId: user.id,
        kind: 'task',
        channel,
        status:
          outcome === 'sent' ? 'fired' : outcome === 'disconnected' ? 'disconnected' : 'failed',
        reason: outcome === 'sent' ? 'test' : outcome,
        scheduledAt: new Date(),
      },
    });
    if (outcome !== 'sent')
      throw new DomainException(
        outcome === 'disconnected' ? 409 : 502,
        `${channel}_${outcome}`,
        `Notification ${outcome}`,
      );
    return { sent: true };
  }
  async deliveries(user: AuthUser, cursor?: string) {
    if(cursor!==undefined && !isUUID(cursor))throw new DomainException(400,'invalid_cursor','Invalid notification cursor');
    const anchor =
      cursor === undefined
        ? null
        : await this.prisma.notificationReceipt.findFirst({
            where: { id: cursor, ownerId: user.id },
          });
    if (cursor !== undefined && !anchor)
      throw new DomainException(400, 'invalid_cursor', 'Invalid notification cursor');
    const rows = await this.prisma.notificationReceipt.findMany({
      where: {
        ownerId: user.id,
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    });
    return {
      items: rows
        .slice(0, 50)
        .map((row) => ({
          id: row.id,
          delivery_id: row.deliveryId,
          kind: row.kind,
          channel: row.channel,
          status: row.status,
          reason: row.reason,
          scheduled_at: row.scheduledAt.toISOString(),
          created_at: row.createdAt.toISOString(),
        })),
      next_cursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
    };
  }
}
