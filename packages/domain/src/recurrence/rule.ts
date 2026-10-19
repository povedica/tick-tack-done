import { isIanaTimeZone } from '../tasks/time-zone';
import { basicLocal, basicUtc, instantFromWall, wallClock, type WallClock } from '../dates/zoned';

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQS)[number];

export interface ByDay {
  readonly nth: number | null;
  readonly day: Weekday;
}

export interface ParsedRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly count: number | null;
  readonly until: string | null;
  readonly byDay: readonly ByDay[];
  readonly byMonthDay: readonly number[];
  readonly byMonth: readonly number[];
  readonly exdates: readonly string[];
  readonly dtstart: string | null;
  readonly rruleBody: string;
}

export type RuleFailure = 'invalid_rule' | 'invalid_zone' | 'missing_anchor' | 'invalid_date';

export function parseRepeatRule(
  input: string,
): { ok: true; rule: ParsedRule } | { ok: false; reason: 'invalid_rule' } {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, reason: 'invalid_rule' };
  }
  let body: string | null = null;
  let dtstart: string | null = null;
  const exdates: string[] = [];
  for (const line of lines) {
    if (line.startsWith('RRULE:')) {
      if (body !== null) {
        return { ok: false, reason: 'invalid_rule' };
      }
      body = line.slice('RRULE:'.length);
    } else if (line.startsWith('DTSTART')) {
      const parsed = parseDtstart(line);
      if (parsed === null || dtstart !== null) {
        return { ok: false, reason: 'invalid_rule' };
      }
      dtstart = parsed;
    } else if (line.startsWith('EXDATE')) {
      const parsed = parseExdateLine(line);
      if (parsed === null) {
        return { ok: false, reason: 'invalid_rule' };
      }
      exdates.push(...parsed);
    } else {
      return { ok: false, reason: 'invalid_rule' };
    }
  }
  if (body === null || body.length === 0) {
    return { ok: false, reason: 'invalid_rule' };
  }
  const fields = parseBody(body);
  if (fields === null) {
    return { ok: false, reason: 'invalid_rule' };
  }
  return {
    ok: true,
    rule: { ...fields, exdates, dtstart, rruleBody: normalizeBody(fields) },
  };
}

/**
 * In-memory form for the recurrence engine. Callers that persist a rule must keep the
 * original string: this prepends DTSTART and drops INTERVAL=1.
 */
