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
  tokenHasCalendarScope,
  type GoogleCalendarEntry,
} from '../../integrations/google-calendar.js';
import { userGoogleRefreshToken } from '../../integrations/user-google-token.js';
import { exchangeGoogleRefreshToken } from '../../integrations/google-token.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';

const WINDOW_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const BACKOFF_MS = 60 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const MAX_PAGES = 40;
const SCOPE_MESSAGE = 'Vuelve a conectar Google desde Ajustes > Integraciones';

export interface SyncStats {
  readonly imported: number;
  readonly updated: number;
  readonly deleted: number;
  readonly skipped: number;
  readonly synced_at: string;
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
  readonly last_error: string | null;
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
      return this.syncRow(user, row, true);
    }
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Nothing to fetch');
  }

  async syncAll(user: AuthUser): Promise<{
    subscriptions: {
      id: string;
      imported: number;
      updated: number;
      deleted: number;
      error: string | null;
    }[];
  }> {
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { ownerId: user.id, deletedAt: null, provider: { in: ['google', 'ical'] } },
    });
    const subscriptions = [];
    for (const row of rows) {
      if (row.provider !== 'google') {
        subscriptions.push({ id: row.id, imported: 0, updated: 0, deleted: 0, error: null });
        continue;
      }
      try {
        const stats = await this.syncRow(user, row, true);
        subscriptions.push({
          id: row.id,
          imported: stats.imported,
          updated: stats.updated,
          deleted: stats.deleted,
          error: null,
        });
      } catch (error) {
        subscriptions.push({
          id: row.id,
          imported: 0,
          updated: 0,
          deleted: 0,
          error: error instanceof DomainException ? error.message : 'calendar_fetch_failed',
        });
      }
    }
    return { subscriptions };
  }

  /** RF-2513. One failing subscription does not stop the others. */
  async syncDue(now: Date, catchUp: boolean): Promise<void> {
    const quarter = now.getMinutes() % 15 === 0;
    if (!catchUp && !quarter) {
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
      if (catchUp && !quarter && !stale) {
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
        await this.syncRow(user, row, false);
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
      const stats =
        current.syncToken === null || current.syncToken.length === 0
          ? await this.initial(user, current, token, calendarId, zone, ahead)
          : await this.incremental(user, current, token, calendarId, zone);
      return stats;
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        error.status === 410 &&
        allowResync &&
        calendarId !== null
      ) {
        return this.resync(user, row, calendarId);
      }
      if (
        error instanceof GoogleApiError &&
        error.status === 403 &&
        error.reason === 'insufficientPermissions'
      ) {
        const token = await this.accessToken(user.id).catch(() => '');
        if (token.length > 0 && !(await tokenHasCalendarScope(token).catch(() => false))) {
          await this.fail(user, await this.reload(row.id), 'google_scope_missing');
          throw new DomainException(HttpStatus.CONFLICT, 'google_scope_missing', SCOPE_MESSAGE);
        }
      }
      const code = this.failureCode(error);
      await this.fail(user, await this.reload(row.id), code);
      if (!manual) {
        this.logger.warn(`calendar sync failed ${code}`);
      }
      throw this.asDomain(error);
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
    const syncedAt = new Date();
    await this.finish(user, row, counts, syncToken, syncedAt);
    return { ...counts, synced_at: syncedAt.toISOString() };
  }

  private async incremental(
    user: AuthUser,
    row: CalendarSubscription,
    token: string,
    calendarId: string,
    zone: string,
  ): Promise<SyncStats> {
    const counts = emptyCounts();
    let pageToken: string | undefined;
    let syncToken = row.syncToken;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await listEvents(
        calendarId,
        {
          ...(pageToken === undefined
            ? { ...(syncToken === null ? {} : { syncToken }) }
            : { pageToken }),
          maxResults: 2500,
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
    const syncedAt = new Date();
    await this.finish(user, row, counts, syncToken, syncedAt);
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
          continue;
        }
        const existing = await tx.externalEvent.findUnique({
          where: {
            subscriptionId_externalUid: { subscriptionId: row.id, externalUid: mapped.uid },
          },
        });
        const data = {
          title: mapped.title,
          startsAt: new Date(mapped.startsAt),
          endsAt: new Date(mapped.endsAt),
          isAllDay: mapped.isAllDay,
          timeZone: mapped.timeZone,
          status: mapped.status,
          raw: asJson(item),
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
    });
  }

  private async finish(
    user: AuthUser,
    row: CalendarSubscription,
    counts: Counts,
    syncToken: string | null,
    syncedAt: Date,
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
      select: { googleRefreshToken: true, email: true },
    });
    const refresh = userGoogleRefreshToken(row);
    if (!googleConfigured() || refresh.length === 0) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Connect Google from settings before reading the calendar',
      );
    }
    return exchangeGoogleRefreshToken(refresh);
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
      last_error: row.lastError,
      event_count: eventCount,
      google_configured: googleConfigured(),
      ...(imported === undefined ? {} : { imported }),
    };
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
}

function emptyCounts(): Counts {
  return { imported: 0, updated: 0, deleted: 0, skipped: 0 };
}

function nowWindow(): Date {
  return new Date();
}
