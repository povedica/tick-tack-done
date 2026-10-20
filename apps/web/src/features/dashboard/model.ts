export const WIDGETS = {
  completed_today: { title: 'Completadas hoy', to: '/smart/completed', size: 's' },
  completed_week: { title: 'Completadas · 7 días', to: '/statistics/tasks', size: 's' },
  overdue: { title: 'Necesitan atención', to: '/review/weekly', size: 's' },
  next_7_days: { title: 'Próximos 7 días', to: '/smart/next7', size: 's' },
  projects: { title: 'Proyectos por revisar', to: '/review/weekly', size: 'l' },
  load: { title: 'Dónde están tus pendientes', to: '/smart/all', size: 'm' },
  habits: { title: 'Hábitos de hoy', to: '/habits', size: 'm' },
  focus: { title: 'Un espacio para concentrarte', to: '/focus', size: 'm' },
  calendar: { title: 'En tu calendario', to: '/calendar/agenda', size: 'm' },
  next_countdowns: { title: 'Fechas que importan', to: '/countdowns', size: 'm' },
} as const;
export type WidgetKey = keyof typeof WIDGETS;
export interface GardenWidget {
  widget_key: WidgetKey;
  size: 's' | 'm' | 'l';
}
export const DEFAULT_WIDGETS: GardenWidget[] = Object.entries(WIDGETS).map(
  ([widget_key, widget]) => ({ widget_key: widget_key as WidgetKey, size: widget.size }),
);
export function row(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
export function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(row) : [];
}
export function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
export function label(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function parseLayout(value: unknown): GardenWidget[] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS;
  const seen = new Set<string>();
  return value
    .map(row)
    .sort((a, b) => count(a.position) - count(b.position))
    .flatMap((item) => {
      const key = label(item.widget_key);
      if (!Object.hasOwn(WIDGETS, key) || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          widget_key: key as WidgetKey,
          size: item.size === 's' || item.size === 'l' ? item.size : 'm',
        },
      ];
    });
}
