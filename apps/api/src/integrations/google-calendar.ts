export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

const CALENDAR_HOST = 'https://www.googleapis.com/calendar/v3';
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const TIMEOUT_MS = 8_000;
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export interface GoogleCalendarEntry {
  readonly id: string;
  readonly summary: string;
  readonly primary: boolean;
  readonly backgroundColor: string | null;
  readonly accessRole: string | null;
  readonly selected: boolean;
  readonly hidden: boolean;
}

export interface GoogleEventPage {
  readonly items: readonly unknown[];
  readonly nextPageToken: string | null;
  readonly nextSyncToken: string | null;
}

export interface GoogleFetchOptions {
  readonly accessToken: string;
  readonly refresh?: () => Promise<string>;
  readonly retryDelayMs?: number;
}

/** Thin Google Calendar v3 client. Fixed hosts, native fetch, no Google SDK (RF-2510, RF-2517). */
export async function listCalendars(options: GoogleFetchOptions): Promise<GoogleCalendarEntry[]> {
  const collected: GoogleCalendarEntry[] = [];
  let pageToken: string | null = null;
  do {
    const url = new URL(`${CALENDAR_HOST}/users/me/calendarList`);
    if (pageToken !== null) {
      url.searchParams.set('pageToken', pageToken);
    }
    const body = await googleJson(url, options);
    const items = itemsOf(body);
    for (const item of items) {
      const entry = calendarEntry(item);
      if (entry !== null) {
        collected.push(entry);
      }
    }
    pageToken = stringField(body, 'nextPageToken');
  } while (pageToken !== null);
  return collected;
}

export async function listEvents(
  calendarId: string,
  query: {
    readonly syncToken?: string;
    readonly timeMin?: string;
    readonly timeMax?: string;
    readonly timeZone?: string;
    readonly pageToken?: string;
    readonly maxResults?: number;
    readonly singleEvents?: boolean;
    readonly showDeleted?: boolean;
    readonly orderBy?: string;
  },
  options: GoogleFetchOptions,
): Promise<GoogleEventPage> {
  const url = new URL(`${CALENDAR_HOST}/calendars/${encodeURIComponent(calendarId)}/events`);
  // syncToken forbids timeMin, timeMax, orderBy and timeZone. singleEvents and
  // showDeleted stay, including on later pages (RF-2561).
  const syncToken = query.syncToken;
  if (syncToken !== undefined && syncToken.length > 0) {
    url.searchParams.set('syncToken', syncToken);
  } else {
    if (query.timeMin !== undefined) {
      url.searchParams.set('timeMin', query.timeMin);
    }
    if (query.timeMax !== undefined) {
      url.searchParams.set('timeMax', query.timeMax);
    }
    if (query.timeZone !== undefined) {
      url.searchParams.set('timeZone', query.timeZone);
    }
    if (query.orderBy !== undefined) {
      url.searchParams.set('orderBy', query.orderBy);
    }
  }
  if (query.singleEvents === true) {
    url.searchParams.set('singleEvents', 'true');
  }
  if (query.showDeleted === true) {
    url.searchParams.set('showDeleted', 'true');
  }
  if (query.pageToken !== undefined) {
    url.searchParams.set('pageToken', query.pageToken);
  }
  url.searchParams.set('maxResults', String(query.maxResults ?? 2500));
  const body = await googleJson(url, options);
  return {
    items: itemsOf(body),
    nextPageToken: stringField(body, 'nextPageToken'),
    nextSyncToken: stringField(body, 'nextSyncToken'),
  };
}

export interface GoogleWatchChannel {
  readonly id: string;
  readonly resourceId: string;
  readonly expiration: Date;
}

/** events.watch. The address must already be a public HTTPS URL (RF-2566). */
export async function watchCalendarEvents(
  calendarId: string,
  channel: {
    readonly id: string;
    readonly address: string;
    readonly token: string;
    readonly expiration: number;
  },
  options: GoogleFetchOptions,
): Promise<GoogleWatchChannel> {
  const url = new URL(`${CALENDAR_HOST}/calendars/${encodeURIComponent(calendarId)}/events/watch`);
  const body = await googleJson(url, options, {
    method: 'POST',
    body: {
      id: channel.id,
      type: 'web_hook',
      address: channel.address,
      token: channel.token,
      expiration: channel.expiration,
    },
  });
  const id = stringField(body, 'id') ?? channel.id;
  const resourceId = stringField(body, 'resourceId');
  if (resourceId === null) {
    throw new GoogleApiError(0, 'watch', 'Google Calendar did not return a watch resource');
  }
  const expiration = expirationOf(body) ?? new Date(channel.expiration);
  return { id, resourceId, expiration };
}

