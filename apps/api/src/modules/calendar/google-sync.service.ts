import { GOOGLE_ACCESS_SELECT, googleServiceAccess } from '../../integrations/google-access.js';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { CalendarSubscription } from '@prisma/client';
import { mapGoogleEvent, type GoogleEventSource } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson } from '../../http/json.js';
import { normalizeIdempotencyKey, requestFingerprint } from '../../idempotency/fingerprint.js';
import { IdempotencyService } from '../../idempotency/idempotency.service.js';
import { googleConfigured } from '../../integrations/config.js';
import {
  GoogleApiError,
  listCalendars,
  listEvents,
  primaryCalendar,
  stopCalendarChannel,
  tokenHasCalendarScope,
  watchCalendarEvents,
  type GoogleCalendarEntry,
} from '../../integrations/google-calendar.js';
import { subscriptionHealth, type CalendarHealth } from './calendar-health.js';
import { userGoogleRefreshToken } from '../../integrations/user-google-token.js';
import { exchangeGoogleRefreshToken } from '../../integrations/google-token.js';
import { bumpCalendarVersion } from './calendar-version.js';
import { eventLocalDayColumns } from '../../prisma/local-day-columns.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';

const WINDOW_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const BACKOFF_MS = 60 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;
const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000;
const MAX_PAGES = 40;
const WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WATCH_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
const WATCH_NOTIFY_GAP_MS = 10_000;
const WATCH_UNAVAILABLE = 'calendar_watch_unavailable';
const WATCH_DUMMY_HASH = createHash('sha256').update('calendar-watch-dummy').digest('hex');
const SCOPE_MESSAGE = 'Vuelve a conectar Google desde Ajustes > Integraciones';
/** Google Calendar v3 instance id: `{master}_{YYYYMMDDTHHmmssZ}` (RF-2562). */
const INSTANCE_UID = /_[0-9]{8}T[0-9]{6}Z$/;

/** Incremental list rejected the stored syncToken. The caller does a full resync (RF-2561). */
class StaleSyncTokenError extends Error {
  constructor(readonly reason: GoogleApiError) {
    super(reason.message);
    this.name = 'StaleSyncTokenError';
  }
}

export interface SyncStats {
  readonly imported: number;
  readonly updated: number;
  readonly deleted: number;
  readonly skipped: number;
  readonly synced_at: string;
}

export interface SyncReport extends SyncStats {
  readonly health: CalendarHealth;
  readonly error: string | null;
  readonly last_error: string | null;
  readonly last_synced_at: string | null;
}

export interface GoogleConnectionSummary {
  readonly status: string;
  readonly connected: boolean;
  readonly account: string | null;
  readonly googleStatus: string | null;
}

export interface SubscriptionJson {
  readonly id: string;
  readonly provider: string | null;
  readonly url: string | null;
  readonly calendar_id: string | null;
  readonly summary: string | null;
  readonly sync_direction: string;
  readonly color: string | null;
  readonly visible: boolean;
  readonly last_synced_at: string | null;
  readonly last_reconciled_at: string | null;
  readonly last_error: string | null;
  readonly health: CalendarHealth;
  readonly event_count: number;
  readonly google_configured?: boolean;
  readonly imported?: number;
}

interface Counts {
  imported: number;
  updated: number;
  deleted: number;
  skipped: number;
}

@Injectable()
export class GoogleSyncService {
  private readonly logger = new Logger(GoogleSyncService.name);
  private readonly lanes = new Map<string, Promise<void>>();
  private readonly notifiedAt = new Map<string, number>();
  private pending: Promise<void> = Promise.resolve();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async listRemote(user: AuthUser): Promise<
    {
      id: string;
      summary: string;
      primary: boolean;
      background_color: string | null;
      access_role: string | null;
      selected_remote: boolean;
      subscription: { id: string; color: string | null; visible: boolean } | null;
    }[]
  > {
    this.requireConfigured();
    const token = await this.accessToken(user.id);
    let entries: GoogleCalendarEntry[];
    try {
      entries = await listCalendars({
        accessToken: token,
        refresh: () => this.accessToken(user.id),
      });
    } catch (error) {
      throw this.asDomain(error);
    }
    const local = await this.prisma.calendarSubscription.findMany({
      where: { ownerId: user.id, deletedAt: null, provider: 'google', syncDirection: 'read' },
    });
    return entries.map((entry) => {
      const match = local.find((row) => row.calendarId === entry.id) ?? null;
      return {
        id: entry.id,
        summary: entry.summary,
        primary: entry.primary,
        background_color: entry.backgroundColor,
        access_role: entry.accessRole,
        selected_remote: entry.selected && !entry.hidden,
        subscription:
          match === null ? null : { id: match.id, color: match.color, visible: match.visible },
      };
    });
  }

