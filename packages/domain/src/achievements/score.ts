/** RF-1602. The score can be switched off. It does not invent a second KPI formula. */

export interface AchievementInput {
  readonly enabled: boolean;
  readonly completedWeek: number;
  readonly habitPercent: number;
  readonly focusDays: number;
}

export interface AchievementScore {
  readonly enabled: boolean;
  readonly score: number | null;
  readonly level: string | null;
}

export function achievementScore(input: AchievementInput): AchievementScore {
  if (!input.enabled) {
    return { enabled: false, score: null, level: null };
  }
  const score =
    input.completedWeek * 10 + Math.round(input.habitPercent / 10) + input.focusDays * 5;
  return { enabled: true, score, level: levelFor(score) };
}

function levelFor(score: number): string {
  if (score >= 200) {
    return 'constante';
  }
  if (score >= 80) {
    return 'en marcha';
  }
  if (score >= 20) {
    return 'arranque';
  }
  return 'inicio';
}
