import { humanDate } from '../dates/presentation';
import type { Priority, TaskStatus } from '../types';

/** A review cap never hides work that is already due today. */
export type PlanSection = 'today_timed' | 'today' | 'overdue' | 'inbox' | 'undated';

export type PlanReason = 'due_today_at' | 'due_today' | 'overdue' | 'inbox' | 'undated';

export type PlanDecisionKind =
  'done' | 'plan_day' | 'later' | 'cancel' | 'trash' | 'skip' | 'someday';

export interface PlanSources {
  readonly today: boolean;
  readonly overdue: boolean;
  readonly inbox: boolean;
  readonly undated: boolean;
}

export interface PlanTaskInput {
  readonly id: string;
  readonly title: string;
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly status: TaskStatus;
  readonly kind: 'task' | 'note';
  readonly parentId: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly inbox: boolean;
  readonly updatedAt: string;
  readonly createdAt: string;
  readonly isSomeday?: boolean;
}

export interface PlanCard {
  readonly taskId: string;
  readonly title: string;
  readonly section: PlanSection;
  readonly reason: PlanReason;
  readonly reasonText: string;
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly updatedAt: string;
  readonly rank: number;
}

export interface PlanQueue {
  readonly cards: readonly PlanCard[];
  readonly hiddenOverdue: number;
  readonly totals: {
    readonly today: number;
    readonly overdue: number;
    readonly inbox: number;
    readonly undated: number;
  };
}

export interface PlanDecisionInput {
  readonly taskId: string;
  readonly decision: PlanDecisionKind;
  readonly targetDate: string | null;
}

export interface PlanEffect {
  readonly taskId: string;
  readonly title: string;
  readonly decision: PlanDecisionKind | 'untouched';
  readonly summary: string;
  readonly changesDue: boolean;
}

export interface PlanPreview {
  readonly complete: number;
  readonly plannedToday: number;
  readonly plannedLater: number;
  readonly cancel: number;
  readonly trash: number;
  readonly skip: number;
  readonly someday: number;
  readonly untouched: number;
  readonly effects: readonly PlanEffect[];
}

const SECTION_RANK: Record<PlanSection, number> = {
  today_timed: 0,
  today: 1,
  overdue: 2,
  inbox: 3,
  undated: 4,
};

const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

interface Classified {
  readonly task: PlanTaskInput;
  readonly section: PlanSection;
  readonly reason: PlanReason;
  readonly reasonText: string;
  readonly dueDay: string | null;
}

export function planQueue(
  tasks: readonly PlanTaskInput[],
  input: {
    readonly localDate: string;
    readonly timeZone: string;
    readonly sources: PlanSources;
    readonly limit: number | null;
  },
): PlanQueue {
  const classified: Classified[] = [];
  for (const task of tasks) {
    if (task.status !== 'active' || task.kind !== 'task' || task.parentId !== null) {
      continue;
    }
    if (task.isSomeday === true) {
      continue;
    }
    const placed = classify(task, input.localDate, input.timeZone, input.sources);
    if (placed !== null) {
      classified.push(placed);
    }
  }
  classified.sort(compareCards);
  const today = classified.filter(
    (card) => card.section === 'today_timed' || card.section === 'today',
  );
  const overdue = classified.filter((card) => card.section === 'overdue');
  const rest = classified.filter((card) => card.section === 'inbox' || card.section === 'undated');
  const room = input.limit === null ? null : Math.max(0, input.limit - today.length);
  const keptOverdue = room === null ? overdue : overdue.slice(0, room);
  const roomAfter = room === null ? null : room - keptOverdue.length;
  const keptRest = roomAfter === null ? rest : rest.slice(0, roomAfter);
  const cards = [...today, ...keptOverdue, ...keptRest].map((card, rank) => toCard(card, rank));
  return {
    cards,
    hiddenOverdue: overdue.length - keptOverdue.length,
    totals: {
      today: today.length,
      overdue: overdue.length,
      inbox: classified.filter((card) => card.section === 'inbox').length,
      undated: classified.filter((card) => card.section === 'undated').length,
    },
  };
}

export function previewPlan(
  cards: readonly PlanCard[],
  decisions: readonly PlanDecisionInput[],
): PlanPreview {
  const chosen = new Map(decisions.map((decision) => [decision.taskId, decision]));
  const effects = cards.map((card) => effectOf(card, chosen.get(card.taskId)));
  return {
    complete: effects.filter((effect) => effect.decision === 'done').length,
    plannedToday: effects.filter((effect) => effect.decision === 'plan_day').length,
    plannedLater: effects.filter((effect) => effect.decision === 'later').length,
    cancel: effects.filter((effect) => effect.decision === 'cancel').length,
    trash: effects.filter((effect) => effect.decision === 'trash').length,
    skip: effects.filter((effect) => effect.decision === 'skip').length,
    someday: effects.filter((effect) => effect.decision === 'someday').length,
    untouched: effects.filter((effect) => effect.decision === 'untouched').length,
    effects,
  };
}

