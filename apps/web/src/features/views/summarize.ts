import type { FilterRules } from '@reflexionia/sdk';

export type ChipIcon = 'tag' | 'calendar' | 'flag' | 'list' | 'check' | 'user' | 'type';

export interface ChipSummary {
  readonly icon: ChipIcon;
  readonly text: string;
}

export interface TagLabel {
  readonly name: string;
  readonly color: string | null;
  readonly deleted: boolean;
}

export interface SummaryText {
  readonly today: string;
  readonly tomorrow: string;
  readonly next7: string;
  readonly overdue: string;
  readonly noDate: string;
  readonly between: string;
  readonly priorityHigh: string;
  readonly priorityMedium: string;
  readonly priorityLow: string;
  readonly priorityAny: string;
  readonly statusActive: string;
  readonly statusCompleted: string;
  readonly deletedTag: string;
}

type Condition = FilterRules['groups'][number]['conditions'][number];

function texts(value: Condition['value']): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

/** Short chips for a saved filter. Callers cap the visible count. */
export function summarizeRules(
  rules: FilterRules,
  options: {
    readonly tagLabels: Readonly<Record<string, TagLabel>>;
    readonly listNames: ReadonlyMap<string, string>;
    readonly text: SummaryText;
  },
): ChipSummary[] {
  const chips: ChipSummary[] = [];
  for (const group of rules.groups) {
    for (const condition of group.conditions) {
      chips.push(...chipsFor(condition, options));
    }
  }
  return chips;
}

export function filterTagLabels(value: unknown): Record<string, TagLabel> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const labels: Record<string, TagLabel> = {};
  for (const [id, label] of Object.entries(value)) {
    if (typeof label !== 'object' || label === null) {
      continue;
    }
    const row = label as { name?: unknown; color?: unknown; deleted?: unknown };
    if (typeof row.name !== 'string') {
      continue;
    }
    labels[id] = {
      name: row.name,
      color: typeof row.color === 'string' ? row.color : null,
      deleted: row.deleted === true,
    };
  }
  return labels;
}

function chipsFor(
  condition: Condition,
  options: {
    readonly tagLabels: Readonly<Record<string, TagLabel>>;
    readonly listNames: ReadonlyMap<string, string>;
    readonly text: SummaryText;
  },
): ChipSummary[] {
  const values = texts(condition.value);
  switch (condition.field) {
    case 'keyword':
      return [{ icon: 'type', text: values[0] ?? '' }];
    case 'list':
      return values.map((id) => ({
        icon: 'list' as const,
        text: options.listNames.get(id) ?? id,
      }));
    case 'tag':
      return values.map((id) => {
        const label = options.tagLabels[id];
        if (label === undefined || label.deleted) {
          return { icon: 'tag' as const, text: options.text.deletedTag };
        }
        return { icon: 'tag' as const, text: label.name };
      });
    case 'date':
      return [{ icon: 'calendar', text: dateText(condition.op, values, options.text) }];
    case 'priority':
      return [{ icon: 'flag', text: priorityText(values[0] ?? '', options.text) }];
    case 'status':
      return [
        {
          icon: 'check',
          text:
            values[0] === 'completed' ? options.text.statusCompleted : options.text.statusActive,
        },
      ];
    case 'assignee':
      return [{ icon: 'user', text: values[0] ?? '' }];
    default:
      return [];
  }
}

function dateText(op: string, values: readonly string[], text: SummaryText): string {
  switch (op) {
    case 'today':
      return text.today;
    case 'tomorrow':
      return text.tomorrow;
    case 'next_7_days':
      return text.next7;
    case 'overdue':
      return text.overdue;
    case 'no_date':
      return text.noDate;
    case 'between':
      return values.length === 2 ? `${values[0] ?? ''} – ${values[1] ?? ''}` : text.between;
    default:
      return text.between;
  }
}

function priorityText(value: string, text: SummaryText): string {
  switch (value) {
    case 'high':
      return text.priorityHigh;
    case 'medium':
      return text.priorityMedium;
    case 'low':
      return text.priorityLow;
    default:
      return text.priorityAny;
  }
}
