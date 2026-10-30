import { GOOGLE_ACCESS_SELECT } from '../../integrations/google-access.js';
import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { parseIcal, projectConstraint, tasksToIcal, type IcalTask } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { ICAL_MAX_BYTES, safeFetch } from '../../security/safe-fetch.js';
import { eventLocalDayColumns } from '../../prisma/local-day-columns.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { googleConfigured } from '../../integrations/config.js';
import { userGoogleRefreshToken } from '../../integrations/user-google-token.js';
import { exchangeGoogleRefreshToken } from '../../integrations/google-token.js';
import { CalendarZoomService } from './calendar-zoom.service.js';
import { GoogleSyncService, type SubscriptionJson } from './google-sync.service.js';
import { taskRangeWhere } from '../../reading/task-range.js';
import { workFilterFor, type WorkContextMode } from '../../work/work-context.js';

export type CalendarInclude = 'external' | 'tasks' | 'all';

const TASK_RANGE_SELECT = {
  id: true,
  title: true,
  projectId: true,
  startDate: true,
  dueDate: true,
  isAllDay: true,
} as const;

@Injectable()
export class CalendarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(GoogleSyncService) private readonly googleSync: GoogleSyncService,
    @Optional()
    @Inject(CalendarZoomService)
    private readonly zoom: CalendarZoomService | null = null,
  ) {}

  async range(
    user: AuthUser,
    fromIso: string,
    toIso: string,
    subscriptionId?: string,
    context: WorkContextMode = 'all',
    include: CalendarInclude = 'all',
  ) {
    const from = this.instant(fromIso, 'from');
    const to = this.instant(toIso, 'to');
    const tasks = include === 'external' ? [] : await this.tasksInRange(user, from, to, context);
    const external =
      include === 'tasks'
        ? []
        : await this.prisma.externalEvent.findMany({
            where: {
              ownerId: user.id,
              deletedAt: null,
              ...(subscriptionId === undefined ? {} : { subscriptionId }),
              startsAt: { lt: to },
              OR: [{ endsAt: { gte: from } }, { endsAt: null, startsAt: { gte: from } }],
              subscription: { deletedAt: null, visible: true },
            },
            include: {
              subscription: {
                select: { color: true, provider: true, calendarId: true, summary: true },
              },
            },
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
        subscription_id: event.subscriptionId,
        title: event.title,
        starts_at: isoInZone(event.startsAt, event.timeZone),
        ends_at: event.endsAt === null ? null : isoInZone(event.endsAt, event.timeZone),
        is_all_day: event.isAllDay,
        time_zone: event.timeZone,
        color: event.subscription.color,
        provider: event.subscription.provider,
        calendar_id: event.subscription.calendarId,
        summary: event.subscription.summary,
        location: rawText(event.raw, 'location'),
        description: rawText(event.raw, 'description'),
        status:
          event.status === 'tentative' || event.status === 'cancelled' ? event.status : 'confirmed',
        editable: false,
      })),
    };
  }

  private async tasksInRange(user: AuthUser, from: Date, to: Date, context: WorkContextMode) {
    const lists = projectConstraint(user.listIds);
    if (lists.id !== undefined) {
      return [];
    }
    const work = await workFilterFor(this.prisma, user.id, context);
    const range = taskRangeWhere(from, to, 'any');
    return this.prisma.task.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        status: 'active',
        ...(lists.projectId === undefined ? {} : { projectId: lists.projectId }),
        ...(work === null ? {} : { AND: [work] }),
        ...(range ?? {}),
      },
      select: TASK_RANGE_SELECT,
      orderBy: { dueDate: 'asc' },
    });
  }

  summary(
    user: AuthUser,
    raw: {
      readonly from?: string | undefined;
      readonly to?: string | undefined;
      readonly granularity?: string | undefined;
      readonly context?: string | undefined;
      readonly lists?: string | undefined;
      readonly tags?: string | undefined;
      readonly cals?: string | undefined;
      readonly include?: string | undefined;
    },
    ifNoneMatch?: string,
  ) {
    return this.zoomOf().summary(user, raw, ifNoneMatch);
  }

  zoomRange(
    user: AuthUser,
    raw: {
      readonly from?: string | undefined;
      readonly to?: string | undefined;
      readonly fields?: string | undefined;
      readonly include?: string | undefined;
      readonly context?: string | undefined;
      readonly lists?: string | undefined;
      readonly tags?: string | undefined;
      readonly cals?: string | undefined;
      readonly cursor?: string | undefined;
      readonly limit?: string | undefined;
    },
    ifNoneMatch?: string,
  ) {
    return this.zoomOf().range(user, raw, ifNoneMatch);
  }

  private zoomOf(): CalendarZoomService {
    if (this.zoom === null) {
      throw new DomainException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'calendar_zoom_missing',
        'Calendar zoom is not configured',
      );
    }
    return this.zoom;
  }

  listGoogleCalendars(user: AuthUser) {
    return this.googleSync.listRemote(user);
  }

  subscribeGoogle(
    user: AuthUser,
    body: { calendar_id?: string; color?: string },
    keyRaw: string | undefined,
  ) {
    return this.googleSync.subscribe(user, body, keyRaw);
  }

  syncAll(user: AuthUser) {
    return this.googleSync.syncAll(user);
  }

  async subscribe(
    user: AuthUser,
    body: {
      url?: string;
      provider?: string;
      color?: string;
      calendar_id?: string;
      sync_direction?: 'read' | 'two_way';
    },
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
    const preview =
      provider === 'google' || body.url === undefined ? null : await this.fetchIcal(body.url);
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
    if (preview !== null) {
      await this.storeIcal(user, row.id, preview);
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
    const counts =
      rows.length === 0
        ? []
        : await this.prisma.externalEvent.groupBy({
            by: ['subscriptionId'],
            where: {
              ownerId: user.id,
              deletedAt: null,
              subscriptionId: { in: rows.map((row) => row.id) },
            },
            _count: { _all: true },
          });
    const countOf = new Map(counts.map((row) => [row.subscriptionId, row._count._all]));
    return {
      items: rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        url: row.url,
        calendar_id: row.calendarId,
        summary: row.summary,
        sync_direction: row.syncDirection,
        color: row.color,
        visible: row.visible,
        last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
        last_error: row.lastError,
        event_count: countOf.get(row.id) ?? 0,
      })),
      google_configured: googleConfigured(),
    };
  }

  updateSubscription(
    user: AuthUser,
    id: string,
    body: { summary?: string; color?: string | null; visible?: boolean },
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: SubscriptionJson }> {
    return this.googleSync.patch(user, id, body, keyRaw);
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
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.externalEvent.updateMany({
        where: { subscriptionId: id, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.calendarSubscription.update({
        where: { id },
        data: { deletedAt: now },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSubscriptionDeleted,
        entityType: 'calendar_subscription',
        entityId: id,
        action: 'deleted',
        data: asJson({ provider: row.provider, calendar_id: row.calendarId }),
        previous: null,
      });
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
    const token = await this.googleAccessToken(user.id);
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
      const metadata = metadataRecord(task.metadata);
      const existing = typeof metadata.google_event_id === 'string' ? metadata.google_event_id : '';
      const url =
        existing.length === 0
          ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
          : `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existing)}`;
      const response = await fetch(url, {
        method: existing.length === 0 ? 'POST' : 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(googleEventBody(task, due)),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'google_push_failed',
          'Google Calendar rejected an event',
        );
      }
      const created = (await response.json()) as { id?: unknown };
      const eventId =
        typeof created.id === 'string' && created.id.length > 0 ? created.id : existing;
      if (eventId.length > 0 && eventId !== existing) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { metadata: { ...metadata, google_event_id: eventId } },
        });
      }
      pushed += 1;
    }
    return { pushed };
  }

  async refresh(
    user: AuthUser,
    id: string,
  ): Promise<{ imported: number; updated: number; deleted: number; synced_at: string }> {
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
    if (row.provider === 'google' && row.syncDirection !== 'two_way') {
      const stats = await this.googleSync.syncOne(user, row.id);
      return {
        imported: stats.imported,
        updated: stats.updated,
        deleted: stats.deleted,
        synced_at: stats.synced_at,
      };
    }
    if (row.provider === 'google') {
      return this.refreshGoogle(user, row.id);
    }
    if (row.url == null) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Nothing to fetch');
    }
    const text = await this.fetchIcal(row.url);
    return this.storeIcal(user, row.id, text);
  }

  private async storeIcal(
    user: AuthUser,
    subscriptionId: string,
    text: string,
  ): Promise<{ imported: number; updated: number; deleted: number; synced_at: string }> {
    const parsed = parseIcal(text);
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
            ...eventDayColumns(user.timeZone, event),
          },
          update: {
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: event.endsAt === null ? null : new Date(event.endsAt),
            isAllDay: event.isAllDay,
            ...eventDayColumns(user.timeZone, event),
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
          data: { imported: parsed.length },
          previous: null,
        });
      }
    });
    return { imported: parsed.length, updated: 0, deleted: 0, synced_at: new Date().toISOString() };
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
    const base = (process.env.PUBLIC_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
    return { id: row.id, url: `${base}/feeds/${token}.ics` };
  }

  async listFeeds(user: AuthUser): Promise<{
    items: {
      id: string;
      project_id: string | null;
      filter_id: string | null;
      created_at: string;
    }[];
  }> {
    const rows = await this.prisma.calendarFeed.findMany({
      where: { ownerId: user.id, deletedAt: null, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, projectId: true, filterId: true, createdAt: true },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        project_id: row.projectId,
        filter_id: row.filterId,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async rotateFeed(user: AuthUser, id: string): Promise<{ id: string; url: string }> {
    const current = await this.prisma.calendarFeed.findFirst({
      where: { id, ownerId: user.id, deletedAt: null, revokedAt: null },
    });
    if (current === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'feed_not_found', 'Feed was not found');
    }
    const token = randomBytes(24).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarFeed.update({
        where: { id },
        data: { tokenHash: createHash('sha256').update(token).digest('hex') },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarFeedRotated,
        entityType: 'calendar_feed',
        entityId: id,
        action: 'updated',
        data: { feed: { id } },
        previous: null,
      });
    });
    const base = (process.env.PUBLIC_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
    return { id, url: `${base}/feeds/${token}.ics` };
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

  /** RF-2513. iCal subscriptions share the 15 minute cycle. Failures stay on the row. */
  async syncIcalDue(now: Date, catchUp: boolean): Promise<void> {
    const quarter = now.getMinutes() % 15 === 0;
    if (!catchUp && !quarter) {
      return;
    }
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { deletedAt: null, provider: 'ical' },
    });
    for (const row of rows) {
      if (row.retryAfter !== null && row.retryAfter.getTime() > now.getTime()) {
        continue;
      }
      const stale =
        row.lastSyncedAt === null || now.getTime() - row.lastSyncedAt.getTime() >= 15 * 60 * 1000;
      if (catchUp && !quarter && !stale) {
        continue;
      }
      const owner = await this.prisma.user.findUnique({
        where: { id: row.ownerId },
        select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
      });
      if (owner === null || row.url === null) {
        continue;
      }
      const user: AuthUser = {
        id: owner.id,
        email: owner.email,
        timeZone: owner.timeZone,
        completeChildren: owner.taskCompleteChildren,
        scopes: ['calendar:write'],
        tokenId: null,
        sessionId: null,
        listIds: null,
      };
      try {
        await this.refresh(user, row.id);
        await this.prisma.calendarSubscription.update({
          where: { id: row.id },
          data: { lastError: null, syncFailures: 0, retryAfter: null },
        });
      } catch {
        const failures = row.syncFailures + 1;
        await this.prisma.calendarSubscription.update({
          where: { id: row.id },
          data: {
            lastError: 'calendar_fetch_failed',
            syncFailures: failures,
            retryAfter: failures >= 3 ? new Date(now.getTime() + 60 * 60 * 1000) : row.retryAfter,
          },
        });
      }
    }
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
  ): Promise<{ imported: number; updated: number; deleted: number; synced_at: string }> {
    const token = await this.googleAccessToken(user.id);
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
            ...eventDayColumns(user.timeZone, event),
          },
          update: {
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: event.endsAt === null ? null : new Date(event.endsAt),
            isAllDay: event.isAllDay,
            ...eventDayColumns(user.timeZone, event),
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
    return {
      imported: parsed.length,
      updated: 0,
      deleted: 0,
      synced_at: new Date().toISOString(),
    };
  }

  private async googleAccessToken(userId: string): Promise<string> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...GOOGLE_ACCESS_SELECT, email: true },
    });
    const refresh = userGoogleRefreshToken(row);
    if (!googleConfigured() || refresh.length === 0) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Connect Google from settings before reading the calendar',
      );
    }
    try {
      return await exchangeGoogleRefreshToken(refresh);
    } catch (error) {
      if (
        error instanceof DomainException &&
        (error.getResponse() as { code?: string }).code === 'google_reconnect_required'
      ) {
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.user.updateMany({
            where: { id: userId, googleStatus: { not: 'reauth_required' } },
            data: { googleStatus: 'reauth_required' },
          });
          if (changed.count)
            await tx.outboxEvent.create({
              data: {
                ownerId: userId,
                type: DomainEvent.googleReauthRequired,
                actorKind: 'automation',
                actorId: userId,
                data: { google_status: 'reauth_required' },
              },
            });
        });
      }
      throw error;
    }
  }

  private async fetchIcal(url: string): Promise<string> {
    try {
      const response = await safeFetch(url, { maxBytes: ICAL_MAX_BYTES });
      if (response.status < 200 || response.status >= 300) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'calendar_fetch_failed',
          'Calendar URL failed',
        );
      }
      return response.body.toString('utf8');
    } catch (error) {
      if (error instanceof DomainException && error.getStatus() === 400) {
        throw error;
      }
      if (error instanceof DomainException && error.getStatus() === 502) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'calendar_fetch_failed',
          'Calendar URL failed',
        );
      }
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'calendar_fetch_failed',
        'Calendar URL failed',
      );
    }
  }
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return { ...value };
}

