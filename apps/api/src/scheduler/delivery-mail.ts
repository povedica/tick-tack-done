import {
  DIGEST_TASK_LIMIT,
  instantFromWall,
  wallClock,
  type DigestTask,
} from '@reflexionia/domain';
import { mailLocale } from '../mail/templates/html.js';
import { renderCountdownReminder } from '../mail/templates/countdown.js';
import { renderDailyDigest } from '../mail/templates/daily-digest.js';
import { renderPlainNotice } from '../mail/templates/layout.js';
import { renderShutdownDigest } from '../mail/templates/shutdown-digest.js';
import { renderTaskReminder } from '../mail/templates/task-reminder.js';
import type { DayClosingService } from '../modules/planning/day-closing.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** One past the digest cap, so delivery can tell that more tasks exist. */
export const DIGEST_FETCH_LIMIT = DIGEST_TASK_LIMIT + 1;

export interface DeliveryNotice {
  readonly title: string;
  readonly body: string;
  readonly html?: string;
  readonly emailSubject?: string;
  readonly emailText?: string;
}

export type DeliveryResolution =
  | { readonly action: 'send'; readonly notice: DeliveryNotice }
  | { readonly action: 'skip'; readonly reason: 'task_missing' }
  | { readonly action: 'cancel' };

export interface DeliveryRow {
  readonly id: string;
  readonly kind: string;
  readonly ownerId: string;
  readonly taskId: string | null;
  readonly countdownId?: string | null;
  readonly fireAt: string;
  readonly payload: Record<string, unknown>;
}

/** End of the local civil day of `fireAt`. Shared by the digest query and its tests. */
export function endOfLocalDay(fireAt: string, timeZone: string): Date | null {
  const wall = wallClock(fireAt, timeZone);
  if (wall === null) {
    return null;
  }
  const isoInstant = instantFromWall({ ...wall, hour: 23, minute: 59, second: 59 }, timeZone);
  return isoInstant === null ? null : new Date(isoInstant);
}

export function digestTaskWhere(ownerId: string, end: Date | null) {
  return {
    ownerId,
    status: 'active' as const,
    deletedAt: null,
    parentId: null,
    dueDate: end === null ? ({ not: null } as const) : { not: null, lte: end },
  };
}

/** Email fields stay out of the queue. kind and ownerId live on the delivery row. */
export function digestEnqueuePayload(input: {
  readonly digestDate: string;
  readonly locale: string;
  readonly email: string;
}): { digestDate: string; locale: string; email: string } {
  return { digestDate: input.digestDate, locale: input.locale, email: input.email };
}

/** Both reminder enqueue paths (the scheduled one and the constant follow-up) use this. */
export function taskEnqueuePayload(locale: string): { locale: string } {
  return { locale };
}

/**
 * Builds the notice at send time. A payload that already has `html` is sent unchanged.
 * A missing task is not sent. A task that is no longer active is cancelled, which is
 * the rule `deliveryStale` already applies to reminders.
 */
export async function resolveDeliveryNotice(
  prisma: PrismaService,
  closing: DayClosingService,
  row: DeliveryRow,
  now: Date,
): Promise<DeliveryResolution> {
  if (typeof row.payload.html === 'string') {
    return { action: 'send', notice: legacyNotice(row.payload) };
  }
  if (row.kind === 'task') {
    return resolveTask(prisma, row, now);
  }
  if (row.kind === 'daily_digest') {
    return { action: 'send', notice: await resolveDigest(prisma, closing, row) };
  }
  if (row.kind === 'shutdown_digest') {
    return { action: 'send', notice: await resolveShutdown(prisma, closing, row) };
  }
  if (row.kind === 'countdown') {
    return { action: 'send', notice: await resolveCountdown(prisma, row) };
  }
  return { action: 'send', notice: plainFromPayload(row.payload) };
}

export async function recordMissingTask(
  prisma: PrismaService,
  row: { id: string; ownerId: string; fireAt: Date },
  now: Date,
): Promise<void> {
  await prisma.notificationReceipt.create({
    data: {
      ownerId: row.ownerId,
      deliveryId: row.id,
      kind: 'task',
      channel: 'email',
      status: 'skipped',
      reason: 'task_missing',
      scheduledAt: row.fireAt,
    },
  });
  await prisma.reminderDelivery.update({
    where: { id: row.id },
    data: {
      status: 'cancelled',
      firedAt: now,
      leaseUntil: null,
      channelState: { email: 'skipped', reason: 'task_missing' },
    },
  });
}

