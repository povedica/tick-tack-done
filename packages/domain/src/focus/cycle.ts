import type { FocusSessionType } from '../types';

/** RF-1201 and RF-1205. The clock is injected. Closing the tab does not own the session. */

export interface FocusSettings {
  readonly pomodoroMinutes: number;
  readonly shortBreakMinutes: number;
  readonly longBreakMinutes: number;
  readonly cyclesBeforeLongBreak: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  pomodoroMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

export interface FocusPhase {
  readonly type: FocusSessionType;
  readonly plannedMinutes: number;
}

/** After a finished focus, a short break follows until the long-break cycle. */
export function nextFocusPhase(
  finished: FocusSessionType,
  completedFocusCount: number,
  settings: FocusSettings,
): FocusPhase {
  if (finished !== 'focus') {
    return { type: 'focus', plannedMinutes: settings.pomodoroMinutes };
  }
  const long =
    settings.cyclesBeforeLongBreak > 0 &&
    completedFocusCount > 0 &&
    completedFocusCount % settings.cyclesBeforeLongBreak === 0;
  return long
    ? { type: 'long_break', plannedMinutes: settings.longBreakMinutes }
    : { type: 'short_break', plannedMinutes: settings.shortBreakMinutes };
}

export function remainingSeconds(
  startedAtIso: string,
  plannedMinutes: number,
  nowIso: string,
): number {
  const started = Date.parse(startedAtIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(started) || Number.isNaN(now) || plannedMinutes < 1) {
    return 0;
  }
  const left = Math.ceil((started + plannedMinutes * 60_000 - now) / 1000);
  return Math.max(0, left);
}

export interface FocusStatSession {
  readonly type: FocusSessionType;
  readonly startedAt: string;
  readonly actualSeconds: number;
  readonly completed: boolean;
  readonly listId: string | null;
  readonly tagNames: readonly string[];
}

export interface FocusStats {
  readonly today_pomodoros: number;
  readonly today_focus_seconds: number;
  readonly focus_seconds: number;
  readonly completed_pomodoros: number;
  readonly by_list: readonly { readonly list_id: string; readonly seconds: number }[];
  readonly by_tag: readonly { readonly name: string; readonly seconds: number }[];
  readonly streak_days: number;
  readonly best_hour: number | null;
}

export function cappedFocusSeconds(startedAt: string, plannedMinutes: number, now: string): number {
  const started = Date.parse(startedAt);
  const clock = Date.parse(now);
  if (Number.isNaN(started) || Number.isNaN(clock)) {
    return 0;
  }
  const elapsed = Math.max(0, Math.round((clock - started) / 1000));
  return Math.min(elapsed, Math.max(0, plannedMinutes) * 60);
}

export type FocusListStatus = 'active' | 'completed' | 'aborted' | 'expired';

/** A session still open after its planned end is expired, not active. */
export function focusSessionStatus(input: {
  readonly endedAt: string | null;
  readonly completed: boolean;
  readonly startedAt: string;
  readonly plannedMinutes: number;
  readonly now: string;
}): FocusListStatus {
  if (input.endedAt !== null) {
    return input.completed ? 'completed' : 'aborted';
  }
  const end = Date.parse(input.startedAt) + input.plannedMinutes * 60_000;
  if (Number.isNaN(end) || Date.parse(input.now) >= end) {
    return 'expired';
  }
  return 'active';
}

export function focusStats(
  sessions: readonly FocusStatSession[],
  timeZone: string | number = 0,
  now = new Date().toISOString(),
): FocusStats {
  const localParts = (iso: string) => {
    const date = new Date(iso);
    if (typeof timeZone === 'number') {
      const local = new Date(date.getTime() + timeZone * 60_000);
      return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (kind: string) => parts.find((value) => value.type === kind)?.value ?? '';
    return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
  };
  const today = localParts(now).day;
  let todayPomodoros = 0;
  let todaySeconds = 0;
  let focusSeconds = 0;
  let pomodoros = 0;
  const lists = new Map<string, number>();
  const tags = new Map<string, number>();
  const days = new Set<string>();
  const hours = new Map<number, number>();
  for (const session of sessions) {
    if (session.type !== 'focus' && session.type !== 'stopwatch') {
      continue;
    }
    focusSeconds += session.actualSeconds;
    if (session.completed && session.type === 'focus') {
      pomodoros += 1;
    }
    if (session.listId !== null) {
      lists.set(session.listId, (lists.get(session.listId) ?? 0) + session.actualSeconds);
    }
    for (const tag of session.tagNames) {
      tags.set(tag, (tags.get(tag) ?? 0) + session.actualSeconds);
    }
    const started = Date.parse(session.startedAt);
    if (Number.isNaN(started)) {
      continue;
    }
    const local = localParts(session.startedAt);
    days.add(local.day);
    if (local.day === today) {
      todaySeconds += session.actualSeconds;
      if (session.completed && session.type === 'focus') todayPomodoros += 1;
    }
    const hour = local.hour;
    hours.set(hour, (hours.get(hour) ?? 0) + session.actualSeconds);
  }
  let bestHour: number | null = null;
  let best = 0;
  for (const [hour, seconds] of hours) {
    if (seconds > best) {
      best = seconds;
      bestHour = hour;
    }
  }
  return {
    today_pomodoros: todayPomodoros,
    today_focus_seconds: todaySeconds,
    focus_seconds: focusSeconds,
    completed_pomodoros: pomodoros,
    by_list: [...lists.entries()].map(([listId, seconds]) => ({ list_id: listId, seconds })),
    by_tag: [...tags.entries()].map(([name, seconds]) => ({ name, seconds })),
    streak_days: days.size,
    best_hour: bestHour,
  };
}

/** RF-1205: elapsed real time, freezing at pause and excluding earlier pauses. */
export function focusElapsedSeconds(input: {
  readonly startedAt: string;
  readonly now: string;
  readonly pausedAt?: string | null;
  readonly pausedSeconds?: number;
}): number {
  const elapsed = (Date.parse(input.pausedAt ?? input.now) - Date.parse(input.startedAt)) / 1000;
  return Number.isFinite(elapsed)
    ? Math.max(0, Math.floor(elapsed) - (input.pausedSeconds ?? 0))
    : 0;
}

/** RF-1201: opt-in, and a stopwatch never starts a Pomodoro cycle. */
export function autoStartNextPhase(
  finished: FocusSessionType,
  settings: { readonly autoStartBreaks: boolean; readonly autoStartFocus: boolean },
): boolean {
  return finished === 'focus'
    ? settings.autoStartBreaks
    : finished === 'short_break' || finished === 'long_break'
      ? settings.autoStartFocus
      : false;
}