export function staleTaskIds(
  cards: readonly Pick<PlanCard, 'taskId' | 'updatedAt'>[],
  current: readonly { readonly id: string; readonly updatedAt: string }[],
): readonly string[] {
  const seen = new Map(current.map((task) => [task.id, task.updatedAt]));
  return cards
    .filter((card) => seen.get(card.taskId) !== card.updatedAt)
    .map((card) => card.taskId);
}

function classify(
  task: PlanTaskInput,
  localDate: string,
  fallbackZone: string,
  sources: PlanSources,
): Classified | null {
  const zone = task.timeZone.length > 0 ? task.timeZone : fallbackZone;
  const dueDay = task.dueDate === null ? null : civilDate(task.dueDate, zone);
  if (dueDay === localDate) {
    if (!sources.today) {
      return null;
    }
    const timed = !task.isAllDay && task.dueDate !== null;
    return {
      task,
      section: timed ? 'today_timed' : 'today',
      reason: timed ? 'due_today_at' : 'due_today',
      reasonText: timed ? `Vence hoy a las ${clockLabel(task.dueDate, zone)}` : 'Vence hoy',
      dueDay,
    };
  }
  if (dueDay !== null && dueDay < localDate) {
    if (!sources.overdue) {
      return null;
    }
    return {
      task,
      section: 'overdue',
      reason: 'overdue',
      reasonText: `Venció el ${humanDate(dueDay)}`,
      dueDay,
    };
  }
  if (task.dueDate !== null) {
    return null;
  }
  if (task.inbox) {
    if (!sources.inbox) {
      return null;
    }
    return {
      task,
      section: 'inbox',
      reason: 'inbox',
      reasonText: 'Está en la bandeja, sin fecha',
      dueDay: null,
    };
  }
  if (!sources.undated) {
    return null;
  }
  return {
    task,
    section: 'undated',
    reason: 'undated',
    reasonText: 'No tiene fecha',
    dueDay: null,
  };
}

function compareCards(left: Classified, right: Classified): number {
  const section = SECTION_RANK[left.section] - SECTION_RANK[right.section];
  if (section !== 0) {
    return section;
  }
  if (left.section === 'today_timed') {
    const due = (left.task.dueDate ?? '').localeCompare(right.task.dueDate ?? '');
    if (due !== 0) {
      return due;
    }
  }
  const priority = PRIORITY_RANK[left.task.priority] - PRIORITY_RANK[right.task.priority];
  if (priority !== 0) {
    return priority;
  }
  if (left.section === 'overdue') {
    const due = (left.task.dueDate ?? '').localeCompare(right.task.dueDate ?? '');
    if (due !== 0) {
      return due;
    }
  }
  if (left.section === 'inbox' || left.section === 'undated') {
    const created = left.task.createdAt.localeCompare(right.task.createdAt);
    if (created !== 0) {
      return created;
    }
  }
  return left.task.id.localeCompare(right.task.id);
}

function toCard(card: Classified, rank: number): PlanCard {
  return {
    taskId: card.task.id,
    title: card.task.title,
    section: card.section,
    reason: card.reason,
    reasonText: card.reasonText,
    priority: card.task.priority,
    dueDate: card.task.dueDate,
    isAllDay: card.task.isAllDay,
    timeZone: card.task.timeZone,
    projectId: card.task.projectId,
    projectName: card.task.projectName,
    updatedAt: card.task.updatedAt,
    rank,
  };
}

function effectOf(card: PlanCard, decision: PlanDecisionInput | undefined): PlanEffect {
  if (decision === undefined) {
    return {
      taskId: card.taskId,
      title: card.title,
      decision: 'untouched',
      summary: 'Sin decisión: se queda fuera del plan y no cambia.',
      changesDue: false,
    };
  }
  return {
    taskId: card.taskId,
    title: card.title,
    decision: decision.decision,
    summary: summaryOf(decision),
    changesDue: false,
  };
}

function summaryOf(decision: PlanDecisionInput): string {
  switch (decision.decision) {
    case 'done':
      return 'Se completará. La fecha de vencimiento no cambia.';
    case 'plan_day':
      return 'Quedará en el plan de hoy. La fecha de vencimiento no cambia.';
    case 'later':
      return decision.targetDate === null
        ? 'Quedará para otro día. La fecha de vencimiento no cambia.'
        : `Quedará en el plan del ${decision.targetDate}. La fecha de vencimiento no cambia.`;
    case 'cancel':
      return 'Pasará a «No lo haré». No cuenta como completada.';
    case 'trash':
      return 'Irá a la papelera.';
    case 'skip':
      return 'Se deja como está.';
    case 'someday':
      return 'Pasará a Algún día. El cuándo se quita y la fecha límite se conserva.';
    default: {
      const unreachable: never = decision.decision;
      return unreachable;
    }
  }
}

function civilDate(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return null;
  }
}

function clockLabel(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}
