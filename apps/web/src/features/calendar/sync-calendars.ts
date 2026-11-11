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
    queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] }),
  ]);
}

/** POST /calendar/sync, then refresh the local copy. Reconnect stays on the banner (RF-2565). */
export async function syncCalendarsNow(queryClient: QueryClient): Promise<void> {
  try {
    await api.syncCalendars();
  } catch (error) {
    await queryClient.invalidateQueries({ queryKey: ['calendar-sync-status'] });
    if (error instanceof ApiError && error.code === 'google_reconnect_required') {
      return;
    }
    throw error;
  }
  await invalidateCalendarQueries(queryClient);
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
      void syncCalendarsNow(queryClient).catch(() => undefined);
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
