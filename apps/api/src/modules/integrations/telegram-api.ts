import type { ReadableStreamDefaultReader } from 'node:stream/web';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception.js';

@Injectable()
export class TelegramApi {
  async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
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
