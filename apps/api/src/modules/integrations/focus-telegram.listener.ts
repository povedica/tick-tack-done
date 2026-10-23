import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEvent } from '../../events/domain-events.js';
import type { DomainBusEvent } from '../../events/event-bus.js';
import { EventRouter } from '../../events/event-router.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { telegramConfiguration } from '../../integrations/telegram-configuration.js';
import { TelegramApi } from './telegram-api.js';

const FOCUS_TYPES = new Set<string>([
  DomainEvent.focusSessionStarted,
  DomainEvent.focusSessionFinished,
  DomainEvent.focusSessionAborted,
]);

/** NT-11. Focus events already exist; this is the Telegram subscriber. */
@Injectable()
export class FocusTelegramListener implements OnModuleInit {
  constructor(
    @Inject(EventRouter) private readonly router: EventRouter,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TelegramApi) private readonly telegram: TelegramApi,
  ) {}

  onModuleInit(): void {
    this.router.subscribe((event) => this.onEvent(event));
  }

  private async onEvent(event: DomainBusEvent): Promise<void> {
    if (!FOCUS_TYPES.has(event.type)) return;
    const configuration = await telegramConfiguration(this.prisma, event.ownerId);
    if (configuration.token.length === 0) return;
    const user = await this.prisma.user.findFirst({
      where: { id: event.ownerId, deletedAt: null },
      select: {
        focusNotifications: true,
        telegramLinks: { where: { deletedAt: null }, select: { chatId: true }, take: 1 },
      },
    });
    const chatId = user?.telegramLinks[0]?.chatId;
    if (user === null || !user.focusNotifications || chatId === undefined) {
      return;
    }
    const stored = await this.prisma.outboxEvent.findFirst({
      where: { id: event.id, ownerId: event.ownerId },
      select: { data: true },
    });
    const sessionId = sessionIdOf(stored?.data);
    const session =
      sessionId === null
        ? null
        : await this.prisma.focusSession.findFirst({
            where: { id: sessionId, ownerId: event.ownerId },
            select: { plannedMinutes: true, task: { select: { title: true } } },
          });
    const title = session?.task?.title ?? 'sin tarea';
    const minutes = session?.plannedMinutes ?? 0;
    const text =
      event.type === DomainEvent.focusSessionStarted
        ? `🍅 Foco iniciado: ${title} (${String(minutes)} min)`
        : event.type === DomainEvent.focusSessionFinished
          ? `✅ Foco terminado: ${title}`
          : `Foco cancelado: ${title}`;
    try {
      await this.telegram
        .withConfiguration(configuration)
        .call('sendMessage', { chat_id: chatId, text }, event.ownerId);
    } catch {
      return;
    }
  }
}

function sessionIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('session' in data)) {
    return null;
  }
  const session = (data as { session?: { id?: unknown } }).session;
  return typeof session?.id === 'string' ? session.id : null;
}
