import { instantFromWall } from '../dates/zoned';
import { shiftCivilDate } from './day-load';
import type { PlanDecisionKind } from './day-plan';

export const PLAN_ACTIONS = [
  'today',
  'tomorrow',
  'move',
  'done',
  'wont_do',
  'someday',
  'delete',
  'skip',
] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];
export interface PlanningAction {
  readonly action: PlanAction;
  readonly date?: string;
  readonly time?: string;
  readonly duration?: number;
}
export interface PlanningPatch {
  readonly start_date?: string | null;
  readonly is_all_day?: boolean;
  readonly time_zone?: string;
  readonly duration_minutes?: number;
  readonly someday?: boolean;
}
export function actionDate(choice: PlanningAction, localDate: string): string | null {
  return choice.action === 'today'
    ? localDate
    : choice.action === 'tomorrow'
      ? shiftCivilDate(localDate, 1)
      : choice.action === 'move'
        ? (choice.date ?? null)
        : null;
}
/** F-AC-2/3: deadline is deliberately absent; default duration is never persisted implicitly. */
export function effectOf(
  choice: PlanningAction,
  localDate: string,
  timeZone: string,
  defaultDuration = 30,
): PlanningPatch | null {
  if (
    choice.duration !== undefined &&
    (!Number.isInteger(choice.duration) || choice.duration < 5 || choice.duration > 480)
  )
    throw new Error('invalid_duration');
  if (choice.action === 'someday') return { someday: true, start_date: null };
  const date = actionDate(choice, localDate);
  if (date === null) {
    if (choice.action === 'move') throw new Error('date_required');
    return null;
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) throw new Error('invalid_date');
  const year = Number(parts[1]),
    month = Number(parts[2]),
    day = Number(parts[3]);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date)
    throw new Error('invalid_date');
  if (choice.time === undefined)
    return {
      start_date: date,
      is_all_day: true,
      time_zone: timeZone,
      someday: false,
      ...(choice.duration === undefined ? {} : { duration_minutes: choice.duration }),
    };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(choice.time)) throw new Error('invalid_time');
  const [hour, minute] = choice.time.split(':').map(Number);
  const start = instantFromWall(
    { year, month, day, hour: hour ?? 0, minute: minute ?? 0, second: 0 },
    timeZone,
  );
  if (start === null) throw new Error('invalid_time');
  return {
    start_date: start,
    is_all_day: false,
    time_zone: timeZone,
    someday: false,
    duration_minutes: choice.duration ?? defaultDuration,
  };
}
export function storedDecision(action: PlanAction): PlanDecisionKind {
  return (
    {
      today: 'plan_day',
      tomorrow: 'later',
      move: 'later',
      done: 'done',
      wont_do: 'cancel',
      someday: 'someday',
      delete: 'trash',
      skip: 'skip',
    } as const
  )[action];
}
export function legacyAction(decision: PlanDecisionKind, date: string | null): PlanningAction {
  const action = (
    {
      plan_day: 'today',
      later: 'move',
      done: 'done',
      cancel: 'wont_do',
      trash: 'delete',
      someday: 'someday',
      skip: 'skip',
    } as const
  )[decision];
  return { action, ...(date === null ? {} : { date }) };
}
