import type { Priority } from '../types';
import { formatInTimeZone } from 'date-fns-tz';

function dayKey(iso: string, timeZone: string): string | null {
  try {
    return formatInTimeZone(iso, timeZone, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

/** RF-2102. Inputs are already loaded. This function does not query anything. */
export interface DashboardTask {
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly dueDate: string | null;
  readonly status: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly listId: string;
  readonly listName: string;
  readonly tagNames: readonly string[];
}

export interface DashboardHabit {
  readonly name: string;
  readonly targetCount: number;
  readonly checks: readonly { readonly date: string; readonly count: number }[];
}

export interface DashboardSnapshot {
  readonly completed_today: number;
  readonly completed_week: number;
  readonly completed_previous_week: number;
  readonly trend: number;
  readonly overdue: number;
  readonly next_7_days: number;
  readonly created: number;
  readonly completed: number;
  readonly net: number;
  readonly habit_percent: number;
  readonly by_list: readonly {
    readonly list_id: string;
    readonly name: string;
    readonly active: number;
  }[];
  readonly by_tag: readonly { readonly name: string; readonly active: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Canonical overdue rows already classified by task-local calendar age in the API. */
export function overdueAgeGroups(
  tasks: readonly { list_id: string | null; name: string; days_overdue: number }[],
) {
  const groups = new Map<
    string | null,
    {
      list_id: string | null;
      name: string;
      total: number;
      under_7: number;
      days_7_30: number;
      over_30: number;
    }
  >();
  for (const task of tasks) {
    const group = groups.get(task.list_id) ?? {
      list_id: task.list_id,
      name: task.list_id === null ? 'Sin lista' : task.name,
      total: 0,
      under_7: 0,
      days_7_30: 0,
      over_30: 0,
    };
    group.total += 1;
    if (task.days_overdue < 7) group.under_7 += 1;
    else if (task.days_overdue <= 30) group.days_7_30 += 1;
    else group.over_30 += 1;
    groups.set(task.list_id, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.over_30 - a.over_30 ||
      b.days_7_30 - a.days_7_30 ||
      b.total - a.total ||
      a.name.localeCompare(b.name, 'es'),
  );
}

export function dashboardSnapshot(
  tasks: readonly DashboardTask[],
  habits: readonly DashboardHabit[],
  nowIso: string,
  timeZone = 'UTC',
): DashboardSnapshot {
  const now = Date.parse(nowIso);
  const todayKey = dayKey(nowIso, timeZone) ?? nowIso.slice(0, 10);
  const weekStart = now - 7 * DAY_MS;
  const previousStart = now - 14 * DAY_MS;
  let completedToday = 0;
  let completedWeek = 0;
  let completedPrevious = 0;
  let overdue = 0;
  let next7 = 0;
  let created = 0;
  let completed = 0;
  const lists = new Map<string, { name: string; active: number }>();
  const tags = new Map<string, number>();
  for (const task of tasks) {
    const createdMs = Date.parse(task.createdAt);
    if (!Number.isNaN(createdMs) && createdMs >= weekStart && createdMs <= now) {
      created += 1;
    }
    const completedMs = task.completedAt === null ? Number.NaN : Date.parse(task.completedAt);
    if (!Number.isNaN(completedMs)) {
      if (task.completedAt !== null && dayKey(task.completedAt, timeZone) === todayKey) {
        completedToday += 1;
      }
      if (completedMs >= weekStart && completedMs <= now) {
        completedWeek += 1;
        completed += 1;
      } else if (completedMs >= previousStart && completedMs < weekStart) {
        completedPrevious += 1;
      }
    }
    if (task.status === 'active' && task.dueDate !== null) {
      const due = Date.parse(task.dueDate);
      if (!Number.isNaN(due) && due < now) {
        overdue += 1;
      }
      if (!Number.isNaN(due) && due >= now && due <= now + 7 * DAY_MS) {
        next7 += 1;
      }
    }
    if (task.status === 'active') {
      const list = lists.get(task.listId) ?? { name: task.listName, active: 0 };
      list.active += 1;
      lists.set(task.listId, list);
      for (const tag of task.tagNames) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
  }
  return {
    completed_today: completedToday,
    completed_week: completedWeek,
    completed_previous_week: completedPrevious,
    trend: completedWeek - completedPrevious,
    overdue,
    next_7_days: next7,
    created,
    completed,
    net: completed - created,
    habit_percent: habitPercent(habits, todayKey),
    by_list: [...lists.entries()]
      .map(([listId, value]) => ({ list_id: listId, name: value.name, active: value.active }))
      .sort((left, right) => right.active - left.active),
    by_tag: [...tags.entries()]
      .map(([name, active]) => ({ name, active }))
      .sort((left, right) => right.active - left.active),
  };
}

export function habitPercent(habits: readonly DashboardHabit[], todayKey: string): number {
  if (habits.length === 0) {
    return 0;
  }
  let met = 0;
  for (const habit of habits) {
    const today = habit.checks.find((check) => check.date === todayKey);
    if ((today?.count ?? 0) >= habit.targetCount && habit.targetCount > 0) {
      met += 1;
    }
  }
  return Math.round((met / habits.length) * 100);
}

export interface ProductivityInput {
  readonly snapshot: DashboardSnapshot;
  readonly focusMinutes: number;
}

/** RF-1601. The productivity panel is the dashboard snapshot plus focus minutes. */
export function productivityPanel(input: ProductivityInput): ProductivityInput {
  return input;
}

export type ReportTone = 'honesto' | 'neutro' | 'motivador';

export interface WeeklyNarrative {
  readonly tone: ReportTone;
  readonly summary: string;
  readonly observations: readonly string[];
  readonly weak: boolean;
}

/**
 * RF-2201. Deterministic text. A weak week is said plainly when the tone is honest.
 * Focus minutes are included only when the caller already has them (V2).
 */
export function weeklyNarrative(
  snapshot: DashboardSnapshot,
  tone: ReportTone,
  focusMinutes: number | null,
  upcomingExternal: number | null = null,
): WeeklyNarrative {
  const weak = snapshot.completed < snapshot.created || snapshot.overdue > snapshot.completed;
  const focus = focusMinutes === null ? '' : ` Tiempo de foco: ${String(focusMinutes)} minutos.`;
  const external =
    upcomingExternal === null
      ? ''
      : ` Eventos externos en los próximos 7 días: ${String(upcomingExternal)}.`;
  const facts = `Completadas ${String(snapshot.completed)} de ${String(snapshot.created)} creadas. Vencidas arrastradas: ${String(snapshot.overdue)}. Hábitos de la semana: ${String(snapshot.habit_percent)} %. Tendencia frente a la semana anterior: ${String(snapshot.trend)}.${focus}${external}`;
  const observations = observationsFor(snapshot, weak);
  if (tone === 'motivador') {
    return {
      tone,
      weak,
      summary: weak
        ? `La semana tuvo huecos, y el siguiente paso está claro. ${facts}`
        : `Buen ritmo. ${facts}`,
      observations,
    };
  }
  if (tone === 'neutro') {
    return { tone, weak, summary: facts, observations };
  }
  return {
    tone,
    weak,
    summary: weak ? `La semana fue floja. ${facts}` : `La semana fue sólida. ${facts}`,
    observations,
  };
}

function observationsFor(snapshot: DashboardSnapshot, weak: boolean): string[] {
  const lines: string[] = [];
  if (snapshot.overdue > 0) {
    lines.push(`Replanifica ${String(snapshot.overdue)} tareas vencidas antes de abrir otras.`);
  }
  if (snapshot.habit_percent < 50) {
    lines.push('El cumplimiento de hábitos de hoy está por debajo de la mitad.');
  }
  if (snapshot.net < 0) {
    lines.push('Entraron más tareas de las que salieron. Recorta la bandeja.');
  }
  if (!weak && lines.length === 0) {
    lines.push('Mantén el mismo corte de la semana: completar antes de capturar.');
  }
  return lines.slice(0, 3);
}

export function isReportTone(value: string): value is ReportTone {
  return value === 'honesto' || value === 'neutro' || value === 'motivador';
}

export function priorityWeight(priority: Priority): number {
  switch (priority) {
    case 'high':
      return 4;
    case 'medium':
      return 3;
    case 'low':
      return 1;
    default:
      return 0;
  }
}