export function canonicalizeRepeatRule(
  rule: string,
  anchorIso: string | null,
  timeZone: string,
): { ok: true; rule: string } | { ok: false; reason: RuleFailure } {
  const parsed = parseRepeatRule(rule);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isIanaTimeZone(timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  const origin = parsed.rule.dtstart ?? anchorIso;
  if (origin === null) {
    return { ok: false, reason: 'missing_anchor' };
  }
  const wall = wallClock(origin, timeZone);
  if (wall === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const lines = [
    `DTSTART;TZID=${timeZone}:${basicLocal(wall)}`,
    `RRULE:${parsed.rule.rruleBody}`,
    ...parsed.rule.exdates.map((iso) => `EXDATE:${basicUtc(iso) ?? ''}`),
  ];
  return { ok: true, rule: lines.join('\n') };
}

/** RF-705. The excluded instant stays in the rule as an EXDATE and drops out of the series. */
export function excludeOccurrence(
  rule: string,
  occurrenceIso: string,
): { ok: true; rule: string } | { ok: false; reason: 'invalid_rule' | 'invalid_date' } {
  const parsed = parseRepeatRule(rule);
  if (!parsed.ok) {
    return parsed;
  }
  const stamp = basicUtc(occurrenceIso);
  if (stamp === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const existing = new Set(parsed.rule.exdates.map((iso) => basicUtc(iso)));
  if (existing.has(stamp)) {
    return { ok: true, rule };
  }
  const separator = rule.endsWith('\n') ? '' : '\n';
  return { ok: true, rule: `${rule}${separator}EXDATE:${stamp}` };
}

export interface RepeatDraft {
  readonly freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  readonly interval?: number;
  readonly weekdays?: readonly Weekday[];
  readonly monthDay?: number;
  readonly monthWeek?: { readonly setpos: 1 | 2 | 3 | 4 | -1; readonly weekday: Weekday };
  readonly until?: string | null;
  readonly count?: number | null;
}

/** Structured rule for the Spanish builder (RF-702). The UI itself is later. */
export function buildRepeatRule(
  draft: RepeatDraft,
): { ok: true; rule: string } | { ok: false; reason: 'invalid_rule' } {
  const interval = draft.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) {
    return { ok: false, reason: 'invalid_rule' };
  }
  const fields: string[] = [`FREQ=${draft.freq.toUpperCase()}`];
  if (interval !== 1) {
    fields.push(`INTERVAL=${String(interval)}`);
  }
  if (draft.monthWeek !== undefined) {
    fields.push(`BYDAY=${String(draft.monthWeek.setpos)}${draft.monthWeek.weekday}`);
  } else if (draft.weekdays !== undefined && draft.weekdays.length > 0) {
    fields.push(`BYDAY=${draft.weekdays.join(',')}`);
  }
  if (draft.monthDay !== undefined) {
    if (draft.monthDay < 1 || draft.monthDay > 31) {
      return { ok: false, reason: 'invalid_rule' };
    }
    fields.push(`BYMONTHDAY=${String(draft.monthDay)}`);
  }
  if (draft.count !== undefined && draft.count !== null) {
    if (!Number.isInteger(draft.count) || draft.count < 1) {
      return { ok: false, reason: 'invalid_rule' };
    }
    fields.push(`COUNT=${String(draft.count)}`);
  }
  if (draft.until !== undefined && draft.until !== null) {
    const stamp = basicUtc(draft.until);
    if (stamp === null) {
      return { ok: false, reason: 'invalid_rule' };
    }
    fields.push(`UNTIL=${stamp}`);
  }
  const built = parseRepeatRule(`RRULE:${fields.join(';')}`);
  if (!built.ok) {
    return built;
  }
  return { ok: true, rule: `RRULE:${built.rule.rruleBody}` };
}

const WEEKDAY_ES: Record<Weekday, string> = {
  MO: 'lunes',
  TU: 'martes',
  WE: 'miércoles',
  TH: 'jueves',
  FR: 'viernes',
  SA: 'sábado',
  SU: 'domingo',
};

const SETPOS_ES: Record<number, string> = {
  1: 'primer',
  2: 'segundo',
  3: 'tercer',
  4: 'cuarto',
  [-1]: 'último',
};

/** Short Spanish label for a rule. RF-702 shows this instead of the raw RRULE. */
export function describeRepeatRule(rule: string): string | null {
  const parsed = parseRepeatRule(rule);
  if (!parsed.ok) {
    return null;
  }
  const { freq, interval, byDay, byMonthDay } = parsed.rule;
  let label: string;
  if (freq === 'DAILY') {
    label = interval === 1 ? 'Cada día' : `Cada ${String(interval)} días`;
  } else if (freq === 'WEEKLY') {
    const codes = byDay.map((item) => item.day);
    const workdays: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];
    if (
      interval === 1 &&
      codes.length === workdays.length &&
      workdays.every((day) => codes.includes(day))
    ) {
      label = 'Cada día laborable';
    } else {
      const days = codes.map((day) => WEEKDAY_ES[day]);
      const when = days.length > 0 ? ` los ${joinEs(days)}` : '';
      label = interval === 1 ? `Cada semana${when}` : `Cada ${String(interval)} semanas${when}`;
    }
  } else if (freq === 'MONTHLY') {
    const nth = byDay[0];
    if (nth?.nth !== null && nth !== undefined) {
      const which = SETPOS_ES[nth.nth] ?? `${String(nth.nth)}º`;
      label = `El ${which} ${WEEKDAY_ES[nth.day]} de cada mes`;
    } else if (byMonthDay.length > 0) {
      label = `El día ${byMonthDay.join(' y ')} de cada mes`;
    } else {
      label = interval === 1 ? 'Cada mes' : `Cada ${String(interval)} meses`;
    }
  } else {
    label = interval === 1 ? 'Cada año' : `Cada ${String(interval)} años`;
  }
  if (parsed.rule.count !== null) {
    label = `${label}, ${String(parsed.rule.count)} veces`;
  }
  return label;
}

function joinEs(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1] ?? ''}`;
}

function parseBody(body: string): Omit<ParsedRule, 'exdates' | 'dtstart' | 'rruleBody'> | null {
  let freq: Frequency | null = null;
  let interval = 1;
  let count: number | null = null;
  let until: string | null = null;
  const byDay: ByDay[] = [];
  const byMonthDay: number[] = [];
  const byMonth: number[] = [];
  for (const part of body.split(';')) {
    if (part.length === 0) {
      return null;
    }
    const splitAt = part.indexOf('=');
    if (splitAt <= 0) {
      return null;
    }
    const key = part.slice(0, splitAt).toUpperCase();
    const value = part.slice(splitAt + 1);
    if (value.length === 0) {
      return null;
    }
    if (key === 'FREQ') {
      if (!isFreq(value.toUpperCase())) {
        return null;
      }
      freq = value.toUpperCase() as Frequency;
    } else if (key === 'INTERVAL') {
      const parsed = positiveInt(value);
      if (parsed === null) {
        return null;
      }
      interval = parsed;
    } else if (key === 'COUNT') {
      const parsed = positiveInt(value);
      if (parsed === null) {
        return null;
      }
      count = parsed;
    } else if (key === 'UNTIL') {
      const parsed = parseUntil(value);
      if (parsed === null) {
        return null;
      }
      until = parsed;
    } else if (key === 'BYDAY') {
      for (const token of value.toUpperCase().split(',')) {
        const match = /^(-?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token);
        const day = match?.[2];
        if (day === undefined || !isWeekday(day)) {
          return null;
        }
        const nth = match?.[1];
        byDay.push({
          nth: nth === undefined ? null : Number(nth),
          day,
        });
      }
    } else if (key === 'BYMONTHDAY') {
      for (const token of value.split(',')) {
        const day = Number(token);
        if (!Number.isInteger(day) || day === 0 || day < -31 || day > 31) {
          return null;
        }
        byMonthDay.push(day);
      }
    } else if (key === 'BYMONTH') {
      for (const token of value.split(',')) {
        const month = Number(token);
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          return null;
        }
        byMonth.push(month);
      }
    } else if (key === 'WKST') {
      if (!isWeekday(value.toUpperCase())) {
        return null;
      }
    } else {
      return null;
    }
  }
  if (freq === null) {
    return null;
  }
  return { freq, interval, count, until, byDay, byMonthDay, byMonth };
}

function normalizeBody(fields: Omit<ParsedRule, 'exdates' | 'dtstart' | 'rruleBody'>): string {
  const parts = [`FREQ=${fields.freq}`];
  if (fields.interval !== 1) {
    parts.push(`INTERVAL=${String(fields.interval)}`);
  }
  if (fields.byDay.length > 0) {
    parts.push(
      `BYDAY=${fields.byDay
        .map((item) => `${item.nth === null ? '' : String(item.nth)}${item.day}`)
        .join(',')}`,
    );
  }
  if (fields.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${fields.byMonthDay.join(',')}`);
  }
  if (fields.byMonth.length > 0) {
    parts.push(`BYMONTH=${fields.byMonth.join(',')}`);
  }
  if (fields.count !== null) {
    parts.push(`COUNT=${String(fields.count)}`);
  }
  if (fields.until !== null) {
    const stamp = basicUtc(fields.until);
    if (stamp !== null) {
      parts.push(`UNTIL=${stamp}`);
    }
  }
  return parts.join(';');
}