async function resolveTask(
  prisma: PrismaService,
  row: DeliveryRow,
  now: Date,
): Promise<DeliveryResolution> {
  if (row.taskId === null) {
    return { action: 'skip', reason: 'task_missing' };
  }
  const task = await prisma.task.findFirst({
    where: { id: row.taskId },
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      deletedAt: true,
      dueDate: true,
      startDate: true,
      isAllDay: true,
      timeZone: true,
      priority: true,
      project: { select: { name: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (task?.deletedAt !== null) {
    return { action: 'skip', reason: 'task_missing' };
  }
  if (task.status !== 'active') {
    return { action: 'cancel' };
  }
  const user = await loadUser(prisma, row.ownerId);
  const locale = user?.locale ?? stringField(row.payload, 'locale');
  const mail = renderTaskReminder({
    locale,
    id: task.id,
    title: task.title,
    content: task.content,
    dueDate: task.dueDate === null ? null : task.dueDate.toISOString(),
    startDate: task.startDate === null ? null : task.startDate.toISOString(),
    isAllDay: task.isAllDay,
    timeZone: task.timeZone,
    priority: task.priority,
    listName: task.project.name,
    tags: task.tags.map((link) => ({ name: link.tag.name })),
    now: now.toISOString(),
  });
  return {
    action: 'send',
    notice: {
      title: task.title,
      body: `Recordatorio: ${task.title}`,
      html: mail.html,
      emailSubject: mail.subject,
      emailText: mail.text,
    },
  };
}

async function resolveDigest(
  prisma: PrismaService,
  closing: DayClosingService,
  row: DeliveryRow,
): Promise<DeliveryNotice> {
  const user = await loadUser(prisma, row.ownerId);
  const fireAt = stringField(row.payload, 'digestDate') ?? row.fireAt;
  const timeZone = user?.timeZone ?? 'Europe/Madrid';
  const locale = mailLocale(user?.locale ?? stringField(row.payload, 'locale'));
  const end = endOfLocalDay(fireAt, timeZone);
  const where = digestTaskWhere(row.ownerId, end);
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      take: DIGEST_FETCH_LIMIT,
      select: {
        id: true,
        title: true,
        dueDate: true,
        startDate: true,
        isAllDay: true,
        timeZone: true,
        priority: true,
        project: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
    prisma.task.count({ where }),
  ]);
  const tasks: DigestTask[] = rows.flatMap((task) =>
    task.dueDate === null
      ? []
      : [
          {
            id: task.id,
            title: task.title,
            dueDate: task.dueDate.toISOString(),
            startDate: task.startDate === null ? null : task.startDate.toISOString(),
            isAllDay: task.isAllDay,
            timeZone: task.timeZone,
            priority: task.priority,
            listName: task.project.name,
            tags: task.tags.map((link) => ({ name: link.tag.name })),
          },
        ],
  );
  const rendered = renderDailyDigest({
    locale,
    fireAt,
    timeZone,
    tasks,
    extra: Math.max(0, total - rows.length),
    loadLine: await closing.digestLine(row.ownerId, fireAt, timeZone),
    reminderTime: user?.dailyReminderTime ?? null,
  });
  return {
    title: rendered.pushTitle,
    body: rendered.pushBody,
    html: rendered.mail.html,
    emailSubject: rendered.mail.subject,
    emailText: rendered.mail.text,
  };
}

async function resolveShutdown(
  prisma: PrismaService,
  closing: DayClosingService,
  row: DeliveryRow,
): Promise<DeliveryNotice> {
  const user = await loadUser(prisma, row.ownerId);
  const timeZone = user?.timeZone ?? 'Europe/Madrid';
  const locale = mailLocale(user?.locale ?? stringField(row.payload, 'locale'));
  const fresh = await closing.shutdownReminder(row.ownerId, timeZone, row.fireAt);
  const stored = plainFromPayload(row.payload);
  if (fresh === null) {
    const mail = renderPlainNotice({ locale, title: stored.title, body: stored.body });
    return { title: stored.title, body: stored.body, html: mail.html, emailText: mail.text };
  }
  const mail = renderShutdownDigest({ locale, pending: fresh.pending });
  return {
    title: stored.title,
    body: stored.body,
    html: mail.html,
    emailSubject: mail.subject,
    emailText: mail.text,
  };
}

async function resolveCountdown(prisma: PrismaService, row: DeliveryRow): Promise<DeliveryNotice> {
  const user = await loadUser(prisma, row.ownerId);
  const locale = mailLocale(user?.locale ?? stringField(row.payload, 'locale'));
  const storedTitle = stringField(row.payload, 'countdown_title');
  const current =
    row.countdownId === null || row.countdownId === undefined
      ? null
      : await prisma.countdown.findFirst({
          where: { id: row.countdownId, deletedAt: null },
          select: { title: true },
        });
  const title =
    current?.title ?? storedTitle ?? stringField(row.payload, 'title') ?? 'Cuenta atrás';
  const phase = stringField(row.payload, 'phase') === 'today' ? 'today' : 'upcoming';
  const days = numberField(row.payload, 'days') ?? 0;
  const stored = plainFromPayload(row.payload);
  const mail = renderCountdownReminder({ locale, title, kind: phase, days });
  return {
    title: stored.title,
    body: stored.body,
    html: mail.html,
    emailSubject: mail.subject,
    emailText: mail.text,
  };
}

function legacyNotice(payload: Record<string, unknown>): DeliveryNotice {
  const base = plainFromPayload(payload);
  const emailSubject = stringField(payload, 'email_subject');
  const emailText = stringField(payload, 'email_text');
  return {
    ...base,
    html: String(payload.html),
    ...(emailSubject === null ? {} : { emailSubject }),
    ...(emailText === null ? {} : { emailText }),
  };
}

function plainFromPayload(payload: Record<string, unknown>): DeliveryNotice {
  return {
    title: stringField(payload, 'title') ?? 'Recordatorio',
    body: stringField(payload, 'body') ?? '',
  };
}

async function loadUser(prisma: PrismaService, ownerId: string) {
  return prisma.user.findUnique({
    where: { id: ownerId },
    select: { locale: true, timeZone: true, email: true, dailyReminderTime: true },
  });
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function numberField(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' ? value : null;
}
