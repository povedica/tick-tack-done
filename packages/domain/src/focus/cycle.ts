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
  timeZoneOffsetMinutes = 0,
): FocusStats {
  let focusSeconds = 0;
  let pomodoros = 0;
  const lists = new Map<string, number>();
  const tags = new Map<string, number>();
  const days = new Set<string>();
  const hours = new Map<number, number>();
  for (const session of sessions) {
    if (session.type !== 'focus') {
      continue;
    }
    focusSeconds += session.actualSeconds;
    if (session.completed) {
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
    const local = new Date(started + timeZoneOffsetMinutes * 60_000);
    days.add(local.toISOString().slice(0, 10));
    const hour = local.getUTCHours();
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
    focus_seconds: focusSeconds,
    completed_pomodoros: pomodoros,
    by_list: [...lists.entries()].map(([listId, seconds]) => ({ list_id: listId, seconds })),
    by_tag: [...tags.entries()].map(([name, seconds]) => ({ name, seconds })),
    streak_days: days.size,
    best_hour: bestHour,
  };
}
