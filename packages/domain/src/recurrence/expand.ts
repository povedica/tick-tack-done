import { datetime, RRule, RRuleSet, type Options } from 'rrule';
import {
  addCalendarDays,
  addCalendarMonths,
  daysInMonth,
  instantFromWall,
  wallClock,
  type WallClock,
} from '../dates/zoned';
import type { ParsedRule } from './rule';

const STEP_CAP = 10_000;
const RESULT_CAP = 1_000;

/** Occurrences of the rule in `[fromIso, toIso]`, excluding EXDATE. Does not persist anything. */
export function occurrencesInRange(
  rule: ParsedRule,
  timeZone: string,
  fromIso: string,
  toIso: string,
): string[] {
  const origin = rule.dtstart;
  if (origin === null) {
    return [];
  }
  const produced = expand(rule, timeZone, origin, fromIso, toIso, RESULT_CAP, false);
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return produced.filter((iso) => {
    const at = Date.parse(iso);
    return at >= from && at <= to;
  });
}

/** First included occurrence strictly after `afterIso`, or null when the series ends. */
export function firstAfter(rule: ParsedRule, timeZone: string, afterIso: string): string | null {
  const origin = rule.dtstart ?? afterIso;
  if (needsMonthClamp(rule, origin, timeZone)) {
    const upcoming = expand(rule, timeZone, origin, afterIso, null, 1, true);
    return upcoming[0] ?? null;
  }
  const wall = wallClock(origin, timeZone);
  const after = wallClock(afterIso, timeZone);
  if (wall === null || after === null) {
    return null;
  }
  const set = ruleSet(rule, wall, timeZone);
  const found = set.after(floating(after), false);
  if (found === null) {
    return null;
  }
  const iso = floatingToIso(found, timeZone);
  if (iso === null || Date.parse(iso) <= Date.parse(afterIso)) {
    return null;
  }
  if (rule.until !== null && Date.parse(iso) > Date.parse(rule.until)) {
    return null;
  }
  return iso;
}

/**
 * RF-703 / RF-706. The next date is one interval after completion, keeping the due clock time.
 * Month days 29–31 clamp to the last day of the short month.
 */
export function advanceFromCompletion(
  rule: ParsedRule,
  timeZone: string,
  completedAt: string,
  dueDate: string | null,
): string | null {
  const completed = wallClock(completedAt, timeZone);
  const clock = wallClock(dueDate ?? completedAt, timeZone);
  if (completed === null || clock === null) {
    return null;
  }
  if (rule.freq === 'WEEKLY' && rule.byDay.length > 0) {
    return nextWeekdayAfter(rule, timeZone, completed, clock);
  }
  let stamp: WallClock;
  if (rule.freq === 'DAILY') {
    stamp = withClock(addCalendarDays(completed, rule.interval), clock);
  } else if (rule.freq === 'WEEKLY') {
    stamp = withClock(addCalendarDays(completed, 7 * rule.interval), clock);
  } else if (rule.freq === 'MONTHLY') {
    const shifted = addCalendarMonths(completed.year, completed.month, rule.interval);
    const day = clampDay(shifted.year, shifted.month, rule.byMonthDay[0] ?? clock.day);
    stamp = { ...shifted, day, hour: clock.hour, minute: clock.minute, second: clock.second };
  } else {
    const year = completed.year + rule.interval;
    const month = rule.byMonth[0] ?? clock.month;
    const day = clampDay(year, month, rule.byMonthDay[0] ?? clock.day);
    stamp = { year, month, day, hour: clock.hour, minute: clock.minute, second: clock.second };
  }
  const iso = instantFromWall(stamp, timeZone);
  if (iso === null) {
    return null;
  }
  if (rule.until !== null && Date.parse(iso) > Date.parse(rule.until)) {
    return null;
  }
  return iso;
}

export function countThrough(rule: ParsedRule, timeZone: string, throughIso: string): number {
  const origin = rule.dtstart ?? throughIso;
  if (needsMonthClamp(rule, origin, timeZone)) {
    return countClamped(rule, timeZone, origin, throughIso);
  }
  const wall = wallClock(origin, timeZone);
  const through = wallClock(throughIso, timeZone);
  if (wall === null || through === null) {
    return 0;
  }
  const set = ruleSet(rule, wall, timeZone);
  return set.between(floating(wall), floating(through), true).length;
}

