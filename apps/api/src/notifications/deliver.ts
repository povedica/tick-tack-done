import { setTelegramStatus } from '../integrations/telegram-status.js';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, ReminderDeliveryKind } from '@prisma/client';
import {
  NOTIFICATION_CHANNELS,
  notificationDefault,
  notificationQuietUntil,
  type NotificationChannel,
} from '@reflexionia/domain';
import type { PrismaService } from '../prisma/prisma.service.js';
import { asJson } from '../http/json.js';
import type { DeliveryResult, ReminderTransport } from '../scheduler/reminder.transport.js';
interface NotificationJob {
  reminderId?: string | null;
  id: string;
  ownerId: string;
  kind: ReminderDeliveryKind;
  taskId: string | null;
  payload: Prisma.JsonValue;
  fireAt: Date;
}
export async function deliverNotification(
  prisma: PrismaService,
  transport: ReminderTransport,
  row: NotificationJob,
  now: Date,
  copy: { title: string; body: string },
): Promise<DeliveryResult> {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: row.ownerId },
    include: {
      pushSubscriptions: { where: { deletedAt: null } },
      telegramLinks: { where: { deletedAt: null }, take: 1 },
      notificationPreferences: true,
    },
  });
  const payload =
    typeof row.payload === 'object' && row.payload !== null && !Array.isArray(row.payload)
      ? row.payload
      : {};
  const kind = typeof payload.habit_id === 'string' ? 'habit' : row.kind;
  const link = owner.telegramLinks[0];
  const linked = !!link;
  const blocked = (link as { status?: string } | undefined)?.status === 'blocked';
  const task =
    row.taskId === null
      ? null
      : await prisma.task.findFirst({
          where: { id: row.taskId, ownerId: row.ownerId },
          select: { priority: true },
        });
  const resume = notificationQuietUntil(
    now.toISOString(),
    owner.timeZone,
    {
      start: owner.quietHoursStart,
      end: owner.quietHoursEnd,
      days: owner.quietHoursDays,
      allowHigh: owner.quietAllowHigh,
    },
    task?.priority === 'high',
  );
  const only = Array.isArray(payload.notification_channels)
    ? payload.notification_channels.filter((value): value is string => typeof value === 'string')
    : null;
  const reasons = new Map<NotificationChannel, string>();
  const allowed = new Set<NotificationChannel>();
  for (const channel of NOTIFICATION_CHANNELS) {
    if (only && !only.includes(channel)) continue;
    const pref = owner.notificationPreferences.find(
      (item) => item.kind === kind && item.channel === channel,
    );
    if (channel === 'telegram' && !linked) reasons.set(channel, 'not_linked');
    else if (channel === 'telegram' && blocked) reasons.set(channel, 'blocked');
    else if (
      !(pref?.enabled ?? notificationDefault(kind, channel, linked)) ||
      (channel === 'telegram' && !owner.telegramEnabled)
    )
      reasons.set(channel, 'disabled_by_user');
    else if (channel !== 'email' && resume) {
      reasons.set(channel, 'quiet_hours');
      const deferred = await prisma.reminderDelivery.upsert({
        where: { dedupeKey: `quiet:${row.reminderId ?? row.id}:${channel}:${resume}` },
        create: {
          ownerId: row.ownerId,
          taskId: row.taskId,
          reminderId: row.reminderId ?? null,
          kind: row.kind,
          fireAt: new Date(resume),
          channel: 'push',
          dedupeKey: `quiet:${row.reminderId ?? row.id}:${channel}:${resume}`,
          payload: asJson({ ...payload, notification_channels: [channel] }),
        },
        update: {},
      });
      const scheduled = await prisma.notificationReceipt.findFirst({
        where: { deliveryId: deferred.id, channel, status: 'scheduled' },
      });
      if (!scheduled)
        await prisma.notificationReceipt.create({
          data: {
            ownerId: row.ownerId,
            deliveryId: deferred.id,
            kind,
            channel,
            status: 'scheduled',
            reason: 'quiet_hours',
            scheduledAt: new Date(resume),
          },
        });
    } else allowed.add(channel);
  }
  let action: { delivery_id: string; token: string; url: string } | undefined;
  if (row.taskId !== null && (allowed.has('push') || allowed.has('telegram'))) {
    const token = randomBytes(18).toString('base64url');
    await prisma.notificationAction.create({
      data: {
        ownerId: row.ownerId,
        deliveryId: row.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(now.getTime() + 86400000),
      },
    });
    action = { delivery_id: row.id, token, url: `/today?task=${row.taskId}` };
  }
  const result = await transport.deliver({
    channel: 'both',
    allowEmail: allowed.has('email'),
    allowPush: allowed.has('push'),
    allowTelegram: allowed.has('telegram'),
    email: typeof payload.email === 'string' ? payload.email : owner.email,
    subscriptions: owner.pushSubscriptions,
    telegramChatId: link?.chatId ?? null,
    ...copy,
    ...(action
      ? {
          action,
          buttons: [
            [
              { text: 'Completar', callback_data: `nc:${row.id}:${action.token}` },
              { text: 'Posponer 10 min', callback_data: `ns:${row.id}:${action.token}` },
            ],
            [{ text: 'Abrir', callback_data: `no:${row.id}:${action.token}` }],
          ],
        }
      : {}),
  });
  if (result.telegram === 'disconnected' && link)
    await setTelegramStatus(prisma, row.ownerId, 'blocked');
  for (const channel of NOTIFICATION_CHANNELS) {
    if (only && !only.includes(channel)) continue;
    const reason = reasons.get(channel);
    const outcome = result[channel];
    await prisma.notificationReceipt.create({
      data: {
        ownerId: row.ownerId,
        deliveryId: row.id,
        kind,
        channel,
        status:
          reason === 'blocked' || outcome === 'disconnected'
            ? 'disconnected'
            : reason
              ? 'skipped'
              : outcome === 'sent'
                ? 'fired'
                : outcome === 'skipped'
                  ? 'skipped'
                  : 'failed',
        reason:
          reason ??
          (outcome === 'sent' ? null : outcome === 'skipped' ? 'channel_unavailable' : outcome),
        scheduledAt: row.fireAt,
      },
    });
  }
  return result;
}
