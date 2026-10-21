import type { GardenTextKey } from './text';

export const WIDGETS = {
  score: { title: 'score', group: 'kpi' },
  streak: { title: 'streak', group: 'kpi' },
  completed_today: { title: 'completed', group: 'kpi' },
  overdue: { title: 'attention', group: 'kpi' },
  next_7_days: { title: 'next', group: 'kpi' },
  habits: { title: 'habits', group: 'activity' },
  focus: { title: 'focus', group: 'activity' },
  next_countdowns: { title: 'countdowns', group: 'activity' },
  calendar: { title: 'calendar', group: 'activity' },
  load: { title: 'lists', group: 'map' },
  tags: { title: 'tags', group: 'map' },
} as const satisfies Record<string, { title: GardenTextKey; group: string }>;
export type WidgetKey = keyof typeof WIDGETS;
export interface GardenWidget {
  widget_key: WidgetKey;
  size: 's' | 'm' | 'l';
}
export const DEFAULT_WIDGETS: GardenWidget[] = Object.keys(WIDGETS).map((key) => ({
  widget_key: key as WidgetKey,
  size: WIDGETS[key as WidgetKey].group === 'kpi' ? 's' : 'm',
}));
export function row(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
export function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(row) : [];
}
export function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
export function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function label(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function parseLayout(value: unknown): GardenWidget[] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS;
  const legacy =
    value.length > 0 &&
    !value.some((item) => ['score', 'streak'].includes(label(row(item).widget_key))) &&
    value.some((item) => ['completed_week', 'projects'].includes(label(row(item).widget_key)));
  const seen = new Set<string>();
  const result = value
    .map(row)
    .sort((a, b) => count(a.position) - count(b.position))
    .flatMap((item): GardenWidget[] => {
      const original = label(item.widget_key);
      const key =
        original === 'projects'
          ? 'load'
          : original === 'completed_week'
            ? 'completed_today'
            : original;
      if (!Object.hasOwn(WIDGETS, key) || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          widget_key: key as WidgetKey,
          size: item.size === 's' || item.size === 'l' ? item.size : 'm',
        },
      ];
    });
  // The previous layouts had no visibility setting for the two new KPI cards or tags.
  if (legacy)
    for (const widget of DEFAULT_WIDGETS.filter((item) =>
      ['score', 'streak', 'tags'].includes(item.widget_key),
    ))
      if (!seen.has(widget.widget_key)) result.push(widget);
  return result;
}
export interface GardenList {
  id: string;
  name: string;
  active: number | null;
  overdue: number | null;
  age: Record<string, unknown>;
  needsReview: boolean;
}
export function gardenLists(widgets: Record<string, unknown>): GardenList[] {
  const projects = rows(row(widgets.projects).items);
  const ages = rows(widgets.overdue_by_list);
  const items = new Map<string, GardenList>();
  for (const item of rows(row(widgets.load).by_list)) {
    const id = label(item.list_id);
    const age = ages.find((value) => value.list_id === id);
    items.set(id, {
      id,
      name: label(item.name),
      active: numeric(item.active),
      overdue: Array.isArray(widgets.overdue_by_list) ? count(age?.total) : null,
      age: age ?? {},
      needsReview: projects.find((value) => value.id === id)?.needs_review === true,
    });
  }
  for (const item of projects) {
    const id = label(item.id);
    if (items.has(id) || ['closed', 'deleted', 'notes'].includes(label(item.state))) continue;
    const age = ages.find((value) => value.list_id === id);
    items.set(id, {
      id,
      name: label(item.name),
      active: numeric(item.active_tasks),
      overdue: Array.isArray(widgets.overdue_by_list) ? count(age?.total) : null,
      age: age ?? {},
      needsReview: item.needs_review === true,
    });
  }
  return [...items.values()].sort(
    (a, b) => count(b.active) - count(a.active) || a.name.localeCompare(b.name),
  );
}