function expand(
  rule: ParsedRule,
  timeZone: string,
  originIso: string,
  afterIso: string | null,
  toIso: string | null,
  limit: number,
  exclusiveAfter: boolean,
): string[] {
  if (needsMonthClamp(rule, originIso, timeZone)) {
    return expandClamped(rule, timeZone, originIso, afterIso, toIso, limit, exclusiveAfter);
  }
  const wall = wallClock(originIso, timeZone);
  if (wall === null) {
    return [];
  }
  const set = ruleSet(rule, wall, timeZone);
  const start =
    afterIso === null ? floating(wall) : floating(wallClock(afterIso, timeZone) ?? wall);
  const endWall =
    toIso === null
      ? addCalendarDays(wall, limit * Math.max(rule.interval, 1) + 400)
      : wallClock(toIso, timeZone);
  if (endWall === null) {
    return [];
  }
  const dates = set.between(start, floating(endWall), true);
  const afterMs = afterIso === null ? Number.NEGATIVE_INFINITY : Date.parse(afterIso);
  const results: string[] = [];
  for (const date of dates) {
    const iso = floatingToIso(date, timeZone);
    if (iso === null || (exclusiveAfter ? Date.parse(iso) <= afterMs : Date.parse(iso) < afterMs)) {
      continue;
    }
    results.push(iso);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function expandClamped(
  rule: ParsedRule,
  timeZone: string,
  originIso: string,
  afterIso: string | null,
  toIso: string | null,
  limit: number,
  exclusiveAfter: boolean,
): string[] {
  const origin = wallClock(originIso, timeZone);
  if (origin === null) {
    return [];
  }
  const afterMs = afterIso === null ? Number.NEGATIVE_INFINITY : Date.parse(afterIso);
  const toMs = toIso === null ? Number.POSITIVE_INFINITY : Date.parse(toIso);
  const originMs = Date.parse(originIso);
  const days = rule.byMonthDay.length > 0 ? [...rule.byMonthDay] : [origin.day];
  const results: string[] = [];
  let produced = 0;

  const consider = (stamp: WallClock): boolean => {
    const iso = instantFromWall(stamp, timeZone);
    if (iso === null) {
      return false;
    }
    const at = Date.parse(iso);
    if (at + 500 < originMs) {
      return false;
    }
    if (rule.until !== null && at > Date.parse(rule.until)) {
      return true;
    }
    produced += 1;
    if (rule.count !== null && produced > rule.count) {
      return true;
    }
    const afterOk = exclusiveAfter ? at > afterMs : at >= afterMs;
    if (!isExcluded(iso, rule.exdates) && afterOk && at <= toMs) {
      results.push(iso);
    }
    return results.length >= limit;
  };

  if (rule.freq === 'YEARLY') {
    const months =
      rule.byMonth.length > 0 ? [...rule.byMonth].sort((a, b) => a - b) : [origin.month];
    for (let step = 0; step < STEP_CAP && results.length < limit; step += 1) {
      const year = origin.year + step * rule.interval;
      let stop = false;
      for (const month of months) {
        for (const day of days) {
          stop = consider({
            year,
            month,
            day: clampDay(year, month, day),
            hour: origin.hour,
            minute: origin.minute,
            second: origin.second,
          });
          if (stop) {
            break;
          }
        }
        if (stop) {
          break;
        }
      }
      if (stop || Date.UTC(year + rule.interval, 0, 1) > toMs) {
        break;
      }
    }
    return results;
  }

  let cursor = { year: origin.year, month: origin.month };
  for (let step = 0; step < STEP_CAP && results.length < limit; step += 1) {
    if (rule.byMonth.length === 0 || rule.byMonth.includes(cursor.month)) {
      let stop = false;
      const seen = new Set<number>();
      for (const day of days) {
        const clamped = clampDay(cursor.year, cursor.month, day);
        if (seen.has(clamped)) {
          continue;
        }
        seen.add(clamped);
        stop = consider({
          year: cursor.year,
          month: cursor.month,
          day: clamped,
          hour: origin.hour,
          minute: origin.minute,
          second: origin.second,
        });
        if (stop) {
          break;
        }
      }
      if (stop) {
        break;
      }
    }
    const next = addCalendarMonths(cursor.year, cursor.month, rule.interval);
    if (Date.UTC(next.year, next.month - 1, 1) > toMs + 40 * 86_400_000) {
      break;
    }
    cursor = next;
  }
  return results;
}

function countClamped(
  rule: ParsedRule,
  timeZone: string,
  originIso: string,
  throughIso: string,
): number {
  const origin = wallClock(originIso, timeZone);
  if (origin === null) {
    return 0;
  }
  const throughMs = Date.parse(throughIso);
  const originMs = Date.parse(originIso);
  const days = rule.byMonthDay.length > 0 ? [...rule.byMonthDay] : [origin.day];
  let produced = 0;
  const months = rule.byMonth.length > 0 ? [...rule.byMonth] : [origin.month];
  const steps = rule.freq === 'YEARLY' ? 500 : 2_000;
  for (let step = 0; step < steps; step += 1) {
    const point =
      rule.freq === 'YEARLY'
        ? { year: origin.year + step * rule.interval, month: months[0] ?? origin.month }
        : addCalendarMonths(origin.year, origin.month, step * rule.interval);
    if (rule.freq === 'MONTHLY' && rule.byMonth.length > 0 && !rule.byMonth.includes(point.month)) {
      continue;
    }
    const year = point.year;
    const monthList = rule.freq === 'YEARLY' ? months : [point.month];
    let passed = false;
    for (const month of monthList) {
      for (const day of days) {
        const iso = instantFromWall(
          {
            year,
            month,
            day: clampDay(year, month, day),
            hour: origin.hour,
            minute: origin.minute,
            second: origin.second,
          },
          timeZone,
        );
        if (iso === null || Date.parse(iso) + 500 < originMs) {
          continue;
        }
        if (Date.parse(iso) > throughMs) {
          passed = true;
          break;
        }
        if (rule.until !== null && Date.parse(iso) > Date.parse(rule.until)) {
          return produced;
        }
        produced += 1;
        if (rule.count !== null && produced >= rule.count) {
          return produced;
        }
      }
      if (passed) {
        break;
      }
    }
    if (passed) {
      break;
    }
  }
  return produced;
}

function nextWeekdayAfter(
  rule: ParsedRule,
  timeZone: string,
  completed: WallClock,
  clock: WallClock,
): string | null {
  const options: Partial<Options> = RRule.parseString(rule.rruleBody);
  delete options.count;
  delete options.until;
  options.dtstart = floating({
    ...completed,
    hour: clock.hour,
    minute: clock.minute,
    second: clock.second,
  });
  const found = new RRule(options).after(floating(completed), false);
  if (found === null) {
    return null;
  }
  const iso = floatingToIso(found, timeZone);
  if (iso === null) {
    return null;
  }
  if (rule.until !== null && Date.parse(iso) > Date.parse(rule.until)) {
    return null;
  }
  return iso;
}

function needsMonthClamp(rule: ParsedRule, originIso: string, timeZone: string): boolean {
  if ((rule.freq !== 'MONTHLY' && rule.freq !== 'YEARLY') || rule.byDay.length > 0) {
    return false;
  }
  const origin = wallClock(originIso, timeZone);
  const days = rule.byMonthDay.length > 0 ? rule.byMonthDay : [origin?.day ?? 1];
  return days.some((day) => day >= 29);
}

function ruleSet(rule: ParsedRule, origin: WallClock, timeZone: string): RRuleSet {
  const options: Partial<Options> = RRule.parseString(rule.rruleBody);
  options.dtstart = floating(origin);
  const set = new RRuleSet();
  set.rrule(new RRule(options));
  for (const exdate of rule.exdates) {
    const wall = wallClock(exdate, timeZone);
    if (wall !== null) {
      set.exdate(floating(wall));
    }
  }
  return set;
}

function clampDay(year: number, month: number, day: number): number {
  const length = daysInMonth(year, month);
  if (day > 0) {
    return Math.min(day, length);
  }
  return Math.max(1, length + day + 1);
}

function withClock(day: WallClock, clock: WallClock): WallClock {
  return { ...day, hour: clock.hour, minute: clock.minute, second: clock.second };
}

function floating(wall: WallClock): Date {
  return datetime(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second);
}

function floatingToIso(date: Date, timeZone: string): string | null {
  return instantFromWall(
    {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    },
    timeZone,
  );
}

function isExcluded(iso: string, exdates: readonly string[]): boolean {
  const at = Math.floor(Date.parse(iso) / 1000);
  return exdates.some((exdate) => Math.floor(Date.parse(exdate) / 1000) === at);
}
