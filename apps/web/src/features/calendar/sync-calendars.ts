import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@reflexionia/sdk';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';

const ATTEMPT_KEY = 'tick-tack-done.calendar-sync-attempt';
const DEBOUNCE_MS = 60_000;

export async function invalidateCalendarQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar-agenda'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar-subscriptions'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar-summary'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar-range'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] }),
  ]);
}

/** POST /calendar/sync, then refresh the local copy. Reconnect stays on the banner (RF-2565). */
export async function syncCalendarsNow(
  queryClient: QueryClient,
  mode: 'always' | 'if-changed' = 'always',
): Promise<void> {
  let body: unknown;
  try {
    body = await api.syncCalendars();
  } catch (error) {
    await queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] });
    if (error instanceof ApiError && error.code === 'google_reconnect_required') {
      return;
    }
    throw error;
  }
  if (mode === 'if-changed' && !syncTouchedEvents(body)) {
    await queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] });
    return;
  }
  await invalidateCalendarQueries(queryClient);
}

/** True when a sync wrote, updated or removed at least one event. */
export function syncTouchedEvents(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || !('subscriptions' in body)) {
    return true;
  }
  const rows = (body as { subscriptions?: unknown }).subscriptions;
  if (!Array.isArray(rows)) {
    return true;
  }
  return rows.some((row) => {
    if (typeof row !== 'object' || row === null) return false;
    const item = row as { imported?: unknown; updated?: unknown; deleted?: unknown };
    return [item.imported, item.updated, item.deleted].some(
      (value) => typeof value === 'number' && value > 0,
    );
  });
}

/** One attempt per minute when Calendar or Today mounts or the tab becomes visible (RF-2565). */
export function useCalendarSyncOnOpen(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const run = (): void => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      const last = readAttempt();
      if (Date.now() - last < DEBOUNCE_MS) {
        return;
      }
      writeAttempt(Date.now());
      void syncCalendarsNow(queryClient, 'if-changed').catch(() => undefined);
    };
    run();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [queryClient]);
}

function readAttempt(): number {
  try {
    return Number(sessionStorage.getItem(ATTEMPT_KEY) ?? '0');
  } catch {
    return 0;
  }
}

function writeAttempt(value: number): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, String(value));
  } catch {
    /* Private mode can reject storage. The next open may sync again. */
  }
}
