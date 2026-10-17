import type { ChecklistStatus } from '../types';

export interface ChecklistProgress {
  readonly completed: number;
  readonly total: number;
}

/** RF-207: x/y shown on the task card. */
export function checklistProgress(
  items: readonly { readonly status: ChecklistStatus }[],
): ChecklistProgress {
  let completed = 0;
  for (const item of items) {
    if (item.status === 'completed') {
      completed += 1;
    }
  }
  return { completed, total: items.length };
}
