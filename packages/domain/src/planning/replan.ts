import {
  civilDateKey,
  dayLoad,
  isBusinessDay,
  shiftCivilDate,
  type DayLoadEvent,
  type DayLoadSettings,
  type DayLoadTask,
} from './day-load';

export type ReplanDecisionName = 'skip' | 'plan_day' | 'someday' | 'cancel';

export interface ReplanCandidate {
  readonly id: string;
  readonly title: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly durationMinutes: number | null;
  readonly isAllDay: boolean;
  readonly eveningOnly: boolean;
}

export interface ReplanSuggestion {
  readonly taskId: string;
  readonly decision: ReplanDecisionName;
  readonly targetDate: string | null;
  readonly reason: string;
}

export interface DayOccupancy {
  readonly tasks: readonly DayLoadTask[];
  readonly events: readonly DayLoadEvent[];
}

/**
 * RF-2670. Deadline today stays. Deadline tomorrow moves to tomorrow.
 * Anything else goes to the first business day within seven days that still fits.
 */
export function proposeReplan(input: {
  readonly today: string;
  readonly timeZone: string;
  readonly candidates: readonly ReplanCandidate[];
  readonly occupancy: Readonly<Record<string, DayOccupancy>>;
  readonly settings: DayLoadSettings;
}): readonly ReplanSuggestion[] {
  const staying: ReplanSuggestion[] = [];
  const moving: ReplanCandidate[] = [];
  for (const task of input.candidates) {
    const deadline = task.dueDate === null ? null : civilDateKey(task.dueDate, task.timeZone);
    if (deadline === input.today) {
      staying.push({
        taskId: task.id,
        decision: 'skip',
        targetDate: input.today,
        reason: 'La fecha límite es hoy, así que se queda.',
      });
      continue;
    }
    moving.push(task);
  }
  const placed = new Map<string, DayLoadTask[]>();
  const suggestions: ReplanSuggestion[] = [];
  const ordered = [...moving].sort((left, right) => left.id.localeCompare(right.id));
  for (const task of ordered) {
    const deadline = task.dueDate === null ? null : civilDateKey(task.dueDate, task.timeZone);
    const tomorrow = shiftCivilDate(input.today, 1);
    if (deadline === tomorrow) {
      suggestions.push(place(task, tomorrow, placed, 'La fecha límite es mañana.'));
      continue;
    }
    const target = firstFit(input, task, placed, tomorrow);
    suggestions.push(target);
  }
  return [...staying, ...suggestions];
}

function firstFit(
  input: {
    readonly today: string;
    readonly timeZone: string;
    readonly occupancy: Readonly<Record<string, DayOccupancy>>;
    readonly settings: DayLoadSettings;
  },
  task: ReplanCandidate,
  placed: Map<string, DayLoadTask[]>,
  tomorrow: string,
): ReplanSuggestion {
  const tomorrowLoad = projected(input, tomorrow, placed, task);
  if (tomorrowLoad.status !== 'overload') {
    return place(task, tomorrow, placed, 'Mañana todavía cabe.');
  }
  for (let offset = 2; offset <= 7; offset += 1) {
    const date = shiftCivilDate(input.today, offset);
    if (!isBusinessDay(date)) {
      continue;
    }
    const load = projected(input, date, placed, task);
    if (load.status !== 'overload') {
      return place(
        task,
        date,
        placed,
        `Mañana no cabe. El primer hueco laborable es el ${date}.`,
      );
    }
  }
  const fallback = shiftCivilDate(input.today, 7);
  return place(task, fallback, placed, 'Ningún día de la próxima semana queda por debajo del 100 %.');
}

function place(
  task: ReplanCandidate,
  date: string,
  placed: Map<string, DayLoadTask[]>,
  reason: string,
): ReplanSuggestion {
  const bucket = placed.get(date) ?? [];
  bucket.push(asLoadTask(task));
  placed.set(date, bucket);
  return { taskId: task.id, decision: 'plan_day', targetDate: date, reason };
}

function projected(
  input: {
    readonly timeZone: string;
    readonly occupancy: Readonly<Record<string, DayOccupancy>>;
    readonly settings: DayLoadSettings;
  },
  date: string,
  placed: Map<string, DayLoadTask[]>,
  extra: ReplanCandidate,
) {
  const base = input.occupancy[date] ?? { tasks: [], events: [] };
  return dayLoad({
    date,
    timeZone: input.timeZone,
    tasks: [...base.tasks, ...(placed.get(date) ?? []), asLoadTask(extra)],
    events: base.events,
    settings: input.settings,
  });
}

function asLoadTask(task: ReplanCandidate): DayLoadTask {
  return {
    id: task.id,
    durationMinutes: task.durationMinutes,
    isAllDay: task.isAllDay,
    eveningOnly: task.eveningOnly,
    status: 'active',
    parentId: null,
  };
}
