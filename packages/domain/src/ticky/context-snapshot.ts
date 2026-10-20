import type { BusyInterval } from './free-busy';

export interface ContextSnapshot {
  readonly authority_version: number;
  readonly source_revision: number;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly time_zone: string;
  readonly workday: { readonly start: string; readonly end: string } | null;
  readonly calendar: { readonly busy: readonly BusyInterval[] } | null;
  readonly review: {
    readonly period: string;
    readonly considered: number;
    readonly completed: number;
  } | null;
  readonly task_energy: readonly {
    readonly task_id: string;
    readonly list_id: string;
    readonly task_version: number;
    readonly level: number;
    readonly source: 'user_declared';
  }[];
  readonly duration_observations: readonly {
    readonly observation_id: string;
    readonly task_id: string;
    readonly list_id: string;
    readonly source: 'task_duration';
    readonly source_version: number;
    readonly minutes: number;
    readonly observed_at: string;
  }[];
}

const CONTEXT_TTL_MS = 15 * 60 * 1000;

export function buildContextSnapshot(input: {
  readonly authorityVersion: number;
  readonly sourceRevision: number;
  readonly issuedAt: string;
  readonly timeZone: string;
  readonly workday: { readonly start: string; readonly end: string } | null;
  readonly calendar: { readonly busy: readonly BusyInterval[] } | null;
  readonly review: ContextSnapshot['review'];
  readonly taskEnergy: ContextSnapshot['task_energy'];
  readonly durationObservations: ContextSnapshot['duration_observations'];
}): ContextSnapshot {
  const issued = Date.parse(input.issuedAt);
  if (Number.isNaN(issued)) {
    throw new Error('context_invalid');
  }
  return {
    authority_version: input.authorityVersion,
    source_revision: input.sourceRevision,
    issued_at: new Date(issued).toISOString(),
    expires_at: new Date(issued + CONTEXT_TTL_MS).toISOString(),
    time_zone: input.timeZone,
    workday: input.workday,
    calendar: input.calendar,
    review: input.review,
    task_energy: input.taskEnergy.slice(0, 100),
    duration_observations: input.durationObservations
      .filter(
        (row) => row.minutes >= 1 && row.minutes <= 1440 && Date.parse(row.observed_at) <= issued,
      )
      .slice(0, 100),
  };
}
