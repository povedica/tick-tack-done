import { createHash } from 'node:crypto';
import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception.js';

@Injectable()
export class TelegramApi {
  private botCache: { key: string; expires: number; username: string | null } | null = null;
  private botPending: Promise<string | null> | null = null;
  async botUsername(): Promise<string | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    if (!token) return null;
    const key = createHash('sha256').update(token).digest('hex');
    if (this.botCache?.key === key && this.botCache.expires > Date.now())
      return this.botCache.username;
    if (this.botPending) return this.botPending;
    this.botPending = this.call('getMe', {})
      .then((result) => {
        const row =
          typeof result === 'object' && result !== null ? (result as { username?: unknown }) : {};
        const username =
          typeof row.username === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(row.username)
            ? row.username
            : null;
        this.botCache = { key, expires: Date.now() + 3600000, username };
        return username;
      })
      .catch(() => {
        this.botCache = { key, expires: Date.now() + 30000, username: null };
        return null;
      })
      .finally(() => {
        this.botPending = null;
      });
    return this.botPending;
  }

  async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 403)
      throw new DomainException(409, 'telegram_blocked', 'Telegram bot is blocked by the user');
    const payload = (await response.json()) as { ok?: unknown; result?: unknown };
    if (payload.ok !== true) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'telegram_failed',
        'Telegram rejected the call',
      );
    }
    return payload.result;
  }

  async downloadStream(
    fileId: string,
  ): Promise<{ source: AsyncIterable<Uint8Array>; filePath: string }> {
    const result = await this.call('getFile', { file_id: fileId });
    const filePath = telegramFilePath(result);
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok || !response.body)
      throw new DomainException(502, 'telegram_failed', 'Telegram file download failed');
    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    async function* source() {
      let total = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) return;
          total += next.value.byteLength;
          if (total > 25 * 1024 * 1024)
            throw new DomainException(413, 'payload_too_large', 'Telegram file exceeds 25 MiB');
          yield next.value;
        }
      } finally {
        await reader.cancel();
      }
    }
    return { source: source(), filePath };
  }
}

function telegramFilePath(result: unknown): string {
  if (typeof result !== 'object' || result === null) {
    throw new DomainException(
      HttpStatus.BAD_GATEWAY,
      'telegram_failed',
      'Telegram file is missing',
    );
  }
  const filePath = (result as { file_path?: unknown }).file_path;
  if (
    typeof filePath !== 'string' ||
    filePath.length === 0 ||
    filePath.includes('..') ||
    filePath.startsWith('/')
  ) {
    throw new DomainException(
      HttpStatus.BAD_GATEWAY,
      'telegram_failed',
      'Telegram file is missing',
    );
  }
  return filePath;
}
