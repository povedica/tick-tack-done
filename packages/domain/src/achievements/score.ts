/** RF-1602 / RF-2321. One achievement score for the garden and Estadísticas. */

export interface AchievementInput {
  readonly enabled: boolean;
  /** Legacy weekly KPIs (RF-1602). Used when detailed counters are omitted. */
  readonly completedWeek?: number;
  readonly habitPercent?: number;
  readonly focusDays?: number;
  /** Detailed counters for the public formula (RF-2321). */
  readonly completedOnTime?: number;
  readonly completedLate?: number;
  readonly priorityPoints?: number;
  readonly pomodoros?: number;
  readonly habitCheckIns?: number;
  readonly overdueCount?: number;
}

export interface AchievementLevel {
  readonly id: string;
  readonly threshold: number;
}

/** Twelve named levels. Thresholds keep RF-1602 names at the same score breakpoints. */
export const ACHIEVEMENT_LEVELS: readonly AchievementLevel[] = [
  { id: 'inicio', threshold: 0 },
  { id: 'arranque', threshold: 20 },
  { id: 'ritmo', threshold: 50 },
  { id: 'en marcha', threshold: 80 },
  { id: 'dedicado', threshold: 120 },
  { id: 'firme', threshold: 160 },
  { id: 'constante', threshold: 200 },
  { id: 'solido', threshold: 280 },
  { id: 'maestro', threshold: 400 },
  { id: 'experto', threshold: 600 },
  { id: 'leyenda', threshold: 900 },
  { id: 'elite', threshold: 1400 },
] as const;

export const ACHIEVEMENT_FORMULA = {
  on_time_base: 10,
  late_base: 5,
  priority_high_bonus: 15,
  priority_medium_bonus: 5,
  priority_low_bonus: 2,
  pomodoro: 15,
  habit_check_in: 8,
  overdue_penalty: 5,
} as const;

export interface AchievementScore {
  readonly enabled: boolean;
  readonly score: number | null;
  readonly level: string | null;
  readonly level_index: number | null;
  readonly next_threshold: number | null;
  readonly progress_to_next: number | null;
  readonly formula: {
    readonly on_time_points: number;
    readonly late_points: number;
    readonly priority_points: number;
    readonly pomodoro_points: number;
    readonly habit_points: number;
    readonly overdue_penalty: number;
    readonly weights: typeof ACHIEVEMENT_FORMULA;
  } | null;
}

export function achievementScore(input: AchievementInput): AchievementScore {
  if (!input.enabled) {
    return {
      enabled: false,
      score: null,
      level: null,
      level_index: null,
      next_threshold: null,
      progress_to_next: null,
      formula: null,
    };
  }
  const detailed = hasDetailed(input);
  const onTime = input.completedOnTime ?? 0;
  const late = input.completedLate ?? 0;
  const priorityPoints = input.priorityPoints ?? 0;
  const pomodoros = input.pomodoros ?? 0;
  const habits = input.habitCheckIns ?? 0;
  const overdue = input.overdueCount ?? 0;

  let score: number;
  let onTimePoints = 0;
  let latePoints = 0;
  let pomodoroPoints = 0;
  let habitPoints = 0;
  let overduePenalty = 0;

  if (detailed) {
    onTimePoints = onTime * ACHIEVEMENT_FORMULA.on_time_base;
    latePoints = late * ACHIEVEMENT_FORMULA.late_base;
    pomodoroPoints = pomodoros * ACHIEVEMENT_FORMULA.pomodoro;
    habitPoints = habits * ACHIEVEMENT_FORMULA.habit_check_in;
    overduePenalty = overdue * ACHIEVEMENT_FORMULA.overdue_penalty;
    score = Math.max(
      0,
      onTimePoints + latePoints + priorityPoints + pomodoroPoints + habitPoints - overduePenalty,
    );
  } else {
    const completedWeek = input.completedWeek ?? 0;
    const habitPercent = input.habitPercent ?? 0;
    const focusDays = input.focusDays ?? 0;
    score = completedWeek * 10 + Math.round(habitPercent / 10) + focusDays * 5;
    onTimePoints = completedWeek * 10;
    habitPoints = Math.round(habitPercent / 10);
    pomodoroPoints = focusDays * 5;
  }

  const levelIndex = levelIndexFor(score);
  const level = ACHIEVEMENT_LEVELS[levelIndex];
  const next = ACHIEVEMENT_LEVELS[levelIndex + 1];
  const progress =
    next === undefined || level === undefined
      ? 100
      : Math.min(
          100,
          Math.round(
            ((score - level.threshold) / Math.max(1, next.threshold - level.threshold)) * 100,
          ),
        );

  return {
    enabled: true,
    score,
    level: level?.id ?? 'inicio',
    level_index: levelIndex,
    next_threshold: next?.threshold ?? null,
    progress_to_next: next === undefined ? 100 : progress,
    formula: {
      on_time_points: onTimePoints,
      late_points: latePoints,
      priority_points: detailed ? priorityPoints : 0,
      pomodoro_points: pomodoroPoints,
      habit_points: habitPoints,
      overdue_penalty: overduePenalty,
      weights: ACHIEVEMENT_FORMULA,
    },
  };
}

export function priorityBonus(priority: string): number {
  switch (priority) {
    case 'high':
      return ACHIEVEMENT_FORMULA.priority_high_bonus;
    case 'medium':
      return ACHIEVEMENT_FORMULA.priority_medium_bonus;
    case 'low':
      return ACHIEVEMENT_FORMULA.priority_low_bonus;
    default:
      return 0;
  }
}

function hasDetailed(input: AchievementInput): boolean {
  return (
    input.completedOnTime !== undefined ||
    input.completedLate !== undefined ||
    input.priorityPoints !== undefined ||
    input.pomodoros !== undefined ||
    input.habitCheckIns !== undefined ||
    input.overdueCount !== undefined
  );
}

function levelIndexFor(score: number): number {
  let index = 0;
  for (let i = 0; i < ACHIEVEMENT_LEVELS.length; i += 1) {
    const level = ACHIEVEMENT_LEVELS[i];
    if (level !== undefined && score >= level.threshold) {
      index = i;
    }
  }
  return index;
}
