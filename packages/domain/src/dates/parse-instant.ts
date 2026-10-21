import { instantFromWall } from './zoned';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ParsedTaskInstant =
  | { readonly ok: true; readonly iso: string; readonly dateOnly: boolean }
  | { readonly ok: false; readonly reason: 'invalid_date' };

/**
 * TTD-AUD-55: `YYYY-MM-DD` is local midnight in `timeZone` (all-day candidate).
 * Full ISO strings keep their absolute instant; clock-without-offset is accepted
 * as written by `Date` (UTC for date-only already handled above).
 */
export function parseTaskInstant(value: string, timeZone: string): ParsedTaskInstant {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly !== null) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const iso = instantFromWall({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
    if (iso === null) {
      return { ok: false, reason: 'invalid_date' };
    }
    return { ok: true, iso, dateOnly: true };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, reason: 'invalid_date' };
  }
  return { ok: true, iso: parsed.toISOString(), dateOnly: false };
}
