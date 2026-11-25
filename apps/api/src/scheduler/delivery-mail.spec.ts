import { describe, expect, it, vi } from 'vitest';
import type { DayClosingService } from '../modules/planning/day-closing.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  DIGEST_FETCH_LIMIT,
  digestEnqueuePayload,
  digestTaskWhere,
  endOfLocalDay,
  recordMissingTask,
  resolveDeliveryNotice,
  taskEnqueuePayload,
} from './delivery-mail.js';

const fireAt = '2026-11-25T06:00:00.000Z';
const now = new Date(fireAt);

function taskRow(title: string) {
  return {
    id: 'task-1',
    title,
    content: '',
    status: 'active',
    deletedAt: null,
    dueDate: new Date('2026-11-25T09:00:00.000Z'),
    startDate: null,
    isAllDay: false,
    timeZone: 'Europe/Madrid',
    priority: 'high' as const,
    project: { name: 'Casa' },
    tags: [{ tag: { name: 'casa' } }],
  };
}

function deps(task: ReturnType<typeof taskRow> | null) {
  const findMany = vi.fn().mockResolvedValue([
    {
      id: 'digest-1',
      title: 'Revisar #review',
      dueDate: new Date('2026-11-24T08:00:00.000Z'),
      startDate: null,
      isAllDay: false,
      timeZone: 'Europe/Madrid',
      priority: 'none',
      project: { name: 'Trabajo' },
      tags: [{ tag: { name: 'review' } }],
    },
  ]);
  const count = vi.fn().mockResolvedValue(22);
  const findFirst = vi.fn().mockResolvedValue(task);
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        locale: 'es',
        timeZone: 'Europe/Madrid',
        email: 'ada@example.test',
        dailyReminderTime: '07:00',
      }),
    },
    task: { findMany, count, findFirst },
    countdown: { findFirst: vi.fn().mockResolvedValue({ title: 'Viaje actual' }) },
    notificationReceipt: { create: vi.fn() },
    reminderDelivery: { update: vi.fn() },
  };
  const closing = {
    digestLine: vi.fn().mockResolvedValue(null),
    shutdownReminder: vi.fn().mockResolvedValue({ pending: 2, body: 'quedan 2' }),
  };
  return { prisma, closing, findMany, count, findFirst };
}

