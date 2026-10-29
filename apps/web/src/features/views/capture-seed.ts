import type { FilterRules } from '@reflexionia/sdk';

export interface CaptureSeed {
  readonly projectId?: string;
  readonly tagIds: readonly string[];
  readonly viewDay: 'today' | 'tomorrow' | null;
}

/** DA-12: preload a capture only when the filter names exactly one list, tag or day. */
export function captureSeed(rules: FilterRules): CaptureSeed {
  const lists: string[] = [];
  const tags: string[] = [];
  const days: ('today' | 'tomorrow')[] = [];
  for (const group of rules.groups) {
    for (const condition of group.conditions) {
      const values = Array.isArray(condition.value)
        ? condition.value
        : typeof condition.value === 'string'
          ? [condition.value]
          : [];
      if (condition.field === 'list') {
        lists.push(...values);
      } else if (condition.field === 'tag') {
        tags.push(...values);
      } else if (condition.field === 'date' && (condition.op === 'today' || condition.op === 'tomorrow')) {
        days.push(condition.op);
      } else if (condition.field === 'date') {
        days.push('today');
        days.push('tomorrow');
      }
    }
  }
  const projectId = lists.length === 1 ? lists[0] : undefined;
  const day = days.length === 1 ? days[0] : null;
  return {
    ...(projectId === undefined ? {} : { projectId }),
    tagIds: tags.length === 1 && tags[0] !== undefined ? [tags[0]] : [],
    viewDay: day ?? null,
  };
}
