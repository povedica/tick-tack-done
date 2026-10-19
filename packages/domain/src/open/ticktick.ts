import {
  priorityFromTickTick,
  priorityToTickTick,
  type TickTickPriority,
} from '../priority/priority';
import type { Priority, ProjectKind, ProjectViewMode, TaskStatus } from '../types';

/** Section 10.4. Field names of the TickTick Open API, mapped onto our tasks. */

export interface OpenTaskInput {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly content: string;
  readonly isAllDay: boolean;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly repeatRule: string | null;
  readonly priority: Priority;
  readonly status: TaskStatus;
  readonly completedAt: string | null;
  readonly sortOrder: string;
  readonly items: readonly OpenChecklist[];
}

export interface OpenChecklist {
  readonly id: string;
  readonly title: string;
  readonly status: 'active' | 'completed';
  readonly completedAt: string | null;
  readonly isAllDay: boolean;
  readonly sortOrder: string;
  readonly startDate: string | null;
  readonly timeZone: string;
}

export interface OpenProjectInput {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly sortOrder: string;
  readonly closed: boolean;
  readonly folderId: string | null;
  readonly viewMode: ProjectViewMode;
  readonly kind: ProjectKind;
}

export function toOpenTask(task: OpenTaskInput): Record<string, unknown> {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    content: task.content,
    desc: task.content,
    isAllDay: task.isAllDay,
    startDate: task.startDate,
    dueDate: task.dueDate,
    timeZone: task.timeZone,
    repeatFlag: task.repeatRule,
    priority: priorityToTickTick(task.priority),
    status: task.status === 'completed' ? 2 : 0,
    completedTime: task.completedAt,
    sortOrder: Number(task.sortOrder),
    items: task.items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status === 'completed' ? 1 : 0,
      completedTime: item.completedAt,
      isAllDay: item.isAllDay,
      sortOrder: Number(item.sortOrder),
      startDate: item.startDate,
      timeZone: item.timeZone,
    })),
  };
}

export function toOpenProject(project: OpenProjectInput): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    sortOrder: Number(project.sortOrder),
    closed: project.closed,
    groupId: project.folderId,
    viewMode: project.viewMode,
    kind: project.kind,
    permission: 'write',
  };
}

export interface OpenTaskWrite {
  readonly title?: string;
  readonly content?: string;
  readonly projectId?: string;
  readonly priority?: Priority;
  readonly isAllDay?: boolean;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly timeZone?: string;
  readonly repeatRule?: string | null;
  readonly status?: 'active' | 'completed';
  readonly completedAt?: string | null;
}

export function fromOpenTask(value: unknown): OpenTaskWrite | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return fill(value as Record<string, unknown>);
}

function fill(body: Record<string, unknown>): OpenTaskWrite {
  const next: {
    title?: string;
    content?: string;
    projectId?: string;
    priority?: Priority;
    isAllDay?: boolean;
    startDate?: string | null;
    dueDate?: string | null;
    timeZone?: string;
    repeatRule?: string | null;
    status?: 'active' | 'completed';
    completedAt?: string | null;
  } = {};
  if (typeof body.title === 'string') {
    Object.assign(next, { title: body.title });
  }
  if (typeof body.content === 'string') {
    Object.assign(next, { content: body.content });
  }
  if (typeof body.projectId === 'string') {
    Object.assign(next, { projectId: body.projectId });
  }
  if (typeof body.priority === 'number' && isTickTickPriority(body.priority)) {
    Object.assign(next, { priority: priorityFromTickTick(body.priority) });
  }
  if (typeof body.isAllDay === 'boolean') {
    Object.assign(next, { isAllDay: body.isAllDay });
  }
  if (typeof body.startDate === 'string' || body.startDate === null) {
    Object.assign(next, { startDate: body.startDate });
  }
  if (typeof body.dueDate === 'string' || body.dueDate === null) {
    Object.assign(next, { dueDate: body.dueDate });
  }
  if (typeof body.timeZone === 'string') {
    Object.assign(next, { timeZone: body.timeZone });
  }
  if (typeof body.repeatFlag === 'string' || body.repeatFlag === null) {
    Object.assign(next, { repeatRule: body.repeatFlag });
  }
  if (body.status === 2) {
    Object.assign(next, { status: 'completed' });
  } else if (body.status === 0) {
    Object.assign(next, { status: 'active' });
  }
  if (typeof body.completedTime === 'string' || body.completedTime === null) {
    Object.assign(next, { completedAt: body.completedTime });
  }
  return next;
}

function isTickTickPriority(value: number): value is TickTickPriority {
  return value === 0 || value === 1 || value === 3 || value === 5;
}
