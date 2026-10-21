import type { SchemaObject } from '@nestjs/swagger';
const number: SchemaObject = { type: 'number' };
const integer: SchemaObject = { type: 'integer' };
const string: SchemaObject = { type: 'string' };
const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const date = { type: 'string', format: 'date' } satisfies SchemaObject;
const rate = object({ date, rate: nullable(number), completed: integer, planned: integer });
const trend = object({ date, completed: integer, created: integer });
const distribution = array(
  object({ key: string, label: string, color: nullable(string), value: number, percent: number }),
);
const heatCell = object({ date, minutes: number, pomodoros: integer, level: integer });
const day = object({
  date,
  completed: integer,
  created: integer,
  planned: integer,
  completion_completed: integer,
  focus_seconds: number,
  focus_minutes: number,
  pomodoros: integer,
  habit_percent: nullable(number),
});
const component = { earned: number, max: number, configured: { type: 'boolean' } as const };
export const achievementSchema = object({
  enabled: { type: 'boolean' },
  score: nullable({ ...integer, minimum: 0, maximum: 100 }),
  label: nullable(string),
  components: nullable(
    object({
      tasks: object({
        ...component,
        cumplimiento: object({ earned: number, max: number, onTime: integer, planned: integer }),
        atrasadas: object({
          earned: number,
          max: number,
          open: integer,
          penalty: number,
          byAge: object({ under7: integer, d8to30: integer, over30: integer }),
        }),
      }),
      habits: object({ ...component, done: integer, expected: integer }),
      focus: object({ ...component, pomodoros: integer, target: integer }),
      usage: object({ ...component, days: integer, windowDays: integer }),
    }),
  ),
  topDeduction: {
    ...nullable(string),
    deprecated: true,
    description: 'Legacy Spanish text. Use topDeductionReason for localized presentation.',
  },
  topDeductionReason: nullable(
    object({
      code: { type: 'string', enum: ['overdue', 'on_time', 'habits', 'focus', 'usage'] },
      params: {
        type: 'object',
        additionalProperties: number,
        description: 'overdue: count, oldCount, points; other codes: actual, target.',
      },
    }),
  ),
  history: array(object({ date, score: nullable(number) })),
});
export const overviewSchema = object({
  summary: object({
    completed: integer,
    completed_previous: integer,
    completed_delta_percent: nullable(number),
    completion_rate: nullable(number),
    completion_rate_delta_pt: nullable(number),
    completion_completed: integer,
    completion_planned: integer,
    focus_minutes: number,
    focus_minutes_delta_percent: nullable(number),
    pomodoros: integer,
    habit_percent: nullable(number),
    habit_done: integer,
    habit_expected: integer,
    habit_delta_pt: nullable(number),
    streak_current: integer,
    streak_best_year: integer,
    achievement: achievementSchema,
  }),
  trend: array(trend),
  daily: array(day),
  best_moment: object({
    by_weekday: array(object({ weekday: integer, completed: integer })),
    by_band: object({ morning: integer, afternoon: integer, evening: integer }),
  }),
  completion_series: array(rate),
  phrase: string,
});
export const tasksSchema = object({
  trend: array(trend),
  daily: array(day),
  completion_rate: object({ completed: integer, planned: integer, rate: nullable(number) }),
  completion_series: array(rate),
  by_list: distribution,
  by_tag: distribution,
  by_priority: distribution,
  punctuality: object({
    sample: integer,
    delay_cap_days: number,
    capped_samples: integer,
    on_time: integer,
    late: integer,
    on_time_percent: nullable(number),
    mean_delay_days: nullable(number),
    median_delay_days: nullable(number),
  }),
  age_on_complete: object({
    mean_days: nullable(number),
    median_days: nullable(number),
    sample: integer,
  }),
  overdue_stock: array(object({ date, under_7: integer, days_7_30: integer, over_30: integer })),
});
export const focusSchema = object({
  focus_minutes: number,
  focus_seconds: number,
  pomodoros: integer,
  completed_sessions: integer,
  abandoned_sessions: integer,
  completed_percent: nullable(number),
  interruptions_per_session: number,
  trend: array(object({ date, minutes: number, pomodoros: integer })),
  best_hour: nullable(integer),
  hours: array(object({ hour: integer, minutes: number })),
  timeline_day: date,
  period_timeline: array(
    object({
      id: string,
      start: { type: 'string', format: 'date-time' },
      end: nullable({ type: 'string', format: 'date-time' }),
      minutes: number,
      task_title: nullable(string),
      completed: { type: 'boolean' },
    }),
  ),
  timeline: array(
    object({
      id: string,
      start: { type: 'string', format: 'date-time' },
      end: nullable({ type: 'string', format: 'date-time' }),
      minutes: number,
      task_title: nullable(string),
      completed: { type: 'boolean' },
    }),
  ),
  heatmap: array(heatCell),
  by_list: distribution,
  by_tag: distribution,
  by_task: distribution,
});
const habit = object({
  id: string,
  name: string,
  icon: nullable(string),
  color: nullable(string),
  streak_current: integer,
  streak_best: integer,
  percent: number,
  done: integer,
  expected: integer,
  heatmap: array(
    object({
      date,
      count: integer,
      met: { type: 'boolean' },
      scheduled: { type: 'boolean' },
      level: integer,
    }),
  ),
  weakest_weekday: nullable(integer),
});
export const habitsSchema = object({
  habits: array(habit),
  ranking_best: array(habit),
  ranking_worst: array(habit),
  global_series: array(object({ date, percent: nullable(number) })),
});
