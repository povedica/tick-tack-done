import { describe, expect, it } from 'vitest';
import { countdownDaysLabel, nextCountdownOccurrence } from './countdowns.js';

describe('countdowns', () => {
  it('RF-2411: computes future, today and past labels using civil dates', () => {
    expect(
      countdownDaysLabel(
        { targetDate: '2026-10-20', repeatRule: 'none', dayMode: 'standard' },
        '2026-10-19',
        'Europe/Madrid',
      ),
    ).toMatchObject({ kind: 'until', days: 1 });
    expect(
      countdownDaysLabel(
        { targetDate: '2026-10-19', repeatRule: 'none', dayMode: 'standard' },
        '2026-10-19',
        'Europe/Madrid',
      ),
    ).toMatchObject({ kind: 'today', days: 0 });
    expect(
      countdownDaysLabel(
        { targetDate: '2026-10-18', repeatRule: 'none', dayMode: 'plus_one' },
        '2026-10-19',
        'Europe/Madrid',
      ),
    ).toMatchObject({ kind: 'since', days: 2 });
  });

  it('RF-2413: handles February 29 birthdays and monthly last days', () => {
    expect(nextCountdownOccurrence('2024-02-29', 'yearly', 'standard', '2025-03-01', 'Europe/Madrid')).toBe(
      '2026-02-28',
    );
    expect(nextCountdownOccurrence('2026-01-31', 'monthly', 'standard', '2026-02-01', 'Europe/Madrid')).toBe(
      '2026-02-28',
    );
  });

  it('RF-2412: resolves a recurring countdown to today or its next occurrence', () => {
    expect(nextCountdownOccurrence('2026-10-19', 'yearly', 'standard', '2026-10-19', 'Europe/Madrid')).toBe(
      '2026-10-19',
    );
    expect(nextCountdownOccurrence('2026-10-19', 'yearly', 'standard', '2026-10-20', 'Europe/Madrid')).toBe(
      '2027-10-19',
    );
  });
});
