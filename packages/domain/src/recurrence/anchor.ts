import { formatInTimeZone } from 'date-fns-tz';
import { firstAfter } from './expand';
import { parseRepeatRule } from './rule';
export interface RecurrenceAnchorWarning {
  readonly code: 'anchor_outside_rule';
  readonly next_matching: string;
}
/** RF-701: warn without changing the user's chosen anchor or blocking capture. */
export function recurrenceAnchorWarning(input: {
  readonly repeatRule: string | null;
  readonly dueDate: string | null;
  readonly timeZone: string;
}): RecurrenceAnchorWarning | null {
  if (input.repeatRule === null || input.dueDate === null) return null;
  const parsed = parseRepeatRule(input.repeatRule);
  const anchor = Date.parse(input.dueDate);
  if (!parsed.ok || !Number.isFinite(anchor)) return null;
  const rule =
    parsed.rule.dtstart === null ? { ...parsed.rule, dtstart: input.dueDate } : parsed.rule;
  const first = firstAfter(rule, input.timeZone, new Date(anchor - 1).toISOString());
  if (first === null || Date.parse(first) === anchor) return null;
  return {
    code: 'anchor_outside_rule',
    next_matching: formatInTimeZone(first, input.timeZone, 'yyyy-MM-dd'),
  };
}
