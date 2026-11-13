import type { DaySummary } from './year-index';

/** Server token for a missing or invalid project/subscription color. */
export const SUMMARY_ACCENT = 'accent';
/** Same paint the local index uses for that token. */
export const PAINT_ACCENT = 'var(--accent)';

export interface SummaryCell {
  readonly n: number;
  readonly c: readonly string[];
}

export function paintColor(color: string): string {
  return color === SUMMARY_ACCENT ? PAINT_ACCENT : color;
}

/** `summary.days` → the map YearBoard already paints. Missing days stay absent. */
export function dayIndexFromSummary(
  days: Readonly<Record<string, SummaryCell>>,
): ReadonlyMap<string, DaySummary> {
  const index = new Map<string, DaySummary>();
  for (const [key, cell] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(cell.n)) {
      continue;
    }
    index.set(key, {
      count: cell.n,
      colors: cell.c.map(paintColor),
    });
  }
  return index;
}
