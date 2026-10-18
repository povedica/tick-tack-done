import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import webpush from 'web-push';

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface ReminderMessage {
  readonly channel: 'push' | 'email' | 'both';
  readonly email: string | null;
  readonly subscriptions: readonly PushTarget[];
  readonly telegramChatId: string | null;
  readonly title: string;
  readonly body: string;
}

export interface DeliveryResult {
  readonly email: 'sent' | 'skipped' | 'failed';
  readonly push: 'sent' | 'skipped' | 'failed';
  readonly telegram: 'sent' | 'skipped' | 'failed';
}

@Injectable()
export class ReminderTransport {
  async deliver(message: ReminderMessage): Promise<DeliveryResult> {
    const wantsEmail = message.channel === 'email' || message.channel === 'both';
    const wantsPush = message.channel === 'push' || message.channel === 'both';
    return {
      email: wantsEmail ? await this.email(message) : 'skipped',
      push: wantsPush ? await this.push(message) : 'skipped',
      telegram: await this.telegram(message),
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
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? 'todo@reflexionia.com',
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
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:todo@reflexionia.com',
        publicKey,
        privateKey,
      );
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

  private async telegram(message: ReminderMessage): Promise<DeliveryResult['telegram']> {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const chatId = message.telegramChatId;
    if (token.length === 0 || chatId === null || chatId.length === 0) {
      return 'skipped';
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: [message.title, message.body].filter((line) => line.length > 0).join('\n'),
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json()) as { ok?: unknown };
      return payload.ok === true ? 'sent' : 'failed';
    } catch {
      return 'failed';
    }
  }
}
