import type { RepeatFrom } from '../types';
import { isIanaTimeZone } from '../tasks/time-zone';
import { advanceFromCompletion, countThrough, firstAfter, occurrencesInRange } from './expand';
import {
  parseRepeatRule,
  type RuleFailure,
} from './rule';

export interface RecurrenceInput {
  readonly repeatRule: string;
  readonly repeatFrom: RepeatFrom;
  readonly dueDate: string | null;
  readonly startDate: string | null;
  readonly completedAt: string | null;
  readonly timeZone: string;
  readonly isAllDay: boolean;
  /** 1-based count of the occurrence just completed. Used when repeat_from is completion_date. */
  readonly occurrenceIndex: number | null;
}

export interface Occurrence {
  readonly dueDate: string;
  readonly startDate: string | null;
}

export type RecurrenceResult =
  | { readonly ok: true; readonly occurrence: Occurrence | null }
  | { readonly ok: false; readonly reason: RuleFailure };

/**
 * RF-704. Returns only the following occurrence. A null occurrence means COUNT or UNTIL is spent.
 * repeat_from due_date steps the original rule (a late completion does not skip ahead).
 */
export function nextOccurrence(input: RecurrenceInput): RecurrenceResult {
  if (!isIanaTimeZone(input.timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  const parsed = parseRepeatRule(input.repeatRule);
  if (!parsed.ok) {
    return parsed;
  }
  const origin = parsed.rule.dtstart ?? input.dueDate;
  if (origin === null) {
    return { ok: false, reason: 'missing_anchor' };
  }
  const rule = parsed.rule.dtstart === null ? { ...parsed.rule, dtstart: origin } : parsed.rule;

  if (input.repeatFrom === 'completion_date') {
    if (input.completedAt === null) {
      return { ok: false, reason: 'missing_anchor' };
    }
    const index = input.occurrenceIndex ?? countThrough(rule, input.timeZone, input.dueDate ?? origin);
    if (rule.count !== null && index >= rule.count) {
      return { ok: true, occurrence: null };
    }
    const due = advanceFromCompletion(rule, input.timeZone, input.completedAt, input.dueDate);
    if (due === null) {
      return { ok: true, occurrence: null };
    }
    return {
      ok: true,
      occurrence: {
        dueDate: due,
        startDate: shiftStart(input.startDate, input.dueDate, due),
      },
    };
  }

  if (input.dueDate === null && parsed.rule.dtstart === null) {
    return { ok: false, reason: 'missing_anchor' };
  }
  const due = firstAfter(rule, input.timeZone, input.dueDate ?? origin);
  if (due === null) {
    return { ok: true, occurrence: null };
  }
  return {
    ok: true,
    occurrence: {
      dueDate: due,
      startDate: shiftStart(input.startDate, input.dueDate ?? origin, due),
    },
  };
}

/** RF-704. Theoretical occurrences in the window. Nothing is stored. */
export function occurrencesBetween(input: {
  readonly repeatRule: string;
  readonly dueDate: string | null;
  readonly startDate: string | null;
  readonly timeZone: string;
  readonly from: string;
  readonly to: string;
}): { ok: true; occurrences: readonly Occurrence[] } | { ok: false; reason: RuleFailure } {
  if (!isIanaTimeZone(input.timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  if (Number.isNaN(Date.parse(input.from)) || Number.isNaN(Date.parse(input.to)) || input.from > input.to) {
    return { ok: false, reason: 'invalid_date' };
  }
  const parsed = parseRepeatRule(input.repeatRule);
  if (!parsed.ok) {
    return parsed;
  }
  const origin = parsed.rule.dtstart ?? input.dueDate;
  if (origin === null) {
    return { ok: false, reason: 'missing_anchor' };
  }
  const rule = parsed.rule.dtstart === null ? { ...parsed.rule, dtstart: origin } : parsed.rule;
  const dues = occurrencesInRange(rule, input.timeZone, input.from, input.to);
  return {
    ok: true,
    occurrences: dues.map((dueDate) => ({
      dueDate,
      startDate: shiftStart(input.startDate, input.dueDate ?? origin, dueDate),
    })),
  };
}

function shiftStart(start: string | null, previousDue: string | null, nextDue: string): string | null {
  if (start === null || previousDue === null) {
    return null;
  }
  const delta = Date.parse(nextDue) - Date.parse(previousDue);
  if (Number.isNaN(delta) || Number.isNaN(Date.parse(start))) {
    return null;
  }
  return new Date(Date.parse(start) + delta).toISOString();
}
