import type { RepeatFrom } from '../types';

export interface RecurrenceInput {
  readonly repeatRule: string;
  readonly repeatFrom: RepeatFrom;
  readonly dueDate: string | null;
  readonly completedAt: string | null;
  readonly timeZone: string;
}

export interface Occurrence {
  readonly dueDate: string;
}

/** RF-701. Expansion lands in the time slice; this entry only reserves the boundary. */
export function nextOccurrence(_input: RecurrenceInput): never {
  throw new Error('recurrence is not implemented');
}
