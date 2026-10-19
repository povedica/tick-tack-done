/**
 * Shared domain types (section 5). Source of truth for API DTOs and the web client.
 * Dates are ISO-8601 strings; the capture time zone is a separate IANA field.
 */

export type TaskKind = 'task' | 'note';
export type TaskStatus = 'active' | 'completed' | 'archived';
export type Priority = 'none' | 'low' | 'medium' | 'high';
export type RepeatFrom = 'due_date' | 'completion_date';
export type TaskSource = 'manual' | 'import' | 'api' | 'automation' | 'plugin';
export type ChecklistStatus = 'active' | 'completed';
export type ProjectViewMode = 'list' | 'kanban' | 'timeline';
export type ProjectKind = 'TASK' | 'NOTE';
export type FilterMode = 'normal' | 'advanced';
export type FilterCombinator = 'AND' | 'OR';
export type ReminderType = 'relative' | 'absolute' | 'location' | 'daily_digest';
export type ReminderChannel = 'push' | 'email' | 'both';
export type HabitPeriod = 'day' | 'week';
export type HabitWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type FocusSessionType = 'focus' | 'short_break' | 'long_break';
export type CalendarSyncDirection = 'read' | 'two_way';
export type ActivityAction =
  'created' | 'updated' | 'completed' | 'deleted' | 'assigned' | 'commented';
export type Theme = 'light' | 'dark' | 'auto';
export type WeekStart = 'monday' | 'sunday';
export type SmartListKey =
  | 'today'
  | 'tomorrow'
  | 'next_7_days'
  | 'all'
  | 'inbox'
  | 'assigned_to_me'
  | 'completed'
  | 'trash'
  | 'no_date'
  | 'recently_added';

export interface HabitGoal {
  readonly timesPerPeriod: number;
  readonly period: HabitPeriod;
  readonly targetCount: number;
}

export type DateFilterOp = 'today' | 'tomorrow' | 'next_7_days' | 'overdue' | 'no_date' | 'between';

export type FilterCondition =
  | { readonly field: 'list'; readonly op: 'in'; readonly value: readonly string[] }
  | { readonly field: 'tag'; readonly op: 'any_of'; readonly value: readonly string[] }
  | { readonly field: 'date'; readonly op: Exclude<DateFilterOp, 'between'> }
  | {
      readonly field: 'date';
      readonly op: 'between';
      readonly value: readonly [string, string];
    }
  | { readonly field: 'priority'; readonly op: 'gte'; readonly value: Priority }
  | { readonly field: 'keyword'; readonly op: 'contains'; readonly value: string }
  | { readonly field: 'status'; readonly op: 'eq'; readonly value: 'active' | 'completed' }
  | { readonly field: 'assignee'; readonly op: 'eq'; readonly value: string };

export interface FilterGroup {
  readonly combinator: FilterCombinator;
  readonly conditions: readonly FilterCondition[];
}

export interface FilterRules {
  readonly combinator: FilterCombinator;
  readonly groups: readonly FilterGroup[];
}

export type QuickAddSpanKind = 'date' | 'priority' | 'tag' | 'list' | 'reminder';

export interface QuickAddSpan {
  readonly start: number;
  readonly end: number;
  readonly kind: QuickAddSpanKind;
}

/** Extra rule supplied by a host. The plugin host itself is V2 (RF-103). */
export interface QuickAddPattern {
  readonly source: string;
  readonly kind: QuickAddSpanKind;
  /** Overrides the first capture group. ISO-8601 for a date, RRULE for a repeat, iCalendar trigger for a reminder. */
  readonly value?: string;
}

/** Clock is injected. Relative dates are not resolved without it. */
export interface QuickAddContext {
  readonly now: string;
  readonly timeZone: string;
  readonly patterns?: readonly QuickAddPattern[];
}

export interface QuickAddDue {
  readonly date: string;
  readonly isAllDay: boolean;
}

export interface QuickAddParse {
  readonly title: string;
  readonly spans: readonly QuickAddSpan[];
  readonly priority: Priority | null;
  readonly tagNames: readonly string[];
  readonly listName: string | null;
  readonly due: QuickAddDue | null;
  readonly repeatRule: string | null;
  readonly reminderTrigger: string | null;
}

export interface Task {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly content: string;
  readonly kind: TaskKind;
  readonly status: TaskStatus;
  readonly priority: Priority;
  readonly isAllDay: boolean;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly durationMinutes: number | null;
  readonly repeatRule: string | null;
  readonly repeatFrom: RepeatFrom;
  readonly sortOrder: string;
  readonly tagIds: readonly string[];
  readonly assigneeId: string | null;
  readonly createdBy: string;
  readonly completedAt: string | null;
  readonly source: TaskSource;
}
