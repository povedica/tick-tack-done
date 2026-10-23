import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  afternoonInstant,
  formatCaptureReply,
  matchTaskByTitle,
  parseTelegramCommand,
  type TelegramCommand,
} from '@reflexionia/domain';
import { type AuthUser } from '../../auth/auth-user.js';
import { hashSecret } from '../../auth/session-cookie.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { readTelegramUpdate, type TelegramIncoming } from '../../integrations/telegram-update.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ATTACHMENT_MAX_BYTES } from '../tasks/attachment-storage.js';
import type { TaskSummaryJson } from '../tasks/task.mapper.js';
import { ListsService } from '../lists/lists.service.js';
import type { CaptureWarning } from '../tasks/quick-add.js';
import { TasksService, type TaskListQuery } from '../tasks/tasks.service.js';
import { telegramConfiguration } from '../../integrations/telegram-configuration.js';
import { TelegramApi } from './telegram-api.js';

const TELEGRAM_BOT_SCOPES = [
  'tasks:read',
  'tasks:write',
  'lists:read',
  'lists:write',
  'reminders:write',
] as const;
const PAIRING_TTL_MS = 10 * 60 * 1000;

const LIST_NAME_MAX = 200;
export const TELEGRAM_BOT_COMMANDS: readonly { command: string; description: string }[] = [
  { command: 'capturar', description: 'Guardar una tarea' },
  { command: 'hoy', description: 'Tareas de hoy' },
  { command: 'manana', description: 'Tareas de mañana' },
  { command: 'semana', description: 'Tareas de la semana' },
  { command: 'lista', description: 'Ver listas o filtrar' },
  { command: 'nuevalista', description: 'Crear una lista' },
  { command: 'hecho', description: 'Completar una tarea' },
];

const TASK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TelegramOutcome {
  readonly called_telegram: boolean;
  readonly action: string;
}

interface Reply {
  readonly text: string;
  readonly html: boolean;
  readonly buttons: readonly { readonly text: string; readonly data: string }[];
}

