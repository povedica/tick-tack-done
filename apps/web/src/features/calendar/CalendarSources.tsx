import { CalendarDays, List, ListFilter, Tag, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { collectTags } from '../tasks/collect';
import { sourceSelected, toggleSource } from './source-selection';
import { useCalendarSources } from './use-calendar-sources';
import './sources.css';

export function CalendarSources() {
  const messages = useMessages();
  const { params, change } = useCalendarSources();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags });
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => api.listFilters() });
  const calendars = useQuery({
    queryKey: ['calendar-subscriptions'],
    queryFn: () => api.listCalendarSubscriptions(),
  });
  const items = (value: unknown): { id: string; name: string; color?: string }[] => {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('items' in value) ||
      !Array.isArray(value.items)
    )
      return [];
    return value.items.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null) return [];
      const row = item as Record<string, unknown>;
      return typeof row.id === 'string'
        ? [
            {
              id: row.id,
              name:
                typeof row.name === 'string'
                  ? row.name
                  : typeof row.summary === 'string'
                    ? row.summary
                    : messages.calendarSource,
              ...(typeof row.color === 'string' ? { color: row.color } : {}),
            },
          ]
        : [];
    });
  };
  const groups = [
    { key: 'lists' as const, label: messages.listsTitle, icon: List, rows: items(projects.data) },
    {
      key: 'filters' as const,
      label: messages.filtersTitle,
      icon: ListFilter,
      rows: items(filters.data),
    },
    { key: 'tags' as const, label: messages.tagsTitle, icon: Tag, rows: items(tags.data) },
    {
      key: 'cals' as const,
      label: messages.calendarSubscribed,
      icon: CalendarDays,
      rows: items(calendars.data),
    },
  ];
  const all =
    ['lists', 'tags', 'cals'].every((key) => params.get(key) === null) && !params.get('filters');
  return (
    <div className="calendar-sources">
      <details open>
        <summary>{messages.calendarAllSources}</summary>
        <label className="calendar-source-row">
          <Layers size={16} aria-hidden="true" />
          <span>{messages.calendarAllSources}</span>
          <input
            type="checkbox"
            checked={all}
            onChange={() => {
              change(
                all
                  ? { lists: '-', tags: '-', cals: '-', filters: '-' }
                  : { lists: null, tags: null, cals: null, filters: null },
              );
            }}
          />
        </label>
      </details>
      {groups.map(({ key, label, icon: Icon, rows }) => (
        <details open key={key}>
          <summary>{label}</summary>
          {rows.map((item) => (
            <label className="calendar-source-row" key={item.id}>
              <Icon
                size={16}
                aria-hidden="true"
                style={item.color ? { color: item.color } : undefined}
              />
              <span>{item.name}</span>
              <input
                type="checkbox"
                aria-label={item.name}
                checked={
                  key === 'filters'
                    ? (params.get(key)?.split(',').includes(item.id) ?? false)
                    : sourceSelected(params.get(key), item.id)
                }
                onChange={() => {
                  const value = toggleSource(
                    key === 'filters' ? (params.get(key) ?? '-') : params.get(key),
                    item.id,
                    rows.map((row) => row.id),
                  );
                  change({
                    [key]:
                      key === 'filters' && value === null
                        ? rows.map((row) => row.id).join(',')
                        : value,
                  });
                }}
              />
            </label>
          ))}
        </details>
      ))}
      {projects.isError || tags.isError || filters.isError || calendars.isError ? (
        <p role="alert">{messages.saveFailed}</p>
      ) : null}
    </div>
  );
}
