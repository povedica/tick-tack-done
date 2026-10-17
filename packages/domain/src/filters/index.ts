import type { FilterRules } from '../types';

export interface FilterSubject {
  readonly listId: string | null;
  readonly tagNames: readonly string[];
  readonly dueDate: string | null;
  readonly priority: string;
  readonly title: string;
  readonly content: string;
  readonly status: string;
  readonly assigneeId: string | null;
}

/** RF-904. The grammar types exist; evaluation lands with smart lists. */
export function matchesFilter(_rules: FilterRules, _subject: FilterSubject): never {
  throw new Error('filters are not implemented');
}