@Injectable()
export class TelegramBotService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(TelegramApi) private readonly telegram: TelegramApi,
  ) {}

  async createPairing(
    user: AuthUser,
  ): Promise<{ code: string; expires_at: string; url: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      // Same lock as settings: a pairing issued during replacement belongs to the new bot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${user.id}`}, 0))`;
      const row = await tx.telegramBotConfiguration.findUnique({ where: { ownerId: user.id } });
      if (row === null) {
        throw new DomainException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'telegram_not_configured',
          'Configura tu bot en Ajustes.',
        );
      }
      const username = row.username;
      const code = randomBytes(16).toString('base64url');
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
      await tx.telegramPairing.create({
        data: { ownerId: user.id, codeHash: hashSecret(code), expiresAt },
      });
      return {
        code,
        expires_at: expiresAt.toISOString(),
        url: `https://t.me/${username}?start=${code}`,
      };
    });
  }

  async handle(
    body: unknown,
    ownerId: string,
    configuration?: Awaited<ReturnType<typeof telegramConfiguration>>,
  ): Promise<TelegramOutcome> {
    const config = configuration ?? (await telegramConfiguration(this.prisma, ownerId));
    if (config.token.length === 0)
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'telegram_not_configured',
        'Configura tu bot en Ajustes.',
      );
    const worker = new TelegramBotService(
      this.prisma,
      this.events,
      this.tasks,
      this.lists,
      this.telegram.withConfiguration(config),
    );
    return worker.processUpdate(body, ownerId, config.botId);
  }

  private async processUpdate(
    body: unknown,
    ownerId: string,
    botId: string,
  ): Promise<TelegramOutcome> {
    const parsed = readTelegramUpdate(body);
    const incoming =
      parsed === null
        ? null
        : {
            ...parsed,
            updateId: `${botId}-${parsed.updateId}`,
          };
    if (incoming === null) {
      return { called_telegram: false, action: 'ignored' };
    }
    const accepted = await this.acceptUpdate(incoming.updateId);
    if (!accepted) {
      return { called_telegram: false, action: 'duplicate' };
    }
    if (incoming.kind === 'text') {
      const paired = await this.tryPair(incoming.chatId, incoming.text, ownerId);
      if (paired !== null) {
        await this.send(ownerId, incoming.chatId, plain(paired));
        return { called_telegram: true, action: 'paired' };
      }
    }
    const user = await this.userFor(incoming.chatId, ownerId);
    if (user === null) {
      await this.send(
        ownerId,
        incoming.chatId,
        plain(
          'Este chat no está vinculado. Genera un código en Ajustes → Integraciones y envía /start <código>.',
        ),
      );
      return { called_telegram: true, action: 'unlinked' };
    }
    try {
      if (incoming.kind === 'callback') {
        const action = await this.callback(user, incoming);
        return { called_telegram: true, action };
      }
      if (incoming.kind === 'voice') {
        const text = await this.transcribe(incoming.fileId, user.id);
        await this.send(
          ownerId,
          incoming.chatId,
          await this.capture(user, text, incoming.updateId),
        );
        return { called_telegram: true, action: 'voice' };
      }
      if (incoming.kind === 'photo') {
        await this.photo(user, incoming);
        return { called_telegram: true, action: 'photo' };
      }
      await this.send(
        ownerId,
        incoming.chatId,
        await this.replyFor(user, incoming.text, incoming.updateId),
      );
      return { called_telegram: true, action: 'text' };
    } catch (error) {
      if (incoming.kind === 'callback' && incoming.callbackId.length > 0) {
        await this.telegram.call(
          'answerCallbackQuery',
          {
            callback_query_id: incoming.callbackId,
            text: 'No he podido completarla',
            show_alert: true,
          },
          ownerId,
        );
      } else {
        await this.send(ownerId, incoming.chatId, plain(failureText(error)));
      }
      return { called_telegram: true, action: 'error' };
    }
  }

  private async acceptUpdate(updateId: string): Promise<boolean> {
    try {
      await this.prisma.telegramUpdateReceipt.create({
        data: { updateId },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async tryPair(chatId: string, text: string, ownerId: string): Promise<string | null> {
    const match = /^\/start(?:@\w+)?(?:\s+|_)([A-Za-z0-9_-]{16,})$/.exec(text.trim());
    if (match === null) {
      return null;
    }
    const code = match[1] ?? '';
    const row = await this.prisma.telegramPairing.findFirst({
      where: {
        ownerId,
        codeHash: hashSecret(code),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (row === null) {
      return 'El código de emparejamiento no es válido o ya se usó.';
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${row.ownerId}`}, 0))`;
      const claimed = await tx.telegramPairing.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new DomainException(HttpStatus.CONFLICT, 'pairing_used', 'pairing used');
      }
      await tx.telegramLink.upsert({
        where: { ownerId_chatId: { ownerId: row.ownerId, chatId } },
        create: { ownerId: row.ownerId, chatId },
        update: { ownerId: row.ownerId, deletedAt: null },
      });
      await this.events.record(
        tx,
        { ownerId: row.ownerId, actorId: row.ownerId, actorKind: 'user', tokenId: null },
        {
          type: DomainEvent.telegramLinked,
          entityType: 'telegram_link',
          entityId: row.ownerId,
          action: 'created',
          data: asJson({ chat_id: chatId, bot_configured: true, pairing: true }),
          previous: null,
        },
      );
    });
    return 'Chat vinculado. Ya puedes capturar tareas con /capturar.';
  }

  private async replyFor(user: AuthUser, text: string, updateId: string): Promise<Reply> {
    const cleaned = text.trim().replace(/^\/([a-z_]+)@\w+/i, '/$1');
    if (cleaned === '/start') {
      return plain(
        'Escribe una tarea, o usa /capturar, /hoy, /manana, /semana, /lista, /nuevalista y /hecho.',
      );
    }
    if (cleaned === '/hecho' || cleaned === '/completar') {
      return plain('Escribe el título: /hecho comprar leche');
    }
    const command = parseTelegramCommand(cleaned);
    if (command.kind === 'capture' && command.text.length === 0) {
      return plain('Escribe la tarea detrás: /capturar comprar leche mañana');
    }
    if (command.kind === 'capture' && command.text.startsWith('/')) {
      return plain(
        'Ese comando no existe. Usa /capturar, /hoy, /manana, /semana, /lista, /nuevalista o /hecho.',
      );
    }
    if (command.kind === 'capture') {
      return this.capture(user, command.text, updateId);
    }
    if (command.kind === 'complete') {
      return this.completeByTitle(user, command, updateId);
    }
    if (command.kind === 'today' || command.kind === 'tomorrow' || command.kind === 'week') {
      return this.datedList(user, command.kind);
    }
    if (command.kind === 'lists') {
      return this.projectList(user);
    }
    if (command.kind === 'tag') {
      return this.tagList(user, command.name);
    }
    if (command.kind === 'priority') {
      return this.priorityList(user, command.level);
    }
    if (command.kind === 'create_list') {
      return this.createList(user, command.name, updateId);
    }
    return this.namedList(user, command.name);
  }

  private async capture(user: AuthUser, text: string, updateId: string): Promise<Reply> {
    const created = await this.tasks.create(
      user,
      { raw_text: text, metadata: { capture: 'telegram' } },
      `telegram-${updateId}`,
    );
    return plain(await this.confirmation(user, created.body, created.body.warnings));
  }

  private async createList(user: AuthUser, rawName: string, updateId: string): Promise<Reply> {
    const name = rawName.trim();
    if (name.length === 0) {
      return plain('Falta el nombre de la lista.');
    }
    if (name.length > LIST_NAME_MAX) {
      return plain('El nombre de la lista es demasiado largo.');
    }
    const existing = await this.prisma.project.findFirst({
      where: { ownerId: user.id, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing !== null) {
      return plain(`La lista «${name}» ya existe.`);
    }
    await this.lists.createProject(user, { name }, `telegram-list-${updateId}`);
    return plain(`Lista creada: ${name}.`);
  }

  private async completeByTitle(
    user: AuthUser,
    command: Extract<TelegramCommand, { kind: 'complete' }>,
    updateId: string,
  ): Promise<Reply> {
    const numbered = /^\d+$/.test(command.query.trim());
    const rows = numbered
      ? await this.dated(user, daySpan(0))
      : (await this.tasks.list(user, this.query({ limit: 50, flat: true }))).items;
    const match = matchTaskByTitle(rows, command.query);
    if (match.status === 'none') {
      return plain('No encuentro esa tarea.');
    }
    if (match.status === 'many') {
      return plain(`Hay varias: ${match.titles.join(', ')}. Escribe el título completo.`);
    }
    await this.tasks.complete(user, match.id, {}, `telegram-done-${updateId}`);
    return plain(`Completada: ${match.title}.`);
  }

  private async callback(user: AuthUser, incoming: TelegramIncoming): Promise<string> {
    if (incoming.callbackData.startsWith('s:')) {
      await this.snoozeButton(user, incoming);
      return 'snooze';
    }
    await this.completeButton(user, incoming);
    return 'complete';
  }

  private async snoozeButton(user: AuthUser, incoming: TelegramIncoming): Promise<void> {
    const match = /^s:([0-9a-f-]{36}):(\d+|afternoon)$/i.exec(incoming.callbackData);
    const deliveryId = match?.[1];
    const token = match?.[2]?.toLowerCase();
    const minutes = token === undefined || token === 'afternoon' ? null : Number(token);
    if (
      deliveryId === undefined ||
      !TASK_UUID.test(deliveryId) ||
      token === undefined ||
      (minutes !== null && !Number.isInteger(minutes))
    ) {
      await this.telegram.call(
        'answerCallbackQuery',
        {
          callback_query_id: incoming.callbackId,
          text: 'No reconozco ese aviso',
          show_alert: true,
        },
        user.id,
      );
      return;
    }
    const delivery = await this.prisma.reminderDelivery.findFirst({
      where: { id: deliveryId, ownerId: user.id },
      select: { id: true, taskId: true, reminderId: true },
    });
    if (delivery?.taskId == null) {
      await this.telegram.call(
        'answerCallbackQuery',
        {
          callback_query_id: incoming.callbackId,
          text: 'Ese aviso ya no está',
          show_alert: true,
        },
        user.id,
      );
      return;
    }
    const until = await this.snoozeUntil(user, delivery.taskId, token, minutes);
    if (until === null) {
      await this.telegram.call(
        'answerCallbackQuery',
        {
          callback_query_id: incoming.callbackId,
          text: 'No puedo aplazar ese aviso',
          show_alert: true,
        },
        user.id,
      );
      return;
    }
    if (delivery.reminderId !== null) {
      await this.tasks.snoozeReminder(
        user,
        delivery.taskId,
        delivery.reminderId,
        until.preset,
        until.preset === 'custom' ? until.at : null,
      );
    } else {
      await this.tasks.createReminder(
        user,
        delivery.taskId,
        { trigger: until.at, type: 'absolute', absolute_at: until.at, channel: 'push' },
        `telegram-snooze-${incoming.callbackId}`,
      );
    }
    await this.prisma.reminderDelivery.update({
      where: { id: delivery.id },
      data: { status: 'cancelled' },
    });
    await this.telegram.call(
      'answerCallbackQuery',
      {
        callback_query_id: incoming.callbackId,
        text: until.reply,
      },
      user.id,
    );
    await this.strike(user, incoming);
  }

  private async snoozeUntil(
    user: AuthUser,
    taskId: string,
    token: string,
    minutes: number | null,
  ): Promise<{ preset: '10m' | '1h' | 'custom'; at: string; reply: string } | null> {
    if (token === '10' || minutes === 10) {
      return {
        preset: '10m',
        at: new Date(Date.now() + 10 * 60_000).toISOString(),
        reply: 'Avisaré en 10 minutos',
      };
    }
    if (token === '60' || minutes === 60) {
      return {
        preset: '1h',
        at: new Date(Date.now() + 60 * 60_000).toISOString(),
        reply: 'Avisaré en 1 hora',
      };
    }
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ownerId: user.id, deletedAt: null },
      select: { timeZone: true },
    });
    if (task === null) {
      return null;
    }
    if (token === 'afternoon') {
      const at = afternoonInstant(new Date().toISOString(), task.timeZone);
      return at === null ? null : { preset: 'custom', at, reply: 'Avisaré esta tarde' };
    }
    if (minutes === null || minutes < 1) {
      return null;
    }
    return {
      preset: 'custom',
      at: new Date(Date.now() + minutes * 60_000).toISOString(),
      reply: `Avisaré en ${String(minutes)} minutos`,
    };
  }

  private async completeButton(user: AuthUser, incoming: TelegramIncoming): Promise<void> {
    const data = incoming.callbackData;
    let id = '';
    if (data.startsWith('t:')) {
      const token = data.slice(2);
      const row = await this.prisma.telegramCallback.findFirst({
        where: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
          ownerId: user.id,
          action: 'complete',
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (row === null) {
        await this.telegram.call(
          'answerCallbackQuery',
          {
            callback_query_id: incoming.callbackId,
            text: 'Ese botón ya no es válido',
            show_alert: true,
          },
          user.id,
        );
        return;
      }
      await this.prisma.telegramCallback.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      id = row.resourceId;
    } else if (data.startsWith('c:')) {
      // Legacy editable callback ids are refused (APP-07a).
      await this.telegram.call(
        'answerCallbackQuery',
        {
          callback_query_id: incoming.callbackId,
          text: 'Pide de nuevo la lista para usar botones seguros',
          show_alert: true,
        },
        user.id,
      );
      return;
    }
    if (!TASK_UUID.test(id)) {
      await this.telegram.call(
        'answerCallbackQuery',
        {
          callback_query_id: incoming.callbackId,
          text: 'No reconozco esa tarea',
          show_alert: true,
        },
        user.id,
      );
      return;
    }
    await this.tasks.complete(user, id, {}, `telegram-cb-${incoming.callbackId}`);
    await this.telegram.call(
      'answerCallbackQuery',
      {
        callback_query_id: incoming.callbackId,
        text: 'Completada',
      },
      user.id,
    );
    await this.strike(user, incoming);
  }

  private async strike(user: AuthUser, incoming: TelegramIncoming): Promise<void> {
    if (
      incoming.messageId === null ||
      incoming.messageText === null ||
      incoming.messageText.length === 0
    ) {
      return;
    }
    const safe = incoming.messageText
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    try {
      await this.telegram.call(
        'editMessageText',
        {
          chat_id: incoming.chatId,
          message_id: incoming.messageId,
          text: `<s>${safe}</s>`,
          parse_mode: 'HTML',
        },
        user.id,
      );
    } catch {
      // The task change already landed. A failed edit must not undo it.
    }
  }

  private async photo(user: AuthUser, incoming: TelegramIncoming): Promise<void> {
    const file = await this.telegram.download(incoming.fileId, user.id);
    if (file.bytes.length > ATTACHMENT_MAX_BYTES) {
      await this.send(user.id, incoming.chatId, plain('La foto pasa de 25 MB.'));
      return;
    }
    const caption = incoming.caption.trim();
    const draft =
      caption.length > 0 ? { raw_text: caption } : await this.inboxTask(user.id, 'Foto');
    const created = await this.tasks.create(
      user,
      { ...draft, metadata: { capture: 'telegram' } },
      `telegram-${incoming.updateId}`,
    );
    if (!created.replayed) {
      const name = file.filePath.split('/').pop() ?? 'foto.jpg';
      await this.tasks.addAttachment(user, created.body.id, {
        originalname: name,
        mimetype: mimeOf(name),
        size: file.bytes.length,
        buffer: file.bytes,
      });
    }
    await this.send(
      user.id,
      incoming.chatId,
      plain(
        await this.confirmation(user, created.body, created.body.warnings, 'Guardada con foto'),
      ),
    );
  }

  private async confirmation(
    user: AuthUser,
    task: TaskSummaryJson,
    warnings: readonly CaptureWarning[] | undefined,
    lead = 'Guardada',
  ): Promise<string> {
    const list = await this.prisma.project.findFirst({
      where: { id: task.project_id, ownerId: user.id, deletedAt: null },
      select: { name: true },
    });
    const tags =
      task.tag_ids.length === 0
        ? []
        : await this.prisma.tag.findMany({
            where: { ownerId: user.id, id: { in: task.tag_ids }, deletedAt: null },
            select: { id: true, name: true },
          });
    const names = task.tag_ids.flatMap((id) => {
      const name = tags.find((tag) => tag.id === id)?.name;
      return name === undefined ? [] : [name];
    });
    const message = formatCaptureReply({
      title: task.title,
      dueDate: task.due_date,
      isAllDay: task.is_all_day,
      priority: task.priority,
      tags: names,
      listName: list?.name ?? '',
      timeZone: user.timeZone,
      now: new Date().toISOString(),
      lead,
    });
    const notes = captureNotes(warnings);
    return notes.length === 0 ? message : `${message}\n${notes.join(' ')}`;
  }

  private async datedList(user: AuthUser, kind: 'today' | 'tomorrow' | 'week'): Promise<Reply> {
    const span = kind === 'today' ? daySpan(0) : kind === 'tomorrow' ? daySpan(1) : weekSpan();
    const rows = await this.dated(user, span);
    const empty =
      kind === 'today'
        ? 'Hoy no hay tareas con fecha.'
        : kind === 'tomorrow'
          ? 'Mañana no hay tareas con fecha.'
          : 'Esta semana no hay tareas con fecha.';
    if (rows.length === 0) {
      return plain(empty);
    }
    const title = kind === 'today' ? 'Hoy' : kind === 'tomorrow' ? 'Mañana' : 'Esta semana';
    const path =
      kind === 'today' ? '/today' : kind === 'tomorrow' ? '/smart/tomorrow' : '/calendar/week';
    return this.checklist(user.id, title, rows, await this.projectNames(user.id), true, path);
  }

  private async projectList(user: AuthUser): Promise<Reply> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      take: 100,
      select: { name: true },
    });
    if (projects.length === 0) {
      return plain('No hay listas.');
    }
    const lines = projects.map((row) => `☐ ${escapeHtml(row.name)}`).join('\n');
    return {
      text: `${lines}\n\n<a href="${webBase()}/today">Ver en la app</a>`,
      html: true,
      buttons: [],
    };
  }

  private async tagList(user: AuthUser, name: string): Promise<Reply> {
    if (name.length === 0) {
      return plain('Escribe la etiqueta: /lista #5min');
    }
    const tag = await this.prisma.tag.findFirst({
      where: { ownerId: user.id, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (tag === null) {
      return plain(`No encuentro la etiqueta «${name}».`);
    }
    const rows = (
      await this.tasks.list(user, this.query({ tagId: tag.id, includeDescendants: true }))
    ).items;
    if (rows.length === 0) {
      return plain(`No hay tareas con #${tag.name}.`);
    }
    return this.checklist(
      user.id,
      `#${tag.name}`,
      rows,
      await this.projectNames(user.id),
      true,
      `/search?q=${encodeURIComponent(tag.name)}`,
    );
  }

  private async priorityList(user: AuthUser, level: 'high' | 'medium' | 'low'): Promise<Reply> {
    const label = level === 'high' ? 'alta' : level === 'medium' ? 'media' : 'baja';
    const rows = (await this.tasks.list(user, this.query({ priority: level }))).items;
    if (rows.length === 0) {
      return plain(`No hay tareas con prioridad ${label}.`);
    }
    return this.checklist(
      user.id,
      `Prioridad ${label}`,
      rows,
      await this.projectNames(user.id),
      true,
      '/matrix',
    );
  }

  private async namedList(user: AuthUser, name: string): Promise<Reply> {
    const project = await this.prisma.project.findFirst({
      where: { ownerId: user.id, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true, isInbox: true },
    });
    if (project === null) {
      return plain(`No encuentro la lista «${name}».`);
    }
    const rows = (await this.tasks.list(user, this.query({ projectId: project.id }))).items;
    if (rows.length === 0) {
      return plain(`«${project.name}» no tiene tareas activas.`);
    }
    const path = project.isInbox ? '/inbox' : `/list/${project.id}`;
    return this.checklist(user.id, project.name, rows, new Map(), false, path);
  }

  private async dated(
    user: AuthUser,
    span: { after: string; before: string },
  ): Promise<TaskSummaryJson[]> {
    const page = await this.tasks.list(
      user,
      this.query({ dueAfter: span.after, dueBefore: span.before }),
    );
    return page.items;
  }

  private async inboxTask(
    ownerId: string,
    title: string,
  ): Promise<{ project_id: string; title: string }> {
    const inbox = await this.prisma.project.findFirst({
      where: { ownerId, isInbox: true, deletedAt: null },
      select: { id: true },
    });
    if (inbox === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'Inbox was not found');
    }
    return { project_id: inbox.id, title };
  }

  private async projectNames(ownerId: string): Promise<Map<string, string>> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, name: true },
    });
    return new Map(projects.map((row) => [row.id, row.name]));
  }

  private async checklist(
    ownerId: string,
    title: string,
    rows: readonly TaskSummaryJson[],
    names: ReadonlyMap<string, string>,
    withList: boolean,
    path: string,
  ): Promise<Reply> {
    const lines = rows.map((row, index) => {
      const list = names.get(row.project_id);
      const name = withList && list !== undefined ? `${row.title} — ${list}` : row.title;
      return `${String(index + 1)}. ☐ ${escapeHtml(name)}`;
    });
    const buttons = await Promise.all(
      rows.map(async (row) => ({
        text: `☐ ${row.title}`.slice(0, 64),
        data: await this.opaqueCallback(ownerId, 'complete', row.id),
      })),
    );
    return {
      text: `${escapeHtml(title)}\n${lines.join('\n')}\n\n<a href="${webBase()}${path}">Ver en la app</a>`,
      html: true,
      buttons,
    };
  }

  private async opaqueCallback(
    ownerId: string,
    action: string,
    resourceId: string,
  ): Promise<string> {
    const token = randomBytes(18).toString('base64url');
    await this.prisma.telegramCallback.create({
      data: {
        ownerId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        action,
        resourceId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return `t:${token}`;
  }

  private async userFor(chatId: string, ownerId: string): Promise<AuthUser | null> {
    const link = await this.prisma.telegramLink.findFirst({
      where: {
        chatId,
        deletedAt: null,
        ownerId,
      },
      select: { ownerId: true },
    });
    if (link === null) {
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: link.ownerId, deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (user === null) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      timeZone: user.timeZone,
      completeChildren: user.taskCompleteChildren,
      scopes: [...TELEGRAM_BOT_SCOPES],
      tokenId: null,
      sessionId: null,
      listIds: null,
    };
  }

  private async remember(ownerId: string, chatId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.telegramLink.upsert({
        where: { ownerId_chatId: { ownerId, chatId } },
        create: { ownerId, chatId },
        update: { ownerId, deletedAt: null },
      });
      await this.events.record(
        tx,
        { ownerId, actorId: ownerId, actorKind: 'user', tokenId: null },
        {
          type: DomainEvent.telegramLinked,
          entityType: 'telegram_link',
          entityId: saved.id,
          action: 'created',
          data: asJson({ chat_id: chatId, bot_configured: true }),
          previous: null,
        },
      );
    });
  }

  private async transcribe(fileId: string, ownerId: string): Promise<string> {
    const provider = process.env.TELEGRAM_VOICE_PROVIDER?.trim() ?? '';
    let url: URL;
    try {
      url = new URL(provider);
    } catch {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'voice_not_configured',
        'Set TELEGRAM_VOICE_PROVIDER to a transcription URL',
      );
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'voice_not_configured',
        'Set TELEGRAM_VOICE_PROVIDER to a transcription URL',
      );
    }
    const file = await this.telegram.download(fileId, ownerId);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file.bytes,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new DomainException(HttpStatus.BAD_GATEWAY, 'voice_failed', 'Transcription failed');
    }
    const body = (await response.json()) as { text?: unknown };
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      throw new DomainException(HttpStatus.BAD_GATEWAY, 'voice_failed', 'Transcription was empty');
    }
    return body.text.trim();
  }

  private async send(ownerId: string | undefined, chatId: string, reply: Reply): Promise<void> {
    await this.telegram.call(
      'sendMessage',
      {
        chat_id: chatId,
        text: reply.text,
        ...(reply.html ? { parse_mode: 'HTML' } : {}),
        ...(reply.buttons.length === 0
          ? {}
          : {
              reply_markup: {
                inline_keyboard: reply.buttons.map((button) => [
                  { text: button.text, callback_data: button.data },
                ]),
              },
            }),
      },
      ownerId,
    );
  }

  private query(extra: Partial<TaskListQuery>): TaskListQuery {
    return {
      limit: 8,
      status: 'active',
      includeDescendants: true,
      flat: false,
      sort: 'manual',
      deleted: false,
      overdue: false,
      ...extra,
    };
  }
}

