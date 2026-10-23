import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly idempotencyKey?: string;
}
export interface EmailResult {
  readonly status: 'sent' | 'skipped' | 'failed' | 'unknown' | 'rate_limited';
  readonly retryAfter: number | null;
}

/** Configuration is server-side only. A configured Resend key always takes priority over SMTP. */
export function emailConfigured(): boolean {
  return (process.env.RESEND_API_KEY ?? '').trim().length > 0
    ? (process.env.EMAIL_FROM ?? '').trim().length > 0
    : (process.env.SMTP_HOST ?? '').trim().length > 0 &&
        (process.env.SMTP_FROM ?? '').trim().length > 0;
}

/** Never propagate provider errors: they may contain credentials, addresses or message content. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY?.trim() ?? '';
  const from =
    key.length > 0 ? (process.env.EMAIL_FROM?.trim() ?? '') : (process.env.SMTP_FROM?.trim() ?? '');
  if (message.to.trim().length === 0) return { status: 'skipped', retryAfter: null };
  if (!emailConfigured())
    return { status: key.length > 0 ? 'failed' : 'skipped', retryAfter: null };
  if (key.length > 0) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'Idempotency-Key': message.idempotencyKey ?? `security/${randomUUID()}`,
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      });
      if (response.status === 429) {
        const retry = Number(response.headers.get('retry-after') ?? '30');
        return {
          status: 'rate_limited',
          retryAfter: Number.isFinite(retry) && retry >= 0 ? retry : 30,
        };
      }
      if (!response.ok) return { status: 'failed', retryAfter: response.status >= 500 ? 30 : null };
      const body = (await response.json()) as { id?: unknown };
      return {
        status: typeof body.id === 'string' && body.id.length > 0 ? 'sent' : 'unknown',
        retryAfter: null,
      };
    } catch {
      // Resend may have accepted the request; retry only with the same idempotency key.
      return { status: 'unknown', retryAfter: 30 };
    }
  }
  try {
    const user = process.env.SMTP_USER ?? '';
    const pass = process.env.SMTP_PASS ?? '';
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? '1025'),
      secure: false,
      ...(user.length > 0 ? { auth: { user, pass } } : {}),
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 8_000,
    });
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { status: 'sent', retryAfter: null };
  } catch {
    return { status: 'failed', retryAfter: null };
  }
}
