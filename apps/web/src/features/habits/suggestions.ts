import type { CreateHabitBody } from '@reflexionia/sdk';
import { HABIT_WEEKDAYS, type HabitWeekday } from '@reflexionia/domain';
import type { Messages } from '../../i18n';

export interface HabitDraft {
  readonly name: string;
  readonly period: 'day' | 'week';
  readonly times: number;
  readonly days: readonly HabitWeekday[];
  readonly reminderTime: string;
}

export interface HabitSuggestion {
  readonly id: string;
  readonly label: keyof Messages;
  readonly period: 'day' | 'week';
  readonly times: number;
  readonly days: readonly HabitWeekday[];
  readonly reminderTime: string;
}

export const HABIT_SUGGESTIONS: readonly HabitSuggestion[] = [
  {
    id: 'water',
    label: 'suggestWater',
    period: 'day',
    times: 8,
    days: HABIT_WEEKDAYS,
    reminderTime: '09:00',
  },
  {
    id: 'walk',
    label: 'suggestWalk',
    period: 'day',
    times: 1,
    days: HABIT_WEEKDAYS,
    reminderTime: '08:00',
  },
  {
    id: 'read',
    label: 'suggestRead',
    period: 'day',
    times: 1,
    days: HABIT_WEEKDAYS,
    reminderTime: '21:00',
  },
  {
    id: 'exercise',
    label: 'suggestExercise',
    period: 'week',
    times: 3,
    days: ['monday', 'wednesday', 'friday'],
    reminderTime: '18:00',
  },
];

/** RF-1301. A daily counter stores the same number in both goal fields. */
export function buildHabitBody(draft: HabitDraft): CreateHabitBody {
  const times = Math.max(1, Math.trunc(draft.times));
  const reminder = draft.reminderTime.trim();
  return {
    name: draft.name.trim(),
    goal: {
      times_per_period: times,
      period: draft.period,
      target_count: draft.period === 'day' ? times : 1,
    },
    frequency: [...draft.days],
    ...(reminder.length === 0 ? {} : { reminder_time: reminder }),
  };
}

export function canCreateHabit(draft: HabitDraft): boolean {
  if (draft.name.trim().length === 0 || draft.days.length === 0) {
    return false;
  }
  if (!Number.isInteger(draft.times) || draft.times < 1) {
    return false;
  }
  return draft.period === 'day' || draft.times <= draft.days.length;
}