/** channels.stop. A 404 means Google already dropped the channel (RF-2566). */
export async function stopCalendarChannel(
  channelId: string,
  resourceId: string,
  options: GoogleFetchOptions,
): Promise<void> {
  const url = new URL(`${CALENDAR_HOST}/channels/stop`);
  try {
    await googleJson(url, options, {
      method: 'POST',
      body: { id: channelId, resourceId },
    });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) {
      return;
    }
    throw error;
  }
}

/** RF-2516. True when the access token includes the Calendar scope. */
export async function tokenHasCalendarScope(accessToken: string): Promise<boolean> {
  const url = new URL(TOKENINFO);
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new GoogleApiError(response.status, 'tokeninfo', 'Google token info failed');
  }
  const body = (await response.json()) as { scope?: unknown };
  const scope = typeof body.scope === 'string' ? body.scope : '';
  const granted = new Set(scope.split(' '));
  return (
    granted.has(CALENDAR_SCOPE) ||
    (granted.has(`${CALENDAR_SCOPE}.calendarlist.readonly`) &&
      granted.has(`${CALENDAR_SCOPE}.events`))
  );
}

export function primaryCalendar(
  entries: readonly GoogleCalendarEntry[],
): GoogleCalendarEntry | null {
  return entries.find((entry) => entry.primary) ?? entries[0] ?? null;
}

async function googleJson(
  url: URL,
  options: GoogleFetchOptions,
  init?: { readonly method: 'POST'; readonly body: unknown },
): Promise<unknown> {
  const delay = options.retryDelayMs ?? 2_000;
  let token = options.accessToken;
  let refreshed = false;
  let retried = false;
  for (;;) {
    try {
      const response = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(init === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 401 && !refreshed && options.refresh !== undefined) {
        token = await options.refresh();
        refreshed = true;
        continue;
      }
      if (response.status >= 500 && !retried) {
        retried = true;
        await wait(delay);
        continue;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new GoogleApiError(
          response.status,
          reasonOf(text),
          shortError(response.status, text),
        );
      }
      if (response.status === 204) {
        return null;
      }
      const text = await response.text();
      if (text.length === 0) {
        return null;
      }
      const body: unknown = JSON.parse(text);
      return body;
    } catch (error) {
      if (error instanceof GoogleApiError) {
        throw error;
      }
      if (!retried) {
        retried = true;
        await wait(delay);
        continue;
      }
      throw new GoogleApiError(0, 'network', 'Google Calendar request failed');
    }
  }
}

function itemsOf(body: unknown): unknown[] {
  if (typeof body !== 'object' || body === null || !('items' in body)) {
    return [];
  }
  const items = body.items;
  return Array.isArray(items) ? items : [];
}

function stringField(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function expirationOf(body: unknown): Date | null {
  if (typeof body !== 'object' || body === null || !('expiration' in body)) {
    return null;
  }
  const value = (body as { expiration?: unknown }).expiration;
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms);
}

function calendarEntry(value: unknown): GoogleCalendarEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.id.length === 0) {
    return null;
  }
  return {
    id: item.id,
    summary: typeof item.summary === 'string' && item.summary.length > 0 ? item.summary : item.id,
    primary: item.primary === true,
    backgroundColor: typeof item.backgroundColor === 'string' ? item.backgroundColor : null,
    accessRole: typeof item.accessRole === 'string' ? item.accessRole : null,
    selected: item.selected !== false,
    hidden: item.hidden === true,
  };
}

function reasonOf(text: string): string {
  try {
    const body = JSON.parse(text) as {
      error?: { status?: unknown; errors?: { reason?: unknown }[] };
    };
    const reason = body.error?.errors?.[0]?.reason;
    if (typeof reason === 'string') {
      return reason;
    }
    if (typeof body.error?.status === 'string') {
      return body.error.status;
    }
  } catch {
    return 'error';
  }
  return 'error';
}

function shortError(status: number, text: string): string {
  const reason = reasonOf(text);
  return `${String(status)} ${reason}`.slice(0, 180);
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
