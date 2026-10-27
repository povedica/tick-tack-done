/** Same codes as recurrence weekdays. Index 0 is Sunday, matching `Date.getUTCDay`. */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayCodes(days: readonly number[]): WeekdayCode[] {
  const present = new Set(days.filter((day) => day >= 0 && day <= 6));
  return DISPLAY_ORDER.filter((day) => present.has(day)).map((day) => WEEKDAY_CODES[day]);
}

/** Returns null when a code is unknown. Duplicates collapse. */
export function weekdayNumbers(codes: readonly string[]): number[] | null {
  const found: number[] = [];
  for (const code of codes) {
    const index = WEEKDAY_CODES.indexOf(code as WeekdayCode);
    if (index < 0) {
      return null;
    }
    if (!found.includes(index)) {
      found.push(index);
    }
  }
  return found.sort((left, right) => left - right);
}