function parseDtstart(line: string): string | null {
  const zoned = /^DTSTART;TZID=([^:]+):(\d{8}T\d{6})$/.exec(line);
  if (zoned?.[1] !== undefined && zoned[2] !== undefined) {
    if (!isIanaTimeZone(zoned[1])) {
      return null;
    }
    const wall = wallFromBasic(zoned[2]);
    return wall === null ? null : instantFromWall(wall, zoned[1]);
  }
  const utc = /^DTSTART:(\d{8}T\d{6}Z)$/.exec(line);
  if (utc?.[1] === undefined) {
    return null;
  }
  return isoFromBasicUtc(utc[1]);
}

function parseExdateLine(line: string): string[] | null {
  const zoned = /^EXDATE;TZID=([^:]+):(.+)$/.exec(line);
  if (zoned?.[1] !== undefined && zoned[2] !== undefined) {
    if (!isIanaTimeZone(zoned[1])) {
      return null;
    }
    const values: string[] = [];
    for (const token of zoned[2].split(',')) {
      const wall = wallFromBasic(token);
      if (wall === null) {
        return null;
      }
      const iso = instantFromWall(wall, zoned[1]);
      if (iso === null) {
        return null;
      }
      values.push(iso);
    }
    return values;
  }
  const utc = /^EXDATE:(.+)$/.exec(line);
  if (utc?.[1] === undefined) {
    return null;
  }
  const values: string[] = [];
  for (const token of utc[1].split(',')) {
    if (!/^\d{8}T\d{6}Z$/.test(token)) {
      return null;
    }
    const iso = isoFromBasicUtc(token);
    if (iso === null) {
      return null;
    }
    values.push(iso);
  }
  return values;
}

function parseUntil(value: string): string | null {
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return isoFromBasicUtc(value);
  }
  if (/^\d{8}$/.test(value)) {
    return isoFromBasicUtc(`${value}T235959Z`);
  }
  return null;
}

function wallFromBasic(value: string): WallClock | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  return { year, month, day, hour, minute, second };
}

function isoFromBasicUtc(value: string): string | null {
  const wall = wallFromBasic(value.slice(0, 15));
  if (wall === null) {
    return null;
  }
  return instantFromWall(wall, 'UTC');
}

function positiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function isFreq(value: string): value is Frequency {
  return (FREQS as readonly string[]).includes(value);
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}
