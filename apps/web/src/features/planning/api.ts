import { closingRequest } from '../closing/api';
import type { PlanningAction } from '@reflexionia/domain';
export { closingRequest as planningRequest };
export interface PlanCard {
  task_id: string;
  title: string;
  content: string;
  priority: 'none' | 'low' | 'medium' | 'high';
  project_name: string;
  project_color: string | null;
  due_date: string | null;
  start_date: string | null;
  duration_minutes: number | null;
  is_all_day: boolean;
  recurring: boolean;
  habit?: boolean;
  repeat_rule: string | null;
  tags: readonly { id: string; name: string; color: string | null }[];
  attachments: readonly { id: string; name: string; url: string }[];
}
export type Choice = PlanningAction & { task_id: string };
export interface PlanSession {
  id: string;
  revision: number;
  local_date: string;
  time_zone: string;
  cards: readonly PlanCard[];
  decisions: readonly Choice[];
}
export interface AgendaTask {
  id: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
  duration_minutes: number | null;
  is_all_day: boolean;
  evening_only?: boolean;
}
export interface AgendaEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
}
export interface LoadDay {
  date: string;
  task_minutes: number;
  event_minutes: number;
  available_minutes: number | null;
  ratio: number | null;
  status: 'ok' | 'tight' | 'overload';
  tasks: readonly AgendaTask[];
  events: readonly AgendaEvent[];
}
export interface LoadRange {
  time_zone: string;
  settings: {
    work_day_start: string | null;
    work_day_end: string | null;
    evening_start: string;
    default_task_duration: number;
    work_days: readonly number[];
  };
  days: readonly LoadDay[];
}
