import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { parseIcal, tasksToIcal, type IcalTask } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { googleConfigured, googleRefreshConfigured } from '../../integrations/config';

const MAX_ICAL_BYTES = 1_000_000;

@Injectable()
export class CalendarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async range(user: AuthUser, fromIso: string, toIso: string) {
    const from = this.instant(fromIso, 'from');
    const to = this.instant(toIso, 'to');
    const tasks = await this.prisma.task.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        status: 'active',
        OR: [{ dueDate: { gte: from, lt: to } }, { startDate: { gte: from, lt: to } }],
      },
      orderBy: { dueDate: 'asc' },
    });
    const external = await this.prisma.externalEvent.findMany({
      where: { ownerId: user.id, deletedAt: null, startsAt: { gte: from, lt: to } },
      include: { subscription: { select: { color: true, provider: true } } },
    });
    return {
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        project_id: task.projectId,
        start_date: task.startDate?.toISOString() ?? null,
        due_date: task.dueDate?.toISOString() ?? null,
        is_all_day: task.isAllDay,
        editable: true,
      })),
      external: external.map((event) => ({
        id: event.id,
        title: event.title,
        starts_at: event.startsAt.toISOString(),
        ends_at: event.endsAt?.toISOString() ?? null,
        is_all_day: event.isAllDay,
        color: event.subscription.color,
        provider: event.subscription.provider,
        editable: false,
      })),
    };
  }

  async subscribe(
    user: AuthUser,
    body: { url?: string; provider?: string; color?: string; sync_direction?: 'read' | 'two_way' },
  ) {
    const provider = body.provider ?? 'ical';
    const direction = body.sync_direction ?? 'read';
    if (provider === 'google' && !googleConfigured()) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Google Calendar needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      );
    }
    if (provider !== 'google' && (body.url === undefined || body.url.length === 0)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is required');
    }
    if (direction === 'two_way' && provider !== 'google') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'two_way is only available for Google Calendar',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.calendarSubscription.create({
        data: {
          ownerId: user.id,
          url: body.url ?? null,
          provider,
          syncDirection: direction,
          color: body.color ?? null,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSubscribed,
        entityType: 'calendar_subscription',
        entityId: created.id,
        action: 'created',
        data: { subscription: asJson({ id: created.id, provider, sync_direction: direction }) },
        previous: null,
      });
      return created;
    });
    if (row.url !== null) {
      await this.refresh(user, row.id);
    }
    return {
      id: row.id,
      provider,
      url: row.url,
      sync_direction: direction,
      color: row.color,
      google_configured: googleConfigured(),
    };
  }

  async listSubscriptions(user: AuthUser) {
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        url: row.url,
        sync_direction: row.syncDirection,
        color: row.color,
        last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
      })),
      google_configured: googleConfigured(),
    };
  }

  async removeSubscription(user: AuthUser, id: string): Promise<void> {
    const row = await this.prisma.calendarSubscription.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'subscription_not_found',
        'Subscription was not found',
      );
    }
    await this.prisma.calendarSubscription.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** RF-2004 write path. Without a refresh token this does not call Google. */
  async push(user: AuthUser, id: string): Promise<{ pushed: number }> {
    const row = await this.prisma.calendarSubscription.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'subscription_not_found',
        'Subscription was not found',
      );
    }
    if (row.syncDirection !== 'two_way') {
      throw new DomainException(HttpStatus.CONFLICT, 'read_only', 'This subscription is read only');
    }
    const token = await this.googleAccessToken();
    const tasks = await this.prisma.task.findMany({
      where: { ownerId: user.id, deletedAt: null, status: 'active', dueDate: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    let pushed = 0;
    for (const task of tasks) {
      const due = task.dueDate;
      if (due === null) {
        continue;
      }
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            summary: task.title,
            description: task.content,
            start: task.isAllDay
              ? { date: due.toISOString().slice(0, 10) }
              : { dateTime: (task.startDate ?? due).toISOString() },
            end: task.isAllDay
              ? { date: due.toISOString().slice(0, 10) }
              : { dateTime: due.toISOString() },
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'google_push_failed',
          'Google Calendar rejected an event',
        );
      }
      pushed += 1;
    }
    return { pushed };
  }

  async refresh(user: AuthUser, id: string): Promise<{ imported: number }> {
    const row = await this.prisma.calendarSubscription.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'subscription_not_found',
        'Subscription was not found',
      );
    }
    if (row.provider === 'google') {
      return this.refreshGoogle(user, row.id);
    }
    if (row.url == null) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Nothing to fetch');
    }
    const text = await this.fetchIcal(row.url);
    const parsed = parseIcal(text);
    await this.prisma.$transaction(async (tx) => {
      for (const event of parsed) {
        await tx.externalEvent.upsert({
          where: { subscriptionId_externalUid: { subscriptionId: row.id, externalUid: event.uid } },
          create: {
            ownerId: user.id,
            subscriptionId: row.id,
            externalUid: event.uid,
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: event.endsAt === null ? null : new Date(event.endsAt),
            isAllDay: event.isAllDay,
          },
          update: {
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: event.endsAt === null ? null : new Date(event.endsAt),
            isAllDay: event.isAllDay,
            deletedAt: null,
          },
        });
      }
      await tx.calendarSubscription.update({
        where: { id: row.id },
        data: { lastSyncedAt: new Date() },
      });
      if (parsed.length > 0) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.calendarEventImported,
          entityType: 'calendar_subscription',
          entityId: row.id,
          action: 'updated',
          data: { imported: parsed.length },
          previous: null,
        });
      }
    });
    return { imported: parsed.length };
  }

  async createFeed(user: AuthUser, body: { project_id?: string; filter_id?: string }) {
    if (body.project_id === undefined && body.filter_id === undefined) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'project_id or filter_id is required',
      );
    }
    const token = randomBytes(24).toString('base64url');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.calendarFeed.create({
        data: {
          ownerId: user.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          projectId: body.project_id ?? null,
          filterId: body.filter_id ?? null,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarFeedRotated,
        entityType: 'calendar_feed',
        entityId: created.id,
        action: 'created',
        data: { feed: { id: created.id } },
        previous: null,
      });
      return created;
    });
    const base = process.env.PUBLIC_URL ?? 'https://todo.reflexionia.com';
    return { id: row.id, url: `${base}/feeds/${token}.ics` };
  }

  async revokeFeed(user: AuthUser, id: string): Promise<void> {
    const row = await this.prisma.calendarFeed.findFirst({
      where: { id, ownerId: user.id, deletedAt: null, revokedAt: null },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'feed_not_found', 'Feed was not found');
    }
    await this.prisma.calendarFeed.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async feedIcal(token: string): Promise<string> {
    const hash = createHash('sha256').update(token).digest('hex');
    const feed = await this.prisma.calendarFeed.findFirst({
      where: { tokenHash: hash, revokedAt: null, deletedAt: null },
    });
    if (feed === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'feed_not_found', 'Feed was not found');
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        ownerId: feed.ownerId,
        deletedAt: null,
        status: 'active',
        ...(feed.projectId === null ? {} : { projectId: feed.projectId }),
      },
    });
    const icalTasks: IcalTask[] = tasks
      .filter((task) => task.dueDate !== null || task.startDate !== null)
      .map((task) => ({
        id: task.id,
        title: task.title,
        content: task.content,
        startDate: task.startDate?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
        isAllDay: task.isAllDay,
      }));
    return tasksToIcal('Reflexionia', icalTasks, new Date().toISOString());
  }

  private instant(value: string, name: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `${name} is not a date`,
      );
    }
    return parsed;
  }

  private async refreshGoogle(
    user: AuthUser,
    subscriptionId: string,
  ): Promise<{ imported: number }> {
    const token = await this.googleAccessToken();
    const now = new Date();
    const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'calendar_fetch_failed',
        'Google Calendar refused the read',
      );
    }
    const body = (await response.json()) as { items?: unknown };
    const items = Array.isArray(body.items) ? body.items : [];
    const parsed = items.flatMap((item) => googleEvent(item));
    await this.prisma.$transaction(async (tx) => {
      for (const event of parsed) {
        await tx.externalEvent.upsert({
          where: { subscriptionId_externalUid: { subscriptionId, externalUid: event.uid } },
          create: {
            ownerId: user.id,
            subscriptionId,
            externalUid: event.uid,
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: event.endsAt === null ? null : new Date(event.endsAt),
            isAllDay: event.isAllDay,
          },
          update: {
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: event.endsAt === null ? null : new Date(event.endsAt),
            deletedAt: null,
          },
        });
      }
      await tx.calendarSubscription.update({
        where: { id: subscriptionId },
        data: { lastSyncedAt: new Date() },
      });
      if (parsed.length > 0) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.calendarEventImported,
          entityType: 'calendar_subscription',
          entityId: subscriptionId,
          action: 'updated',
          data: { imported: parsed.length, provider: 'google' },
          previous: null,
        });
      }
    });
    return { imported: parsed.length };
  }

  private async googleAccessToken(): Promise<string> {
    if (!googleRefreshConfigured()) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Google Calendar needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN',
      );
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'google_push_failed',
        'Google token exchange failed',
      );
    }
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'google_push_failed',
        'Google did not return an access token',
      );
    }
    return body.access_token;
  }

  private async fetchIcal(url: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url is invalid');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'url must be http(s)');
    }
    const response = await fetch(parsed, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'calendar_fetch_failed',
        'Calendar URL failed',
      );
    }
    const text = await response.text();
    if (text.length > MAX_ICAL_BYTES) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Calendar is too large',
      );
    }
    return text;
  }
}

function googleEvent(
  value: unknown,
): { uid: string; title: string; startsAt: string; endsAt: string | null; isAllDay: boolean }[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const item = value as {
    id?: unknown;
    summary?: unknown;
    start?: { dateTime?: unknown; date?: unknown };
    end?: { dateTime?: unknown; date?: unknown };
  };
  if (typeof item.id !== 'string') {
    return [];
  }
  const start = typeof item.start?.dateTime === 'string' ? item.start.dateTime : item.start?.date;
  if (typeof start !== 'string') {
    return [];
  }
  const end =
    typeof item.end?.dateTime === 'string'
      ? item.end.dateTime
      : typeof item.end?.date === 'string'
        ? item.end.date
        : null;
  return [
    {
      uid: item.id,
      title: typeof item.summary === 'string' ? item.summary : '(sin título)',
      startsAt: start,
      endsAt: end,
      isAllDay: typeof item.start?.date === 'string',
    },
  ];
}
