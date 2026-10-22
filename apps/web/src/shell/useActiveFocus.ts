import { useMessages } from '../i18n';
import { focusElapsedSeconds } from '@reflexionia/domain';
import { runAction } from '../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export interface ActiveFocus {
  readonly id: string;
  readonly taskId: string | null;
  readonly remaining: number;
  readonly planned: number;
  readonly progress: number;
}

export function useActiveFocus(): ActiveFocus | null {
  const sessions = useQuery({
    queryKey: ['focus-sessions'],
    queryFn: () => api.listFocusSessions('active'),
    refetchInterval: 15_000,
  });
  const settings = useQuery({
    queryKey: ['focus-settings'],
    queryFn: () => api.getFocusSettings(),
  });
  const live = firstLive(sessions.data);
  const started = text(live?.started_at);
  const planned =
    numberOf(live?.planned_minutes) ||
    numberOf(settings.data?.pomodoroMinutes) ||
    numberOf(settings.data?.pomodoro_minutes) ||
    25;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (started.length === 0) {
      return;
    }
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [started]);
  if (live === null || started.length === 0) {
    return null;
  }
  const elapsed = focusElapsedSeconds({
    startedAt: started,
    now: new Date(now).toISOString(),
    pausedAt: typeof live.paused_at === 'string' ? live.paused_at : null,
    pausedSeconds: numberOf(live.paused_seconds),
  });
  const remaining = Math.max(0, planned * 60 - elapsed);
  return {
    id: text(live.id),
    taskId: text(live.task_id).length > 0 ? text(live.task_id) : null,
    remaining: live.type === 'stopwatch' ? elapsed : remaining,
    planned: live.type === 'stopwatch' ? 0 : planned * 60,
    progress:
      live.type === 'stopwatch' || planned === 0 ? 0 : Math.min(1, elapsed / (planned * 60)),
  };
}

/** Finishes a session that has reached zero, even when /focus is not open. */
export function FocusCloser() {
  const messages = useMessages();
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const queryClient = useQueryClient();
  const focus = useActiveFocus();
  const closed = useRef<string | null>(null);
  const id = focus !== null && focus.planned > 0 && focus.remaining === 0 ? focus.id : '';
  useEffect(() => {
    if (id.length === 0 || closed.current === id) {
      return;
    }
    closed.current = id;
    runAction(
      api.finishFocus(id).then(() => {
        if (
          account.data?.focus_notifications !== false &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        )
          new Notification(messages.focusDone);
        runAction(queryClient.invalidateQueries({ queryKey: ['focus-record'] }));
        runAction(queryClient.invalidateQueries({ queryKey: ['focus-sessions'] }));
        runAction(queryClient.invalidateQueries({ queryKey: ['focus-stats'] }));
      }),
    );
  }, [id, queryClient, messages.focusDone, account.data?.focus_notifications]);
  return null;
}

export function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function firstLive(value: unknown): Record<string, unknown> | null {
  return (
    rows(value).find(
      (row) =>
        row.ended_at == null &&
        (row.type === 'stopwatch' || row.paused_at != null || numberOf(row.remaining_seconds) > 0),
    ) ?? null
  );
}

function rows(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
