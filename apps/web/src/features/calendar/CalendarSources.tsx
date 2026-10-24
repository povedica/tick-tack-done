import { useRef, useState, useEffect } from 'react';
import { useWtAMessages } from './i18n-wt-a';
import { CalendarDays, List, ListFilter, Tag, Layers, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { collectTags } from '../tasks/collect';
import { sourceSelected, toggleSource } from './source-selection';
import { useCalendarSources } from './use-calendar-sources';
import './sources.css';

export function CalendarSources() {
  const messages = useMessages();
  const own = useWtAMessages();
  const allInput = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ttd.calendar.sources.open') ?? '{}') as Record<
        string,
        boolean
      >;
    } catch {
      return {};
    }
  });
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
  const any = groups.some(({ key, rows }) =>
    rows.some(({ id }) =>
      key === 'filters'
        ? params.get(key)?.split(',').includes(id)
        : sourceSelected(params.get(key), id),
    ),
  );
  useEffect(() => {
    if (allInput.current) allInput.current.indeterminate = !all && any;
  }, [all, any]);
  return (
    <div className="calendar-sources">
      <label className="calendar-source-row">
        <Layers size={16} aria-hidden="true" />
        <span>{messages.calendarAllSources}</span>
        <input
          ref={allInput}
          aria-label={messages.calendarAllSources}
          type="checkbox"
          checked={all}
          onChange={() =>
            change(
              all
                ? { lists: '-', tags: '-', cals: '-', filters: '-' }
                : { lists: null, tags: null, cals: null, filters: null },
            )
          }
        />
      </label>
      {groups.map(({ key, label, icon: Icon, rows }) => (
        <details
          open={
            expanded[key] ?? (!window.matchMedia('(max-width: 768px)').matches || key === 'lists')
          }
          key={key}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setExpanded((current) => {
              const next = { ...current, [key]: open };
              localStorage.setItem('ttd.calendar.sources.open', JSON.stringify(next));
              return next;
            });
          }}
        >
          <summary>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{label}</span>
            <small aria-label={own.calendarSourcesCount}>
              {
                rows.filter(({ id }) =>
                  key === 'filters'
                    ? params.get(key)?.split(',').includes(id)
                    : sourceSelected(params.get(key), id),
                ).length
              }
              /{rows.length}
            </small>
          </summary>
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
