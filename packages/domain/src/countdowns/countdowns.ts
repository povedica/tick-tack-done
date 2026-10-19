export const COUNTDOWN_TYPES = ['countdown', 'anniversary', 'birthday', 'holiday'] as const;
export const COUNTDOWN_REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export const COUNTDOWN_DAY_MODES = ['standard', 'plus_one'] as const;
export const COUNTDOWN_COLORS = [
  'none',
  'blue',
  'teal',
  'green',
  'lime',
  'orange',
  'red',
  'pink',
  'purple',
  'navy',
  'brown',
  'black',
  'rainbow',
] as const;

export type CountdownRepeat = (typeof COUNTDOWN_REPEATS)[number];
export type CountdownDayMode = (typeof COUNTDOWN_DAY_MODES)[number];
export type CountdownKind = 'until' | 'since' | 'today';

export interface CountdownCalculationInput {
  targetDate: string;
  repeatRule: CountdownRepeat;
  dayMode: CountdownDayMode;
}

export interface CountdownDaysLabel {
  kind: CountdownKind;
  days: number;
  effectiveDate: string;
}

/** Returns the current or first subsequent civil-date occurrence. Time zone is accepted
 * to keep the domain contract explicit: all inputs are civil dates, so DST cannot alter it. */
export function nextCountdownOccurrence(
  targetDate: string,
  repeatRule: CountdownRepeat,
  _dayMode: CountdownDayMode,
  today: string,
  _timeZone: string,
): string {
  assertDate(targetDate);
  assertDate(today);
  if (repeatRule === 'none' || targetDate >= today) return targetDate;

  const target = parts(targetDate);
  const current = parts(today);
  switch (repeatRule) {
    case 'daily':
      return today;
    case 'weekly': {
      const delta = (weekday(targetDate) - weekday(today) + 7) % 7;
      return addDays(today, delta);
    }
    case 'monthly': {
      const candidate = dateKey(current.year, current.month, Math.min(target.day, daysInMonth(current.year, current.month)));
      if (candidate >= today) return candidate;
      const next = addMonths(current.year, current.month, 1);
      return dateKey(next.year, next.month, Math.min(target.day, daysInMonth(next.year, next.month)));
    }
    case 'yearly': {
      const candidate = dateKey(current.year, target.month, Math.min(target.day, daysInMonth(current.year, target.month)));
      if (candidate >= today) return candidate;
      return dateKey(current.year + 1, target.month, Math.min(target.day, daysInMonth(current.year + 1, target.month)));
    }
  }
}

export function countdownDaysLabel(
  countdown: CountdownCalculationInput,
  today: string,
  timeZone: string,
): CountdownDaysLabel {
  const effectiveDate = nextCountdownOccurrence(
    countdown.targetDate,
    countdown.repeatRule,
    countdown.dayMode,
    today,
    timeZone,
  );
  const delta = calendarDiff(effectiveDate, today);
  if (delta === 0) return { kind: 'today', days: 0, effectiveDate };
  if (delta > 0) {
    return { kind: 'until', days: delta + (countdown.dayMode === 'plus_one' ? 1 : 0), effectiveDate };
  }
  return {
    kind: 'since',
    days: -delta + (countdown.dayMode === 'plus_one' ? 1 : 0),
    effectiveDate,
  };
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('invalid_countdown_date');
  }
}

function parts(value: string): { year: number; month: number; day: number } {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = value.split('-').map(Number);
  return { year, month, day };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addMonths(year: number, month: number, amount: number): { year: number; month: number } {
  const index = year * 12 + month - 1 + amount;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function weekday(value: string): number {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

function calendarDiff(left: string, right: string): number {
  return Math.round(
    (Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000,
  );
}