function googleEventBody(
  task: { title: string; content: string; isAllDay: boolean; startDate: Date | null },
  due: Date,
): Record<string, unknown> {
  if (task.isAllDay) {
    const date = due.toISOString().slice(0, 10);
    return {
      summary: task.title,
      description: task.content,
      start: { date },
      end: { date: nextDate(date) },
    };
  }
  return {
    summary: task.title,
    description: task.content,
    start: { dateTime: (task.startDate ?? due).toISOString() },
    end: { dateTime: due.toISOString() },
  };
}

function nextDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1));
  return next.toISOString().slice(0, 10);
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

function eventDayColumns(
  profileTimeZone: string,
  event: { startsAt: string; endsAt: string | null; isAllDay: boolean },
) {
  return eventLocalDayColumns({
    start: new Date(event.startsAt),
    end: event.endsAt === null ? null : new Date(event.endsAt),
    timeZone: event.isAllDay ? 'UTC' : profileTimeZone,
    allDay: event.isAllDay,
    profileTimeZone,
  });
}

function isoInZone(value: Date, timeZone: string): string {
  try {
    return formatInTimeZone(value, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  } catch {
    return value.toISOString();
  }
}

function rawText(raw: unknown, key: string): string | null {
  if (typeof raw !== 'object' || raw === null || !(key in raw)) {
    return null;
  }
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
