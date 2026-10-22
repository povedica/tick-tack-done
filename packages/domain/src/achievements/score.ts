/** Control v3: current state, never lifetime experience points. */
export const FOCUS_WEEKLY_TARGET = 10;
export interface ControlDeductionReason {
  readonly code: 'overdue' | 'on_time' | 'habits' | 'focus' | 'usage';
  readonly params: Readonly<Record<string, number>>;
}
export interface ControlInput {
  readonly enabled?: boolean;
  readonly hasDatedTasks?: boolean;
  readonly planned: number;
  readonly onTime: number;
  readonly overdue: { readonly under7: number; readonly d8to30: number; readonly over30: number };
  readonly habitDone: number;
  readonly habitExpected: number;
  readonly pomodoros: number;
  readonly lifetimePomodoros: number;
  readonly usageDays: number;
}
export function controlScore(input: ControlInput) {
  const { planned, onTime, overdue } = input;
  const open = overdue.under7 + overdue.d8to30 + overdue.over30;
  const tasksConfigured = input.hasDatedTasks === true || planned > 0 || open > 0;
  const compliance = planned === 0 ? 25 : (25 * (Math.min(onTime, planned) + 2)) / (planned + 3);
  const penalty = overdue.under7 + 2 * overdue.d8to30 + 3 * overdue.over30;
  const arrears = Math.max(0, 25 - penalty);
  const habitsConfigured = input.habitExpected > 0;
  const focusConfigured = input.lifetimePomodoros > 0;
  const habits = habitsConfigured
    ? (20 * (Math.min(input.habitDone, input.habitExpected) + 1)) / (input.habitExpected + 2)
    : 0;
  const focus = focusConfigured ? 20 * Math.min(1, input.pomodoros / FOCUS_WEEKLY_TARGET) : 0;
  const usage = (10 * Math.min(7, Math.max(0, input.usageDays))) / 7;
  const max =
    (tasksConfigured ? 50 : 0) + (habitsConfigured ? 20 : 0) + (focusConfigured ? 20 : 0) + 10;
  const hasData = tasksConfigured || habitsConfigured || focusConfigured || input.usageDays > 0;
  const enabled = input.enabled !== false;
  const score =
    !enabled || !hasData
      ? null
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (100 * ((tasksConfigured ? compliance + arrears : 0) + habits + focus + usage)) / max,
            ),
          ),
        );
  const components = {
    tasks: {
      earned: tasksConfigured ? compliance + arrears : 0,
      max: 50,
      configured: tasksConfigured,
      cumplimiento: { earned: tasksConfigured ? compliance : 0, max: 25, onTime, planned },
      atrasadas: { earned: tasksConfigured ? arrears : 0, max: 25, open, byAge: overdue, penalty },
    },
    habits: {
      earned: habits,
      max: 20,
      done: input.habitDone,
      expected: input.habitExpected,
      configured: habitsConfigured,
    },
    focus: {
      earned: focus,
      max: 20,
      pomodoros: input.pomodoros,
      target: FOCUS_WEEKLY_TARGET,
      configured: focusConfigured,
    },
    usage: { earned: usage, max: 10, days: input.usageDays, windowDays: 7, configured: true },
  };
  const deductions: { lost: number; text: string; reason: ControlDeductionReason }[] = [
    {
      lost: tasksConfigured ? 25 - arrears : 0,
      text: `${String(open)} vencidas${open === overdue.over30 ? ' de más de 30 días' : ''}: -${String(Math.min(25, penalty))} en Tareas`,
      reason: {
        code: 'overdue',
        params: { count: open, oldCount: overdue.over30, points: Math.min(25, penalty) },
      },
    },
    {
      lost: tasksConfigured ? 25 - compliance : 0,
      text: `Tareas a tiempo: ${String(onTime)}/${String(planned)} en los últimos 14 días`,
      reason: { code: 'on_time', params: { actual: onTime, target: planned } },
    },
    {
      lost: habitsConfigured ? 20 - habits : 0,
      text: `Hábitos: ${String(input.habitDone)}/${String(input.habitExpected)} días cumplidos`,
      reason: { code: 'habits', params: { actual: input.habitDone, target: input.habitExpected } },
    },
    {
      lost: focusConfigured ? 20 - focus : 0,
      text: `Foco: ${String(input.pomodoros)}/${String(FOCUS_WEEKLY_TARGET)} pomodoros esta semana`,
      reason: { code: 'focus', params: { actual: input.pomodoros, target: FOCUS_WEEKLY_TARGET } },
    },
    {
      lost: 10 - usage,
      text: `Uso: ${String(input.usageDays)}/7 días registrados`,
      reason: { code: 'usage', params: { actual: input.usageDays, target: 7 } },
    },
  ];
  deductions.sort((a, b) => b.lost - a.lost);
  const top = score === null || deductions[0]?.lost === 0 ? null : deductions[0];
  return {
    enabled,
    score,
    label: score === null ? null : score >= 75 ? 'Al día' : score >= 50 ? 'Justo' : 'Atrasado',
    components: enabled ? components : null,
    topDeduction: top?.text ?? null,
    topDeductionReason: top?.reason ?? null,
  };
}
export type ControlScore = ReturnType<typeof controlScore>;
