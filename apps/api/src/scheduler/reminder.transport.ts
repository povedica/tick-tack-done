import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { telegramConfiguration } from '../integrations/telegram-configuration.js';
import { sendEmail, type EmailResult } from '../mail/send-email.js';

import webpush from 'web-push';

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface TelegramButton {
  readonly text: string;
  readonly callback_data: string;
}

export interface ReminderMessage {
  readonly ownerId?: string;
  readonly deliveryId?: string;
  readonly previous?: unknown;
  readonly channel: 'push' | 'email' | 'both';
  readonly allowPush?: boolean;
  readonly allowEmail?: boolean;
  readonly action?: { readonly delivery_id: string; readonly token: string; readonly url: string };
  readonly email: string | null;
  readonly subscriptions: readonly PushTarget[];
  readonly telegramChatId: string | null;
  readonly allowTelegram?: boolean;
  readonly title: string;
  readonly body: string;
  readonly buttons?: readonly (readonly TelegramButton[])[];
}

export type ChannelOutcome =
  'sent' | 'skipped' | 'failed' | 'unknown' | 'rate_limited' | 'disconnected';

export interface DeliveryResult {
  readonly email_first_attempt_at?: string;
  readonly email_reconcile_required?: boolean;
  readonly email: ChannelOutcome;
  readonly push: ChannelOutcome;
  readonly telegram: ChannelOutcome;
  readonly telegram_message_id: number | null;
  readonly retry_after_seconds: number | null;
}

@Injectable()
export class ReminderTransport {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async deliver(message: ReminderMessage): Promise<DeliveryResult> {
    const wantsEmail =
      message.allowEmail !== false && (message.channel === 'email' || message.channel === 'both');
    const wantsPush =
      message.allowPush !== false && (message.channel === 'push' || message.channel === 'both');
    const prior =
      typeof message.previous === 'object' && message.previous !== null
        ? (message.previous as Record<string, unknown>)
        : {};
    const telegram: {
      status: ChannelOutcome;
      messageId: number | null;
      retryAfter: number | null;
    } =
      prior.telegram === 'sent' || prior.telegram === 'unknown' || prior.telegram === 'disconnected'
        ? {
            status: prior.telegram,
            messageId:
              typeof prior.telegram_message_id === 'number' ? prior.telegram_message_id : null,
            retryAfter: null,
          }
        : await this.telegram(message);
    const firstAttempt =
      typeof prior.email_first_attempt_at === 'string'
        ? prior.email_first_attempt_at
        : new Date().toISOString();
    // Resend retains idempotency keys for 24h; after downtime keep uncertain mail for reconciliation.
    const expired =
      prior.email === 'unknown' &&
      (!Number.isFinite(Date.parse(firstAttempt)) ||
        Date.now() - Date.parse(firstAttempt) >= 23 * 60 * 60_000);
    const email: EmailResult = wantsEmail
      ? expired
        ? { status: 'unknown', retryAfter: null }
        : prior.email === 'sent'
          ? { status: 'sent', retryAfter: null }
          : await this.email(message)
      : { status: 'skipped', retryAfter: null };
    return {
      ...(wantsEmail
        ? { email_first_attempt_at: firstAttempt, email_reconcile_required: expired }
        : {}),
      email: email.status,
      push: wantsPush ? (prior.push === 'sent' ? 'sent' : await this.push(message)) : 'skipped',
      telegram: telegram.status,
      telegram_message_id: telegram.messageId,
      retry_after_seconds:
        telegram.retryAfter === null && email.retryAfter === null
          ? null
          : Math.max(telegram.retryAfter ?? 0, email.retryAfter ?? 0),
    };
  }

  private email(message: ReminderMessage): Promise<EmailResult> {
    return message.email === null
      ? Promise.resolve({ status: 'skipped', retryAfter: null })
      : sendEmail({
          to: message.email,
          subject: message.title,
          text: message.body,
          ...(message.deliveryId === undefined
            ? {}
            : { idempotencyKey: `reminder/${message.deliveryId}` }),
        });
  }

  private async push(message: ReminderMessage): Promise<ChannelOutcome> {
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
    const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
    if (publicKey.length === 0 || privateKey.length === 0 || message.subscriptions.length === 0) {
      return 'skipped';
    }
    try {
      const subject = process.env.VAPID_SUBJECT ?? '';
      if (subject.length === 0) {
        return 'skipped';
      }
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const payload = JSON.stringify({
        title: message.title,
        body: message.body,
        ...(message.action
          ? {
              data: message.action,
              actions: [
                { action: 'complete', title: 'Completar' },
                { action: 'snooze', title: 'Posponer 10 min' },
                { action: 'open', title: 'Abrir' },
              ],
            }
          : {}),
      });
      for (const subscription of message.subscriptions) {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
      }
      return 'sent';
    } catch {
      return 'failed';
    }
  }

  private async telegram(message: ReminderMessage): Promise<{
    status: ChannelOutcome;
    messageId: number | null;
    retryAfter: number | null;
  }> {
    const { token } = await telegramConfiguration(this.prisma, message.ownerId);
    const chatId = message.telegramChatId;
    if (
      message.allowTelegram === false ||
      token.length === 0 ||
      chatId === null ||
      chatId.length === 0
    ) {
      return { status: 'skipped', messageId: null, retryAfter: null };
    }
    if (message.ownerId !== undefined) {
      const link = await this.prisma.telegramLink.findFirst({
        where: { ownerId: message.ownerId, chatId, deletedAt: null },
        select: { id: true },
      });
      if (link === null) return { status: 'skipped', messageId: null, retryAfter: null };
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: [message.title, message.body].filter((line) => line.length > 0).join('\n'),
          ...(message.buttons === undefined
            ? {}
            : { reply_markup: { inline_keyboard: message.buttons } }),
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 403) {
        return { status: 'disconnected', messageId: null, retryAfter: null };
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '30');
        return {
          status: 'rate_limited',
          messageId: null,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : 30,
        };
      }
      if (response.status >= 500) {
        return { status: 'failed', messageId: null, retryAfter: 30 };
      }
      const payload = (await response.json()) as {
        ok?: unknown;
        result?: { message_id?: unknown };
      };
      const messageId =
        typeof payload.result?.message_id === 'number' ? payload.result.message_id : null;
      return payload.ok === true
        ? { status: 'sent', messageId, retryAfter: null }
        : { status: 'failed', messageId: null, retryAfter: null };
    } catch (error) {
      // Timeout after a possible send must not be retried blindly (APP-07b).
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { status: 'unknown', messageId: null, retryAfter: null };
      }
      return { status: 'failed', messageId: null, retryAfter: null };
    }
  }
}
