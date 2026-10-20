export interface BusyInterval {
  readonly start: string;
  readonly end: string;
}

export interface CalendarFact {
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly isAllDay: boolean;
  readonly status: string;
  readonly timeZone: string;
}

export interface SubscriptionFact {
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
  readonly visible: boolean;
}

/**
 * busy is an empty array only after a complete verified read.
 * Missing ends, all-day, tentative, or a stale subscription yield null (unknown), never free.
 */
export function occupiedIntervals(input: {
  readonly subscriptions: readonly SubscriptionFact[];
  readonly events: readonly CalendarFact[];
  readonly nowIso: string;
  readonly freshWithinMs: number;
}): readonly BusyInterval[] | null {
  const visible = input.subscriptions.filter((row) => row.visible);
  if (visible.length === 0) {
    return null;
  }
  const now = Date.parse(input.nowIso);
  for (const row of visible) {
    if (row.lastError !== null || row.lastSyncedAt === null) {
      return null;
    }
    const synced = Date.parse(row.lastSyncedAt);
    if (Number.isNaN(synced) || now - synced > input.freshWithinMs) {
      return null;
    }
  }
  const intervals: BusyInterval[] = [];
  for (const event of input.events) {
    if (event.status === 'cancelled') {
      continue;
    }
    if (event.status === 'tentative' || event.isAllDay || event.endsAt === null) {
      return null;
    }
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return null;
    }
    intervals.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  }
  return unionIntervals(intervals);
}

export function unionIntervals(intervals: readonly BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals].sort((left, right) => left.start.localeCompare(right.start));
  const merged: BusyInterval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last === undefined || interval.start > last.end) {
      merged.push(interval);
      continue;
    }
    if (interval.end > last.end) {
      merged[merged.length - 1] = { start: last.start, end: interval.end };
    }
  }
  return merged;
}
