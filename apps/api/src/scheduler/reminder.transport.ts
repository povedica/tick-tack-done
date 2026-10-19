import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
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
  readonly channel: 'push' | 'email' | 'both';
  readonly email: string | null;
  readonly subscriptions: readonly PushTarget[];
  readonly telegramChatId: string | null;
  readonly allowTelegram?: boolean;
  readonly title: string;
  readonly body: string;
  readonly buttons?: readonly (readonly TelegramButton[])[];
}

export interface DeliveryResult {
  readonly email: 'sent' | 'skipped' | 'failed';
  readonly push: 'sent' | 'skipped' | 'failed';
  readonly telegram: 'sent' | 'skipped' | 'failed';
  readonly telegram_message_id: number | null;
}

@Injectable()
export class ReminderTransport {
  async deliver(message: ReminderMessage): Promise<DeliveryResult> {
    const wantsEmail = message.channel === 'email' || message.channel === 'both';
    const wantsPush = message.channel === 'push' || message.channel === 'both';
    const telegram = await this.telegram(message);
    return {
      email: wantsEmail ? await this.email(message) : 'skipped',
      push: wantsPush ? await this.push(message) : 'skipped',
      telegram: telegram.status,
      telegram_message_id: telegram.messageId,
    };
  }

  private async email(message: ReminderMessage): Promise<DeliveryResult['email']> {
    const host = process.env.SMTP_HOST ?? '';
    if (host.length === 0 || message.email === null) {
      return 'skipped';
    }
    try {
      const user = process.env.SMTP_USER ?? '';
      const pass = process.env.SMTP_PASS ?? '';
      const transport = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? '1025'),
        secure: false,
        ...(user.length > 0 ? { auth: { user, pass } } : {}),
      });
      const from = process.env.SMTP_FROM ?? '';
      if (from.length === 0) {
        return 'skipped';
      }
      await transport.sendMail({
        from,
        to: message.email,
        subject: message.title,
        text: message.body,
      });
      return 'sent';
    } catch {
      return 'failed';
    }
  }

  private async push(message: ReminderMessage): Promise<DeliveryResult['push']> {
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
      const payload = JSON.stringify({ title: message.title, body: message.body });
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

  private async telegram(
    message: ReminderMessage,
  ): Promise<{ status: DeliveryResult['telegram']; messageId: number | null }> {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const chatId = message.telegramChatId;
    if (
      message.allowTelegram === false ||
      token.length === 0 ||
      chatId === null ||
      chatId.length === 0
    ) {
      return { status: 'skipped', messageId: null };
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
      const payload = (await response.json()) as {
        ok?: unknown;
        result?: { message_id?: unknown };
      };
      const messageId =
        typeof payload.result?.message_id === 'number' ? payload.result.message_id : null;
      return payload.ok === true
        ? { status: 'sent', messageId }
        : { status: 'failed', messageId: null };
    } catch {
      return { status: 'failed', messageId: null };
    }
  }
}