describe('delivery mail', () => {
  it('queues a digest and a reminder without HTML', () => {
    const digest = digestEnqueuePayload({
      digestDate: fireAt,
      locale: 'es',
      email: 'ada@example.test',
    });
    const reminder = taskEnqueuePayload('es');
    const constant = taskEnqueuePayload('en');
    expect(digest).toEqual({ digestDate: fireAt, locale: 'es', email: 'ada@example.test' });
    expect(reminder).toEqual({ locale: 'es' });
    expect(constant).toEqual({ locale: 'en' });
    expect(JSON.stringify(digest)).not.toContain('html');
    expect(JSON.stringify(reminder)).not.toContain('html');
  });

  it('renders the digest at delivery from the current tasks and a capped query', async () => {
    const { prisma, closing, findMany, count } = deps(null);
    const end = endOfLocalDay(fireAt, 'Europe/Madrid');
    const resolution = await resolveDeliveryNotice(
      prisma as unknown as PrismaService,
      closing as unknown as DayClosingService,
      {
        id: 'delivery-1',
        kind: 'daily_digest',
        ownerId: 'owner-1',
        taskId: null,
        fireAt,
        payload: digestEnqueuePayload({
          digestDate: fireAt,
          locale: 'en',
          email: 'ada@example.test',
        }),
      },
      now,
    );
    expect(resolution.action).toBe('send');
    if (resolution.action !== 'send') {
      return;
    }
    expect(resolution.notice.html).toContain('Revisar');
    expect(resolution.notice.html).not.toContain('#review');
    expect(resolution.notice.emailText).toContain('/task/digest-1');
    expect(resolution.notice.emailSubject).toContain('Planifica tu día');
    expect(resolution.notice.html).not.toBe(resolution.notice.body);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: DIGEST_FETCH_LIMIT,
        where: digestTaskWhere('owner-1', end),
        orderBy: { dueDate: 'asc' },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: digestTaskWhere('owner-1', end) });
    expect(DIGEST_FETCH_LIMIT).toBe(21);
  });

  it('renders a reminder from the task as it is at send time', async () => {
    const { prisma, closing, findFirst } = deps(taskRow('Título nuevo #casa'));
    const resolution = await resolveDeliveryNotice(
      prisma as unknown as PrismaService,
      closing as unknown as DayClosingService,
      {
        id: 'delivery-2',
        kind: 'task',
        ownerId: 'owner-1',
        taskId: 'task-1',
        fireAt,
        payload: taskEnqueuePayload('es'),
      },
      now,
    );
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task-1' } }));
    expect(resolution.action).toBe('send');
    if (resolution.action !== 'send') {
      return;
    }
    expect(resolution.notice.title).toBe('Título nuevo #casa');
    expect(resolution.notice.body).toBe('Recordatorio: Título nuevo #casa');
    expect(resolution.notice.emailSubject).toContain('Título nuevo');
    expect(resolution.notice.html).toContain('Título nuevo');
    expect(resolution.notice.html).not.toContain('<html>old');
    expect(JSON.stringify(resolution.notice.body)).not.toContain('<html');
  });

  it('skips a deleted task and records that in the receipt log', async () => {
    const { prisma, closing } = deps(null);
    const resolution = await resolveDeliveryNotice(
      prisma as unknown as PrismaService,
      closing as unknown as DayClosingService,
      {
        id: 'delivery-3',
        kind: 'task',
        ownerId: 'owner-1',
        taskId: 'missing',
        fireAt,
        payload: taskEnqueuePayload('es'),
      },
      now,
    );
    expect(resolution).toEqual({ action: 'skip', reason: 'task_missing' });
    await recordMissingTask(
      prisma as unknown as PrismaService,
      { id: 'delivery-3', ownerId: 'owner-1', fireAt: now },
      now,
    );
    expect(prisma.notificationReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryId: 'delivery-3',
          channel: 'email',
          status: 'skipped',
          reason: 'task_missing',
        }),
      }),
    );
    expect(prisma.reminderDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery-3' },
        data: expect.objectContaining({
          status: 'cancelled',
          channelState: { email: 'skipped', reason: 'task_missing' },
        }),
      }),
    );
  });

  it('sends a legacy payload that already contains html without reading the task', async () => {
    const { prisma, closing, findFirst } = deps(taskRow('Actual'));
    const resolution = await resolveDeliveryNotice(
      prisma as unknown as PrismaService,
      closing as unknown as DayClosingService,
      {
        id: 'delivery-4',
        kind: 'task',
        ownerId: 'owner-1',
        taskId: 'task-1',
        fireAt,
        payload: {
          title: 'Viejo',
          body: 'Recordatorio: Viejo',
          html: '<p>old-html</p>',
          email_subject: 'Recordatorio: Viejo',
          email_text: 'texto viejo',
        },
      },
      now,
    );
    expect(findFirst).not.toHaveBeenCalled();
    expect(resolution).toEqual({
      action: 'send',
      notice: {
        title: 'Viejo',
        body: 'Recordatorio: Viejo',
        html: '<p>old-html</p>',
        emailSubject: 'Recordatorio: Viejo',
        emailText: 'texto viejo',
      },
    });
  });

  it('cancels a reminder whose task is already completed', async () => {
    const completed = { ...taskRow('Hecha'), status: 'completed' };
    const { prisma, closing } = deps(completed);
    const resolution = await resolveDeliveryNotice(
      prisma as unknown as PrismaService,
      closing as unknown as DayClosingService,
      {
        id: 'delivery-5',
        kind: 'task',
        ownerId: 'owner-1',
        taskId: 'task-1',
        fireAt,
        payload: taskEnqueuePayload('es'),
      },
      now,
    );
    expect(resolution).toEqual({ action: 'cancel' });
  });
});
