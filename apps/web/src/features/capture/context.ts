import type { QueryClient } from '@tanstack/react-query';
import type { FilterRules } from '@reflexionia/sdk';
import { civilDateKey, captureSettings } from '@reflexionia/domain';
import { shiftDayKey, zonedWallTime } from '../today/groups';
import type { CaptureDraft } from './notice';
interface ContextOptions {
  readonly now?: Date;
  readonly timeZone?: string;
  readonly cache?: Pick<QueryClient, 'getQueryData'>;
}
/** Only unambiguous route constraints are inherited; custom filters remain editable. */
export function composerContextFor(
  location: { readonly pathname: string; readonly search?: string },
  options: ContextOptions = {},
): CaptureDraft {
  const timeZone =
    options.timeZone ??
    options.cache?.getQueryData<{ time_zone: string }>(['me'])?.time_zone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const settings = captureSettings(
    options.cache?.getQueryData<{ capture_settings?: unknown }>(['me'])?.capture_settings,
  );
  const timed = settings.default_date_mode === 'date_time';
  const [hour, minute] = settings.default_time.split(':').map(Number);
  const today = civilDateKey((options.now ?? new Date()).toISOString(), timeZone) ?? '';
  const params = new URLSearchParams(location.search);
  const parts = location.pathname.split('/').filter(Boolean);
  const section = parts[0];
  const view = section === 'smart' || section === 'smart-lists' ? parts[1] : section;
  const day =
    view === 'today' || view === 'next' || view === 'next_7_days' || view === 'upcoming'
      ? today
      : view === 'tomorrow'
        ? shiftDayKey(today, 1)
        : section === 'calendar'
          ? (params.get('date') ?? today)
          : null;
  const dueDate =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? zonedWallTime(day, timed ? (hour ?? 9) : 0, timed ? (minute ?? 0) : 0, timeZone)
      : null;
  const filter =
    section === 'filter'
      ? options.cache
          ?.getQueryData<{ items: { id: string; rules: FilterRules }[] }>(['filters'])
          ?.items.find((item) => item.id === parts[1])
      : undefined;
  const conditions =
    filter?.rules.combinator === 'AND' &&
    filter.rules.groups.every((group) => group.combinator === 'AND')
      ? filter.rules.groups.flatMap((group) => group.conditions)
      : [];
  const one = (field: string) => {
    const rows = conditions.filter((condition) => condition.field === field);
    return rows.length === 1 ? rows[0] : undefined;
  };
  const listRule = one('list');
  const tagRule = one('tag');
  const dateRule = one('date');
  const filterProject =
    listRule &&
    'value' in listRule &&
    listRule.op === 'in' &&
    Array.isArray(listRule.value) &&
    listRule.value.length === 1
      ? listRule.value[0]
      : undefined;
  const filterTags =
    tagRule &&
    'value' in tagRule &&
    tagRule.op === 'any_of' &&
    Array.isArray(tagRule.value) &&
    tagRule.value.length === 1
      ? tagRule.value
      : undefined;
  const filterDay =
    dateRule?.op === 'today' ? today : dateRule?.op === 'tomorrow' ? shiftDayKey(today, 1) : null;
  const filterDue = filterDay
    ? zonedWallTime(filterDay, timed ? (hour ?? 9) : 0, timed ? (minute ?? 0) : 0, timeZone)
    : null;
  const project =
    section === 'list' || section === 'lists' || section === 'projects' ? parts[1] : filterProject;
  const columns = project
    ? options.cache?.getQueryData<{ items: { id: string }[] }>(['columns', project])?.items
    : undefined;
  return {
    text: '',
    ...(dueDate
      ? {
          date: {
            dueDate,
            allDay: !timed,
            durationMinutes: settings.default_duration_minutes,
            reminder: null,
            reminderTouched: false,
            repeatRule: null,
          },
        }
      : {}),
    ...(filterDue
      ? {
          date: {
            dueDate: filterDue,
            allDay: !timed,
            durationMinutes: settings.default_duration_minutes,
            reminder: null,
            reminderTouched: false,
            repeatRule: null,
          },
        }
      : {}),
    ...(project
      ? {
          project,
          ...(params.get('column') || columns?.[0]?.id
            ? { columnId: params.get('column') ?? columns?.[0]?.id ?? null }
            : {}),
        }
      : {}),
    ...(filterTags ? { tags: [...filterTags] } : {}),
    ...(section === 'tag' && parts[1] ? { tags: [parts[1]] } : {}),
  };
}
