import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { telegramConfiguration } from '../../integrations/telegram-configuration.js';

@Injectable()
export class TelegramApi {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Immutable credentials for one inbound update, including its downloads and replies. */
  withConfiguration(config: Awaited<ReturnType<typeof telegramConfiguration>>): TelegramApi {
    return new (class extends TelegramApi {
      protected override configuration() {
        return Promise.resolve(config);
      }
    })(this.prisma);
  }

  protected configuration(ownerId?: string) {
    return telegramConfiguration(this.prisma, ownerId);
  }

  async configured(ownerId?: string): Promise<boolean> {
    return (await this.configuration(ownerId)).token.length > 0;
  }

  async call(method: string, body: Record<string, unknown>, ownerId?: string): Promise<unknown> {
    const { token } = await this.configuration(ownerId);
    if (token.length === 0)
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'telegram_not_configured',
        'Configura tu bot en Ajustes.',
      );
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json()) as { ok?: unknown; result?: unknown };
      if (!response.ok || payload.ok !== true) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'telegram_failed',
          'Telegram rejected the call',
        );
      }
      return payload.result;
    } catch {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'telegram_failed',
        'No se pudo contactar con Telegram.',
      );
    }
  }

  async download(fileId: string, ownerId?: string): Promise<{ bytes: Buffer; filePath: string }> {
    const result = await this.call('getFile', { file_id: fileId }, ownerId);
    const filePath = telegramFilePath(result);
    const { token } = await this.configuration(ownerId);
    try {
      const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'telegram_failed',
          'Telegram file download failed',
        );
      }
      return { bytes: Buffer.from(await response.arrayBuffer()), filePath };
    } catch {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'telegram_failed',
        'No se pudo descargar el archivo de Telegram.',
      );
    }
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