  async subscribe(
    user: AuthUser,
    body: { calendar_id?: string; color?: string; summary?: string },
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: SubscriptionJson }> {
    this.requireConfigured();
    const key = normalizeIdempotencyKey(keyRaw);
    const fingerprint = requestFingerprint('POST', '/api/v1/calendar/subscriptions', {
      provider: 'google',
      ...body,
    });
    const hit = await this.idempotency.lookup(user.id, key, fingerprint);
    if (hit !== null) {
      return { statusCode: hit.statusCode, body: hit.body as SubscriptionJson };
    }
    const token = await this.accessToken(user.id);
    await this.assertScope(user.id, token);
    const remote = await this.resolveCalendar(token, user.id, body.calendar_id);
    const existing = await this.prisma.calendarSubscription.findFirst({
      where: {
        ownerId: user.id,
        deletedAt: null,
        provider: 'google',
        syncDirection: 'read',
        calendarId: remote.id,
      },
    });
    if (existing !== null) {
      if (existing.lastSyncedAt === null) {
        await this.syncRow(user, existing, true);
      }
      const bodyJson = await this.toJson(await this.reload(existing.id), 0);
      await this.remember(user, key, fingerprint, 201, bodyJson);
      return { statusCode: 201, body: bodyJson };
    }
    const color = body.color ?? remote.backgroundColor;
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarSubscription.create({
        data: {
          ownerId: user.id,
          provider: 'google',
          calendarId: remote.id,
          summary: body.summary ?? remote.summary,
          color,
          visible: true,
          syncDirection: 'read',
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSubscriptionCreated,
        entityType: 'calendar_subscription',
        entityId: row.id,
        action: 'created',
        data: asJson({ provider: 'google', calendar_id: remote.id }),
        previous: null,
      });
      return row;
    });
    const stats = await this.syncRow(user, created, false);
    const bodyJson = await this.toJson(await this.reload(created.id), stats.imported);
    await this.remember(user, key, fingerprint, 201, bodyJson);
    return { statusCode: 201, body: bodyJson };
  }

  async patch(
    user: AuthUser,
    id: string,
    body: { summary?: string; color?: string | null; visible?: boolean },
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: SubscriptionJson }> {
    const key = normalizeIdempotencyKey(keyRaw);
    const fingerprint = requestFingerprint('PATCH', `/api/v1/calendar/subscriptions/${id}`, body);
    const hit = await this.idempotency.lookup(user.id, key, fingerprint);
    if (hit !== null) {
      return { statusCode: hit.statusCode, body: hit.body as SubscriptionJson };
    }
    const row = await this.owned(user.id, id);
    if (body.color !== undefined && body.color !== null && !/^#[0-9A-Fa-f]{6}$/.test(body.color)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'color must be #RRGGBB',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.calendarSubscription.update({
        where: { id: row.id },
        data: {
          ...(body.summary === undefined ? {} : { summary: body.summary }),
          ...(body.color === undefined ? {} : { color: body.color }),
          ...(body.visible === undefined ? {} : { visible: body.visible }),
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSubscriptionUpdated,
        entityType: 'calendar_subscription',
        entityId: row.id,
        action: 'updated',
        data: asJson(body),
        previous: null,
      });
      return next;
    });
    const bodyJson = await this.toJson(updated);
    await this.remember(user, key, fingerprint, 200, bodyJson);
    return { statusCode: 200, body: bodyJson };
  }

  async syncOne(user: AuthUser, id: string): Promise<SyncStats> {
    const row = await this.owned(user.id, id);
    if (row.provider === 'google') {
      return this.lane(row.id, () => this.syncRow(user, row, true));
    }
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Nothing to fetch');
  }

  async syncAll(user: AuthUser): Promise<{
    google: { status: string; connected: boolean };
    subscriptions: ({ id: string } & SyncReport)[];
  }> {
    const google = await this.googleAccount(user.id);
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { ownerId: user.id, deletedAt: null, provider: { in: ['google', 'ical'] } },
    });
    const subscriptions = [];
    for (const row of rows) {
      if (row.provider !== 'google') {
        subscriptions.push(
          this.syncBody(row, emptyCounts(), null, new Date().toISOString(), google),
        );
        continue;
      }
      try {
        const stats = await this.lane(row.id, () => this.syncRow(user, row, true));
        const fresh = await this.reload(row.id);
        subscriptions.push(this.syncBody(fresh, stats, null, stats.synced_at, google));
      } catch (error) {
        const fresh = await this.reload(row.id).catch(() => row);
        const code =
          error instanceof DomainException ? this.codeOf(error) : 'calendar_fetch_failed';
        subscriptions.push(
          this.syncBody(
            fresh,
            emptyCounts(),
            code,
            fresh.lastSyncedAt?.toISOString() ?? new Date().toISOString(),
            google,
          ),
        );
      }
    }
    return {
      google: { status: google.status, connected: google.connected },
      subscriptions,
    };
  }

  /** RF-2513. One failing subscription does not stop the others. Google polls every 5 minutes (RF-2565). */
  async syncDue(now: Date, catchUp: boolean): Promise<void> {
    const due = now.getMinutes() % 5 === 0;
    if (!catchUp && !due) {
      return;
    }
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { deletedAt: null, provider: { in: ['google', 'ical'] } },
    });
    for (const row of rows) {
      if (row.retryAfter !== null && row.retryAfter.getTime() > now.getTime()) {
        continue;
      }
      const stale =
        row.lastSyncedAt === null || now.getTime() - row.lastSyncedAt.getTime() >= STALE_MS;
      if (catchUp && !due && !stale) {
        continue;
      }
      if (row.provider !== 'google' || row.syncDirection !== 'read') {
        continue;
      }
      const user = await this.actor(row.ownerId);
      if (user === null) {
        continue;
      }
      try {
        await this.lane(row.id, () => this.syncRow(user, row, false));
      } catch (error) {
        const code =
          error instanceof DomainException ? this.codeOf(error) : 'calendar_fetch_failed';
        this.logger.warn(`calendar sync failed ${code}`);
      }
    }
  }

  private async syncRow(
    user: AuthUser,
    row: CalendarSubscription,
    manual: boolean,
    allowResync = true,
  ): Promise<SyncStats> {
    if (!googleConfigured()) {
      await this.fail(user, row, 'google_not_configured');
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Connect Google from settings before reading the calendar',
      );
    }
    let calendarId = row.calendarId;
    try {
      const token = await this.accessToken(user.id);
      if (calendarId === null || calendarId.length === 0) {
        const remote = await this.resolveCalendar(token, user.id, undefined);
        calendarId = remote.id;
        await this.prisma.calendarSubscription.update({
          where: { id: row.id },
          data: {
            calendarId,
            summary: row.summary ?? remote.summary,
            color: row.color ?? remote.backgroundColor,
          },
        });
      }
      const zone = user.timeZone.length > 0 ? user.timeZone : 'Europe/Madrid';
      const current = await this.reload(row.id);
      const ahead = new Date(nowWindow());
      ahead.setMonth(ahead.getMonth() + 12);
      const repeatWatchGap = row.lastError === WATCH_UNAVAILABLE;
      const stats =
        current.syncToken === null || current.syncToken.length === 0
          ? await this.initial(user, current, token, calendarId, zone, ahead)
          : await this.incremental(user, current, token, calendarId, zone, manual);
      try {
        await this.ensureWatch(user, await this.reload(row.id), repeatWatchGap);
      } catch (watchError) {
        this.logger.warn(
          `calendar watch setup failed ${watchError instanceof Error ? watchError.name : 'error'}`,
        );
      }
      return stats;
    } catch (error) {
      const google = error instanceof StaleSyncTokenError ? error.reason : error;
      if (
        google instanceof GoogleApiError &&
        (google.status === 410 ||
          (error instanceof StaleSyncTokenError && google.status === 400)) &&
        allowResync &&
        calendarId !== null
      ) {
        return this.resync(user, row, calendarId);
      }
      if (
        google instanceof GoogleApiError &&
        google.status === 403 &&
        google.reason === 'insufficientPermissions'
      ) {
        const token = await this.accessToken(user.id).catch(() => '');
        if (token.length > 0 && !(await tokenHasCalendarScope(token).catch(() => false))) {
          await this.fail(user, await this.reload(row.id), 'google_scope_missing');
          throw new DomainException(HttpStatus.CONFLICT, 'google_scope_missing', SCOPE_MESSAGE);
        }
      }
      const code = this.failureCode(google);
      await this.fail(user, await this.reload(row.id), code);
      if (!manual) {
        this.logger.warn(`calendar sync failed ${code}`);
      }
      throw this.asDomain(google);
    }
  }

  private async initial(
    user: AuthUser,
    row: CalendarSubscription,
    token: string,
    calendarId: string,
    zone: string,
    timeMax: Date,
  ): Promise<SyncStats> {
    const now = new Date();
    const counts = emptyCounts();
    let pageToken: string | undefined;
    let syncToken: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await listEvents(
        calendarId,
        {
          timeMin: new Date(now.getTime() - WINDOW_PAST_MS).toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone: zone,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          ...(pageToken === undefined ? {} : { pageToken }),
        },
        { accessToken: token, refresh: () => this.accessToken(user.id) },
      );
      await this.applyPage(user, row, result.items, zone, counts);
      if (result.nextSyncToken !== null) {
        syncToken = result.nextSyncToken;
      }
      if (result.nextPageToken === null) {
        break;
      }
      pageToken = result.nextPageToken;
    }
    const reconciledAt = await this.reconcileWindow(user, row, token, calendarId, zone, counts);
    const syncedAt = new Date();
    await this.finish(user, row, counts, syncToken, syncedAt, reconciledAt);
    return { ...counts, synced_at: syncedAt.toISOString() };
  }

  private async incremental(
    user: AuthUser,
    row: CalendarSubscription,
    token: string,
    calendarId: string,
    zone: string,
    manual: boolean,
  ): Promise<SyncStats> {
    const counts = emptyCounts();
    let pageToken: string | undefined;
    const requestToken = row.syncToken;
    let syncToken = row.syncToken;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let result: Awaited<ReturnType<typeof listEvents>>;
      try {
        result = await listEvents(
          calendarId,
          {
            ...(requestToken === null || requestToken.length === 0
              ? {}
              : { syncToken: requestToken }),
            ...(pageToken === undefined ? {} : { pageToken }),
            singleEvents: true,
            showDeleted: true,
            maxResults: 2500,
          },
          { accessToken: token, refresh: () => this.accessToken(user.id) },
        );
      } catch (error) {
        if (error instanceof GoogleApiError && (error.status === 410 || error.status === 400)) {
          throw new StaleSyncTokenError(error);
        }
        throw error;
      }
      await this.applyPage(user, row, result.items, zone, counts);
      if (result.nextSyncToken !== null) {
        syncToken = result.nextSyncToken;
      }
      if (result.nextPageToken === null) {
        break;
      }
      pageToken = result.nextPageToken;
    }
    const reconciledAt = this.shouldReconcile(row, counts, manual)
      ? await this.reconcileWindow(user, row, token, calendarId, zone, counts)
      : null;
    const syncedAt = new Date();
    await this.finish(user, row, counts, syncToken, syncedAt, reconciledAt);
    return { ...counts, synced_at: syncedAt.toISOString() };
  }

  private async resync(
    user: AuthUser,
    row: CalendarSubscription,
    calendarId: string,
  ): Promise<SyncStats> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.externalEvent.updateMany({
        where: { subscriptionId: row.id, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.calendarSubscription.update({
        where: { id: row.id },
        data: { syncToken: null },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSubscriptionResynced,
        entityType: 'calendar_subscription',
        entityId: row.id,
        action: 'updated',
        data: asJson({ provider: 'google', calendar_id: calendarId }),
        previous: null,
      });
    });
    const fresh = await this.reload(row.id);
    return this.syncRow(user, fresh, true, false);
  }

  private async applyPage(
    user: AuthUser,
    row: CalendarSubscription,
    items: readonly unknown[],
    zone: string,
    counts: Counts,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = { ...counts };
      for (const item of items) {
        const source = item as GoogleEventSource;
        const mapped = mapGoogleEvent(source, zone);
        if (mapped === null) {
          counts.skipped += 1;
          continue;
        }
        if (mapped.status === 'cancelled') {
          const removed = await tx.externalEvent.updateMany({
            where: { subscriptionId: row.id, externalUid: mapped.uid, deletedAt: null },
            data: { deletedAt: new Date(), status: 'cancelled' },
          });
          counts.deleted += removed.count;
          if (!INSTANCE_UID.test(mapped.uid)) {
            const instances = await tx.externalEvent.updateMany({
              where: {
                subscriptionId: row.id,
                deletedAt: null,
                externalUid: { startsWith: `${mapped.uid}_` },
              },
              data: { deletedAt: new Date(), status: 'cancelled' },
            });
            counts.deleted += instances.count;
          }
          continue;
        }
        const existing = await tx.externalEvent.findUnique({
          where: {
            subscriptionId_externalUid: { subscriptionId: row.id, externalUid: mapped.uid },
          },
        });
        const startsAt = new Date(mapped.startsAt);
        const endsAt = new Date(mapped.endsAt);
        const data = {
          title: mapped.title,
          startsAt,
          endsAt,
          isAllDay: mapped.isAllDay,
          timeZone: mapped.timeZone,
          status: mapped.status,
          raw: asJson(item),
          location: googleText(item, 'location'),
          description: googleText(item, 'description'),
          ...eventLocalDayColumns({
            start: startsAt,
            end: endsAt,
            timeZone: mapped.timeZone,
            allDay: mapped.isAllDay,
            profileTimeZone: zone,
          }),
          deletedAt: null,
        };
        if (existing === null) {
          await tx.externalEvent.create({
            data: { ownerId: user.id, subscriptionId: row.id, externalUid: mapped.uid, ...data },
          });
          counts.imported += 1;
        } else {
          await tx.externalEvent.update({ where: { id: existing.id }, data });
          counts.updated += 1;
        }
      }
      if (
        counts.imported !== before.imported ||
        counts.updated !== before.updated ||
        counts.deleted !== before.deleted
      ) {
        await bumpCalendarVersion(tx, user.id);
      }
    });
  }

  /** RF-2560. Current singleEvents photo of the sync window, then drop local rows it does not list. */
  private async reconcileWindow(
    user: AuthUser,
    row: CalendarSubscription,
    token: string,
    calendarId: string,
    zone: string,
    counts: Counts,
  ): Promise<Date> {
    const now = new Date();
    const timeMin = new Date(now.getTime() - WINDOW_PAST_MS);
    const timeMax = new Date(now);
    timeMax.setMonth(timeMax.getMonth() + 12);
    const live = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await listEvents(
        calendarId,
        {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone: zone,
          singleEvents: true,
          showDeleted: true,
          maxResults: 2500,
          ...(pageToken === undefined ? {} : { pageToken }),
        },
        { accessToken: token, refresh: () => this.accessToken(user.id) },
      );
      await this.applyPage(user, row, result.items, zone, counts);
      for (const item of result.items) {
        const mapped = mapGoogleEvent(item as GoogleEventSource, zone);
        if (mapped !== null && mapped.status !== 'cancelled') {
          live.add(mapped.uid);
        }
      }
      if (result.nextPageToken === null) {
        break;
      }
      pageToken = result.nextPageToken;
    }
    const locals = await this.prisma.externalEvent.findMany({
      where: {
        subscriptionId: row.id,
        deletedAt: null,
        startsAt: { gte: timeMin, lt: timeMax },
      },
      select: { id: true, externalUid: true },
    });
    const orphanIds = locals
      .filter((event) => !live.has(event.externalUid))
      .map((event) => event.id);
    if (orphanIds.length > 0) {
      const removed = await this.prisma.externalEvent.updateMany({
        where: { id: { in: orphanIds }, subscriptionId: row.id, deletedAt: null },
        data: { deletedAt: now, status: 'cancelled' },
      });
      counts.deleted += removed.count;
    }
    return now;
  }

  private shouldReconcile(row: CalendarSubscription, counts: Counts, manual: boolean): boolean {
    if (manual) {
      return true;
    }
    const activity = counts.imported + counts.updated + counts.deleted + counts.skipped;
    if (activity > 0 || row.lastReconciledAt === null) {
      return true;
    }
    return Date.now() - row.lastReconciledAt.getTime() >= RECONCILE_EVERY_MS;
  }

  private async finish(
    user: AuthUser,
    row: CalendarSubscription,
    counts: Counts,
    syncToken: string | null,
    syncedAt: Date,
    reconciledAt: Date | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarSubscription.update({
        where: { id: row.id },
        data: {
          syncToken,
          lastSyncedAt: syncedAt,
          lastError: null,
          syncFailures: 0,
          retryAfter: null,
          ...(reconciledAt === null ? {} : { lastReconciledAt: reconciledAt }),
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSynced,
        entityType: 'calendar_subscription',
        entityId: row.id,
        action: 'updated',
        data: asJson({
          imported: counts.imported,
          updated: counts.updated,
          deleted: counts.deleted,
          provider: 'google',
          calendar_id: row.calendarId,
        }),
        previous: null,
      });
    });
  }

  private async fail(user: AuthUser, row: CalendarSubscription, code: string): Promise<void> {
    const failures = row.syncFailures + 1;
    const retryAfter = failures >= 3 ? new Date(Date.now() + BACKOFF_MS) : row.retryAfter;
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarSubscription.update({
        where: { id: row.id },
        data: {
          lastError: code.slice(0, 180),
          syncFailures: failures,
          retryAfter,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarSyncFailed,
        entityType: 'calendar_subscription',
        entityId: row.id,
        action: 'updated',
        data: asJson({
          reason: code.slice(0, 180),
          provider: row.provider,
          calendar_id: row.calendarId,
        }),
        previous: null,
      });
    });
  }

  private async resolveCalendar(
    token: string,
    userId: string,
    calendarId: string | undefined,
  ): Promise<GoogleCalendarEntry> {
    let entries: GoogleCalendarEntry[];
    try {
      entries = await listCalendars({
        accessToken: token,
        refresh: () => this.accessToken(userId),
      });
    } catch (error) {
      throw this.asDomain(error);
    }
    if (calendarId !== undefined && calendarId.length > 0) {
      const match = entries.find((entry) => entry.id === calendarId);
      if (match !== undefined) {
        return match;
      }
      return {
        id: calendarId,
        summary: calendarId,
        primary: false,
        backgroundColor: null,
        accessRole: null,
        selected: true,
        hidden: false,
      };
    }
    const primary = primaryCalendar(entries);
    if (primary === null) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'calendar_fetch_failed',
        'Google Calendar refused the read',
      );
    }
    return primary;
  }

  private async assertScope(ownerId: string, token: string): Promise<void> {
    const prior = await this.prisma.calendarSubscription.count({
      where: { ownerId, provider: 'google', syncDirection: 'read', deletedAt: null },
    });
    if (prior > 0) {
      return;
    }
    let granted = false;
    try {
      granted = await tokenHasCalendarScope(token);
    } catch (error) {
      throw this.asDomain(error);
    }
    if (!granted) {
      throw new DomainException(HttpStatus.CONFLICT, 'google_scope_missing', SCOPE_MESSAGE);
    }
  }

  private async accessToken(userId: string): Promise<string> {
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

  private requireConfigured(): void {
    if (!googleConfigured()) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Google Calendar needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      );
    }
  }

  private async owned(ownerId: string, id: string): Promise<CalendarSubscription> {
    const row = await this.prisma.calendarSubscription.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'subscription_not_found',
        'Subscription was not found',
      );
    }
    return row;
  }

  private async reload(id: string): Promise<CalendarSubscription> {
    const row = await this.prisma.calendarSubscription.findUnique({ where: { id } });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'subscription_not_found',
        'Subscription was not found',
      );
    }
    return row;
  }

  private async actor(ownerId: string): Promise<AuthUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      timeZone: row.timeZone,
      completeChildren: row.taskCompleteChildren,
      scopes: ['calendar:read', 'calendar:write'],
      tokenId: null,
      sessionId: null,
      listIds: null,
    };
  }

  async toJson(row: CalendarSubscription, imported?: number): Promise<SubscriptionJson> {
    const eventCount = await this.prisma.externalEvent.count({
      where: { subscriptionId: row.id, deletedAt: null },
    });
    const google = await this.googleAccount(row.ownerId);
    return {
      id: row.id,
      provider: row.provider,
      url: row.url,
      calendar_id: row.calendarId,
      summary: row.summary,
      sync_direction: row.syncDirection,
      color: row.color,
      visible: row.visible,
      last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
      last_reconciled_at: row.lastReconciledAt?.toISOString() ?? null,
      last_error: row.lastError,
      health: subscriptionHealth({
        provider: row.provider,
        lastError: row.lastError,
        googleStatus: google.googleStatus,
      }),
      event_count: eventCount,
      google_configured: googleConfigured(),
      ...(imported === undefined ? {} : { imported }),
    };
  }

  async googleAccount(userId: string): Promise<GoogleConnectionSummary> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...GOOGLE_ACCESS_SELECT, googleAccountEmail: true },
    });
    const access = googleServiceAccess(row, 'calendar');
    return {
      status: access.status,
      connected: access.connected,
      account: row?.googleAccountEmail ?? null,
      googleStatus: row?.googleStatus ?? null,
    };
  }

  /** Verifies a push and schedules one incremental. The HTTP handler must not wait for Google (RF-2566). */
  async ingestNotification(input: {
    readonly channelId: string;
    readonly token: string;
    readonly resourceId: string;
    readonly state: string;
  }): Promise<boolean> {
    const row = await this.verifiedChannel(input.channelId, input.resourceId, input.token);
    if (row === null) {
      return false;
    }
    if (input.state !== 'exists' && input.state !== 'not_exists') {
      return true;
    }
    const now = Date.now();
    const last = this.notifiedAt.get(row.id) ?? 0;
    if (now - last < WATCH_NOTIFY_GAP_MS) {
      return true;
    }
    this.notifiedAt.set(row.id, now);
    setImmediate(() => {
      const work = this.lane(row.id, () => this.syncNotified(row)).then(
        () => undefined,
        (error: unknown) => {
          const code =
            error instanceof DomainException ? this.codeOf(error) : 'calendar_fetch_failed';
          this.logger.warn(`calendar watch sync failed ${code}`);
        },
      );
      this.track(work);
    });
    return true;
  }

  /** Test hook: resolves when notification work queued so far has settled. */
  async whenIdle(): Promise<void> {
    await this.pending;
  }

  /** Stops the remote channel. A missing or already-dead channel is not an error (RF-2566). */
  async releaseWatch(user: AuthUser, row: CalendarSubscription): Promise<void> {
    const channelId = row.watchChannelId;
    const resourceId = row.watchResourceId;
    if (channelId === null || resourceId === null || !googleConfigured()) {
      return;
    }
    try {
      const token = await this.accessToken(user.id);
      await stopCalendarChannel(channelId, resourceId, {
        accessToken: token,
        refresh: () => this.accessToken(user.id),
      });
    } catch (error) {
      this.logger.warn(
        `calendar watch stop failed ${error instanceof GoogleApiError ? String(error.status) : 'error'}`,
      );
    }
  }

  async releaseOwnerWatches(user: AuthUser): Promise<void> {
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { ownerId: user.id, deletedAt: null, provider: 'google' },
    });
    for (const row of rows) {
      if (row.watchChannelId === null) {
        continue;
      }
      await this.releaseWatch(user, row);
      await this.prisma.$transaction(async (tx) => {
        await tx.calendarSubscription.update({
          where: { id: row.id },
          data: {
            watchChannelId: null,
            watchResourceId: null,
            watchTokenHash: null,
            watchExpiresAt: null,
          },
        });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.calendarWatchStopped,
          entityType: 'calendar_subscription',
          entityId: row.id,
          action: 'updated',
          data: asJson({
            provider: 'google',
            calendar_id: row.calendarId,
            channel_id: row.watchChannelId,
          }),
          previous: null,
        });
      });
    }
  }

  /** Creates or replaces channels that are missing or inside the 24 hour renewal window (RF-2566). */
  async renewWatches(now: Date): Promise<void> {
    const horizon = new Date(now.getTime() + WATCH_RENEW_BEFORE_MS);
    const rows = await this.prisma.calendarSubscription.findMany({
      where: {
        deletedAt: null,
        provider: 'google',
        syncDirection: 'read',
        OR: [
          { watchChannelId: null },
          { watchExpiresAt: null },
          { watchExpiresAt: { lt: horizon } },
        ],
      },
    });
    for (const row of rows) {
      if (row.watchChannelId === null && watchAddress() === null) {
        continue;
      }
      const user = await this.actor(row.ownerId);
      if (user === null) {
        continue;
      }
      try {
        await this.lane(row.id, () =>
          this.ensureWatch(user, row, row.lastError === WATCH_UNAVAILABLE),
        );
      } catch (error) {
        this.logger.warn(
          `calendar watch renew failed ${error instanceof Error ? error.name : 'error'}`,
        );
      }
    }
  }

  private async remember(
    user: AuthUser,
    key: string | undefined,
    fingerprint: string,
    statusCode: number,
    body: SubscriptionJson,
  ): Promise<void> {
    if (key === undefined) {
      return;
    }
    await this.prisma.$transaction(async (tx: Tx) => {
      await this.idempotency.store(tx, {
        ownerId: user.id,
        key,
        fingerprint,
        statusCode,
        body: asJson(body),
      });
    });
  }

  private asDomain(error: unknown): DomainException {
    if (error instanceof DomainException) {
      return error;
    }
    if (
      error instanceof GoogleApiError &&
      error.status === 403 &&
      error.reason === 'insufficientPermissions'
    ) {
      return new DomainException(HttpStatus.CONFLICT, 'google_scope_missing', SCOPE_MESSAGE);
    }
    if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) {
      return new DomainException(HttpStatus.BAD_GATEWAY, 'calendar_fetch_failed', error.message);
    }
    return new DomainException(
      HttpStatus.BAD_GATEWAY,
      'calendar_fetch_failed',
      'Google Calendar refused the read',
    );
  }

  private failureCode(error: unknown): string {
    if (error instanceof DomainException) {
      return this.codeOf(error);
    }
    if (error instanceof GoogleApiError) {
      return error.message.slice(0, 180);
    }
    return 'calendar_fetch_failed';
  }

  private codeOf(error: DomainException): string {
    const body: unknown = error.getResponse();
    if (typeof body !== 'object' || body === null || !('code' in body)) {
      return 'calendar_fetch_failed';
    }
    const code = body.code;
    return typeof code === 'string' ? code : 'calendar_fetch_failed';
  }

  private syncBody(
    row: CalendarSubscription,
    counts: Counts,
    error: string | null,
    syncedAt: string,
    google: GoogleConnectionSummary,
  ): { id: string } & SyncReport {
    return {
      id: row.id,
      imported: counts.imported,
      updated: counts.updated,
      deleted: counts.deleted,
      skipped: counts.skipped,
      synced_at: syncedAt,
      health: subscriptionHealth({
        provider: row.provider,
        lastError: row.lastError ?? error,
        googleStatus: google.googleStatus,
      }),
      error,
      last_error: row.lastError ?? error,
      last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
    };
  }

  private async lane<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.lanes.get(id) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.lanes.set(id, tail);
    await previous.catch(() => undefined);
    try {
      return await work();
    } finally {
      release();
      void tail.then(() => {
        if (this.lanes.get(id) === tail) {
          this.lanes.delete(id);
        }
      });
    }
  }

  private track(work: Promise<unknown>): void {
    this.pending = this.pending
      .then(() => work)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  private async syncNotified(row: CalendarSubscription): Promise<void> {
    const user = await this.actor(row.ownerId);
    if (user === null) {
      return;
    }
    const fresh = await this.reload(row.id);
    if (fresh.deletedAt !== null || fresh.provider !== 'google') {
      return;
    }
    await this.syncRow(user, fresh, false);
  }

  private async verifiedChannel(
    channelId: string,
    resourceId: string,
    token: string,
  ): Promise<CalendarSubscription | null> {
    const row =
      channelId.length === 0
        ? null
        : await this.prisma.calendarSubscription.findFirst({
            where: { watchChannelId: channelId, deletedAt: null },
          });
    const stored = row?.watchTokenHash ?? WATCH_DUMMY_HASH;
    const presented = hashWatchToken(token);
    const tokenOk = sameSecret(stored, presented);
    const resourceOk = row !== null && row.watchResourceId === resourceId && resourceId.length > 0;
    const fresh =
      row?.watchExpiresAt !== null &&
      row?.watchExpiresAt !== undefined &&
      row.watchExpiresAt.getTime() > Date.now();
    if (row === null || !tokenOk || !resourceOk || !fresh) {
      return null;
    }
    return row;
  }

  private async ensureWatch(
    user: AuthUser,
    row: CalendarSubscription,
    repeatUnavailable: boolean,
  ): Promise<void> {
    if (row.provider !== 'google' || row.syncDirection !== 'read' || row.deletedAt !== null) {
      return;
    }
    const expiresAt = row.watchExpiresAt;
    const current =
      row.watchChannelId !== null &&
      row.watchResourceId !== null &&
      expiresAt !== null &&
      expiresAt.getTime() - Date.now() >= WATCH_RENEW_BEFORE_MS;
    if (current) {
      return;
    }
    const address = watchAddress();
    if (address === null) {
      await this.noteWatchUnavailable(user, row, repeatUnavailable);
      return;
    }
    const calendarId = row.calendarId;
    if (calendarId === null || calendarId.length === 0) {
      return;
    }
    const previousId = row.watchChannelId;
    const previousResource = row.watchResourceId;
    const channelId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const token = await this.accessToken(user.id);
    const channel = await watchCalendarEvents(
      calendarId,
      {
        id: channelId,
        address,
        token: secret,
        expiration: Date.now() + WATCH_TTL_MS,
      },
      { accessToken: token, refresh: () => this.accessToken(user.id) },
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarSubscription.update({
        where: { id: row.id },
        data: {
          watchChannelId: channel.id,
          watchResourceId: channel.resourceId,
          watchTokenHash: hashWatchToken(secret),
          watchExpiresAt: channel.expiration,
          ...(row.lastError === WATCH_UNAVAILABLE ? { lastError: null } : {}),
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.calendarWatchStarted,
        entityType: 'calendar_subscription',
        entityId: row.id,
        action: 'updated',
        data: asJson({
          provider: 'google',
          calendar_id: calendarId,
          channel_id: channel.id,
          expires_at: channel.expiration.toISOString(),
        }),
        previous: null,
      });
    });
    if (
      previousId !== null &&
      previousResource !== null &&
      (previousId !== channel.id || previousResource !== channel.resourceId)
    ) {
      await this.releaseWatch(user, {
        ...row,
        watchChannelId: previousId,
        watchResourceId: previousResource,
      });
      await this.prisma.$transaction(async (tx) => {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.calendarWatchStopped,
          entityType: 'calendar_subscription',
          entityId: row.id,
          action: 'updated',
          data: asJson({ provider: 'google', calendar_id: calendarId, channel_id: previousId }),
          previous: null,
        });
      });
    }
  }

  private async noteWatchUnavailable(
    user: AuthUser,
    row: CalendarSubscription,
    repeat: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarSubscription.update({
        where: { id: row.id },
        data: { lastError: WATCH_UNAVAILABLE },
      });
      if (!repeat) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.calendarWatchUnavailable,
          entityType: 'calendar_subscription',
          entityId: row.id,
          action: 'updated',
          data: asJson({ provider: 'google', calendar_id: row.calendarId, reason: 'public_url' }),
          previous: null,
        });
      }
    });
  }
}

function hashWatchToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function watchAddress(): string | null {
  const configured = process.env.PUBLIC_URL?.trim() ?? '';
  if (!configured.startsWith('https://')) {
    return null;
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.hostname.length === 0) {
      return null;
    }
    return `${url.origin}/api/v1/integrations/google/calendar/notifications`;
  } catch {
    return null;
  }
}

function emptyCounts(): Counts {
  return { imported: 0, updated: 0, deleted: 0, skipped: 0 };
}

function nowWindow(): Date {
  return new Date();
}

function googleText(item: unknown, key: 'location' | 'description'): string | null {
  if (typeof item !== 'object' || item === null || !(key in item)) {
    return null;
  }
  const value = (item as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