function plain(text: string): Reply {
  return { text, html: false, buttons: [] };
}

function captureNotes(warnings: readonly CaptureWarning[] | undefined): string[] {
  const notes: string[] = [];
  for (const warning of warnings ?? []) {
    if (warning.code === 'list_created' && warning.name !== undefined) {
      notes.push(`Lista creada: ${warning.name}.`);
    } else if (warning.code === 'tag_created' && warning.name !== undefined) {
      notes.push(`Etiqueta creada: ${warning.name}.`);
    } else if (warning.code === 'list_not_found') {
      notes.push(`La lista «${warning.name ?? ''}» no existe, así que quedó en la bandeja.`);
    }
  }
  return notes;
}

function webBase(): string {
  const configured = process.env.APP_WEB_URL?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:5173';
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function mimeOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'image/jpeg';
}

function failureText(error: unknown): string {
  if (!(error instanceof DomainException)) {
    return 'No he podido hacerlo.';
  }
  const body = error.getResponse();
  if (typeof body !== 'object') {
    return 'No he podido hacerlo.';
  }
  const record = body as { code?: unknown; message?: unknown };
  if (record.code === 'children_need_decision') {
    return 'Tiene subtareas activas. Complétala en la app.';
  }
  if (record.code === 'voice_not_configured') {
    return 'La voz aún no tiene transcripción configurada.';
  }
  if (
    typeof record.message === 'string' &&
    record.message.length > 0 &&
    record.message.length < 180
  ) {
    return `No he podido hacerlo. ${record.message}`;
  }
  return 'No he podido hacerlo.';
}

function madridParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function madridOffsetMs(instant: Date): number {
  const parts = madridParts(instant);
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

function madridMidnight(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  const corrected = wall - madridOffsetMs(new Date(wall - madridOffsetMs(new Date(wall))));
  return new Date(corrected);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  offset: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function spanFrom(startOffsetDays: number, lengthDays: number): { after: string; before: string } {
  const today = madridParts(new Date());
  const startDate = addCalendarDays(today.year, today.month, today.day, startOffsetDays);
  const endDate = addCalendarDays(startDate.year, startDate.month, startDate.day, lengthDays);
  const start = madridMidnight(startDate.year, startDate.month, startDate.day);
  const end = madridMidnight(endDate.year, endDate.month, endDate.day);
  return {
    after: new Date(start.getTime() - 1).toISOString(),
    before: end.toISOString(),
  };
}

function daySpan(offsetDays: number): { after: string; before: string } {
  return spanFrom(offsetDays, 1);
}

function weekSpan(): { after: string; before: string } {
  const today = madridParts(new Date());
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return spanFrom(mondayOffset, 7);
}
