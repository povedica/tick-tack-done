import { composerContextFor } from '../capture/context';
import { useAgendaQuery } from '../calendar/use-agenda-query';
import { agendaPageRange } from '../calendar/agenda-range';
import { useCalendarDrag } from './use-calendar-drag';
import { useCalendarTaskChange, type CalendarTaskChange } from './use-calendar-task-change';
import { SidebarFoldButton } from '../../shell/SidebarFoldButton';
import { DayWeekStrip } from '../calendar/DayWeekStrip';
import { CalendarSources } from '../calendar/CalendarSources';
import { sourceSelected } from '../calendar/source-selection';
import { useCalendarSources } from '../calendar/use-calendar-sources';
import { PeriodNavigator } from '../../components/period/PeriodNavigator';
import { useVerticalCalendarNavigation } from '../calendar/useVerticalCalendarNavigation';
import { TodayMark } from '../../components/period/TodayMark';
import { useCalendarToday } from '../../components/period/useCalendarToday';
import { QuickAddPopover } from '../capture/components/QuickAddPopover';
import { allDaySlot, type CalendarSlot, type SlotAnchor } from '../capture/calendar-slot';
import { runAction } from '../../components/run-action';
import { CalendarMenu, CalendarPeriod } from '../calendar/CalendarControls';
import {
  CalendarDays,
  ChevronUp,
  ChevronDown,
  Plus,
  Columns3,
  Columns2,
  Square,
  CalendarRange,
  Grid2X2,
  Grid3X3,
  LayoutGrid,
  List,
  Check,
  ListFilter,
  X,
} from 'lucide-react';
import { CalendarTaskMark } from '../calendar/CalendarTaskMark';
import { openTaskComposer } from '../capture/notice';
import '../calendar/calendar.css';
import { PriorityCheck } from '../../components/PriorityCheck';
import { displayTitle } from '../tasks/displayTitle';
import { ApiError, type Project, type Task } from '@reflexionia/sdk';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent,
} from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { eventDayRange, eventSpan } from './event-span';
import { rememberCalendarView } from '../../shell/BottomBar';
import { api } from '../../api';
import { completeBody } from '../tasks/complete-body';
import { useActionToast } from '../../components/action-toast';
import { Button, EmptyState, ErrorState, SkeletonRows } from '../../components/ui';
import { fill, useMessages, type Messages } from '../../i18n';
import { useAppLocale, useLocale } from '../../i18n/locale';
import { usePreferences, type AccentId } from '../../theme/preferences';
import { failureMessage } from '../../failure';
import { TotpQr } from '../settings/TotpQr';
import { InboundEmailCard } from '../settings/InboundEmailCard';
import {
  chipStyle,
  ExternalEventPopover,
  isExternalEvent,
  type ExternalEventView,
} from '../calendar/ExternalEvent';
import { collectTags, collectFilterTasks } from '../tasks/collect';
import { rowFromTask, smartApiKey, type RowModel } from '../tasks/model';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { newMutation, runOrQueue } from '../offline/client';
import { collectTasks } from '../today/board';
import { calendarDay, formatDueTime } from '../today/groups';
import { TaskList } from '../tasks/TaskList';
import { taskQueryHref } from '../../shell/use-open-task';
import { Board } from '../views/components/ViewPages';
import { viewsApi } from '../views/api';
import { HourGrid } from './HourGrid';
import {
  isoWeek,
  calendarTaskLabel,
  dayFromParam,
  isCalendarOverdue,
  localDateParam,
  localToday,
  monthCells,
  monthQueryRange,
  overflowHref,
  quarterMonths,
  shiftView,
  tasksOnCell,
  viewDays,
  yearQueryRange,
} from './month';

export { MatrixPage } from '../matrix/MatrixBoard';

const ACCENTS: readonly AccentId[] = ['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'];
const ACCENT_COLOR: Readonly<Record<AccentId, string>> = {
  indigo: '#4772fa',
  violet: '#7c3aed',
  teal: '#0f766e',
  amber: '#b45309',
  rose: '#be123c',
  slate: '#44403c',
};
const CAL_VIEWS = [
  'day',
  'week',
  'multi-day',
  'two-weeks',
  'month',
  'quarter',
  'year',
  'agenda',
] as const;

export function InboxPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const inbox = projects.data?.items.find((project) => project.is_inbox);
  const tasks = useQuery({
    queryKey: ['inbox-tasks', inbox?.id],
    queryFn: () =>
      api.listTasks({
        ...(inbox?.id === undefined ? {} : { projectId: inbox.id }),
        status: 'active',
        sort: 'manual',
        limit: 100,
      }),
    enabled: inbox !== undefined,
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const [process, setProcess] = useState(false);
  const [cursor, setCursor] = useState(0);
  const names = new Map((projects.data?.items ?? []).map((project) => [project.id, project.name]));
  const tagNames = new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag.name]));
  const rows = [...(tasks.data?.items ?? [])]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .map((task) => rowFromTask(task, names, tagNames));
  const current = rows[cursor];

  function step(text?: string): void {
    setCursor((value) => value + 1);
    if (text !== undefined) {
      useActionToast.getState().show(text);
    }
    runAction(refreshTaskSurfaces(queryClient));
  }

  if (process) {
    return (
      <section className="screen-page">
        <header className="page-header">
          <h1>{messages.inboxTitle}</h1>
          <Button
            variant="ghost"
            onClick={() => {
              setProcess(false);
            }}
          >
            {messages.processExit}
          </Button>
        </header>
        {current !== undefined ? (
          <>
            <p>{fill(messages.processOf, `${String(cursor + 1)}/${String(rows.length)}`)}</p>
            <ProcessCard
              messages={messages}
              locale={locale}
              taskTitle={current.title}
              projects={projects.data?.items ?? []}
              onDate={(preset, date) => {
                runAction(
                  api.snoozeTask(current.id, preset, date).then(() => {
                    step(messages.processDate);
                  }),
                );
              }}
              onMove={(projectId) => {
                runAction(
                  api.moveTask(current.id, projectId).then(() => {
                    step(messages.processMove);
                  }),
                );
              }}
              onDone={() => {
                runAction(
                  runOrQueue(newMutation('complete', current.id, {}), (key) =>
                    api.completeTask(current.id, completeBody(), key),
                  ).then(() => {
                    step(messages.processDoneAction);
                  }),
                );
              }}
              onDelete={() => {
                const id = current.id;
                runAction(
                  api.deleteTask(id).then(() => {
                    useActionToast.getState().show(messages.movedToTrash, () => {
                      runAction(api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient)));
                    });
                    step(messages.movedToTrash);
                  }),
                );
              }}
              onSkip={() => {
                step();
              }}
            />
          </>
        ) : (
          <EmptyState title={messages.processDone} body={messages.emptyInbox} />
        )}
      </section>
    );
  }

  if (inbox === undefined) {
    return tasks.isPending ? (
      <SkeletonRows />
    ) : (
      <EmptyState title={messages.inboxTitle} body={messages.emptyInbox} />
    );
  }

  return (
    <Board
      key={inbox.id}
      messages={messages}
      title={messages.inboxTitle}
      queryKey={['inbox-tasks', inbox.id]}
      createProjectId={inbox.id}
      matrixListId={inbox.id}
      viewKey="inbox"
      headerActions={
        <Button
          onClick={() => {
            setProcess(true);
            setCursor(0);
          }}
        >
          {messages.process}
        </Button>
      }
      load={(groupBy, sort) =>
        viewsApi.previewFilter(
          {
            mode: 'normal',
            rules: {
              combinator: 'AND',
              groups: [
                {
                  combinator: 'AND',
                  conditions: [{ field: 'list', op: 'in', value: [inbox.id] }],
                },
              ],
            },
          },
          { groupBy, sort },
        )
      }
    />
  );
}

function ProcessCard({
  messages,
  taskTitle,
  projects,
  onDate,
  onMove,
  onDone,
  onDelete,
  onSkip,
}: {
  readonly messages: Messages;
  readonly locale: string;
  readonly taskTitle: string;
  readonly projects: readonly Project[];
  readonly onDate: (preset: 'tomorrow' | 'next_week' | 'date', date?: string) => void;
  readonly onMove: (projectId: string) => void;
  readonly onDone: () => void;
  readonly onDelete: () => void;
  readonly onSkip: () => void;
}) {
  return (
    <article>
      <h2>{taskTitle}</h2>
      <div className="page-toolbar">
        <Button
          onClick={() => {
            onDate('date', new Date().toISOString());
          }}
        >
          {messages.processToday}
        </Button>
        <Button
          onClick={() => {
            onDate('tomorrow');
          }}
        >
          {messages.processTomorrow}
        </Button>
        <Button
          onClick={() => {
            onDate('next_week');
          }}
        >
          {messages.processWeek}
        </Button>
        <PeriodNavigator
          title={messages.processDate}
          date={new Date()}
          onPick={(date) => {
            onDate('date', date.toISOString());
          }}
        />
        <label>
          {messages.processMove}
          <select
            defaultValue=""
            onChange={(event) => {
              if (event.target.value.length > 0) {
                onMove(event.target.value);
              }
            }}
          >
            <option value="">{messages.listMove}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={onDone}>{messages.processDoneAction}</Button>
        <Button variant="danger" onClick={onDelete}>
          {messages.processDelete}
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          {messages.processSkip}
        </Button>
      </div>
    </article>
  );
}

export function CalendarPage() {
  const composerClient = useQueryClient();
  const taskChange = useCalendarTaskChange();
  const [draft, setDraft] = useState<{ slot: CalendarSlot; anchor: SlotAnchor } | null>(null);
  const [createdNotice, setCreatedNotice] = useState('');
  const closeDraft = useCallback(() => {
    setDraft(null);
  }, []);
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const timeZone = account.data?.time_zone ?? 'Europe/Madrid';
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => {
      setMobile(media.matches);
    };
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, []);
  const messages = useMessages();
  const locale = useAppLocale();
  const navigate = useNavigate();
  const { view } = useParams();
  const [params, setParams] = useSearchParams();
  const contextProject = params.get('project_id') ?? params.get('list') ?? undefined;
  const filterId = params.get('filter_id') ?? '';
  const tagId = params.get('tag_id') ?? '';
  const { params: sourceParams } = useCalendarSources();
  const selectedFilters = (sourceParams.get('filters') ?? '')
    .split(',')
    .filter((id) => id && id !== '-');
  const filterResults = useQueries({
    queries: selectedFilters.map((id) => ({
      queryKey: ['calendar-filter-tasks', id],
      queryFn: () => collectFilterTasks(id, {}),
    })),
  });
  const selectedTaskIds = selectedFilters.length
    ? new Set(
        filterResults.flatMap(
          (result) =>
            result.data?.groups.flatMap((group) => group.tasks.map((task) => task.id)) ?? [],
        ),
      )
    : null;
  const filterTasks = useQuery({
    queryKey: ['calendar-filter-tasks', filterId],
    queryFn: () => collectFilterTasks(filterId, {}),
    enabled: !!filterId,
  });
  const filterTaskIds = filterId
    ? new Set(filterTasks.data?.groups.flatMap((group) => group.tasks.map((task) => task.id)) ?? [])
    : null;
  const createAt = (slot: CalendarSlot, anchor: SlotAnchor) => {
    if (draft === null) setDraft({ slot, anchor });
  };
  const createOnDay = (day: string, anchor: SlotAnchor) => {
    createAt(allDaySlot(day, timeZone), anchor);
  };
  const requestedView = view === 'multi-week' ? 'two-weeks' : view;
  const knownView = CAL_VIEWS.includes(requestedView as (typeof CAL_VIEWS)[number]);
  const current =
    mobile && requestedView === 'quarter' ? 'month' : knownView ? requestedView : 'month';
  const ViewIcon = calendarViewIcon(current ?? 'month');
  const weekStart = usePreferences((state) => state.weekStart);
  const [cursor, setCursor] = useState(
    () => dayFromParam(params.get('date') ?? '') ?? localToday(new Date()),
  );

  useEffect(() => {
    // Preserve links and filters when opening desktop-only views on mobile.
    if (mobile && requestedView === 'quarter') {
      const query = new URLSearchParams(params);
      query.delete('weeks');
      runAction(
        Promise.resolve(
          navigate(
            { pathname: `/calendar/${current ?? 'month'}`, search: query.toString() },
            { replace: true },
          ),
        ),
      );
    } else if (view === 'multi-week' || (current === 'two-weeks' && params.has('weeks'))) {
      const query = new URLSearchParams(params);
      query.delete('weeks');
      runAction(
        Promise.resolve(
          navigate(
            { pathname: '/calendar/two-weeks', search: query.toString() },
            { replace: true },
          ),
        ),
      );
    } else if (view !== undefined && !knownView) {
      runAction(Promise.resolve(navigate('/calendar/month', { replace: true })));
    }
  }, [view, current, knownView, navigate, params, mobile, requestedView]);
  useEffect(() => {
    if (typeof current === 'string') {
      rememberCalendarView(current);
    }
  }, [current]);
  useEffect(() => {
    const date = dayFromParam(params.get('date') ?? '');
    if (date) setCursor(date);
  }, [params]);
  const [workweek, setWorkweek] = useState(
    () => localStorage.getItem('tick-tack-done.calendar-workweek') === 'true',
  );
  const agendaToday = useCalendarToday(timeZone);
  const agendaOrigin = localKey(cursor);
  const agendaQuery = useAgendaQuery(agendaOrigin, timeZone, current === 'agenda');
  const initialAgendaRange = agendaPageRange(agendaOrigin, 0, timeZone);
  const agendaScroll = useRef<HTMLDivElement>(null);
  const agendaAnchor = useRef<{ key: string; top: number } | null>(null);
  const agendaInitialized = useRef('');
  const [agendaEdges, setAgendaEdges] = useState({ start: false, end: false });
  const agendaScrollIntent = useRef(false);
  const agendaStart =
    dayFromParam(agendaQuery.data?.pages[0]?.range.startDay ?? initialAgendaRange.startDay) ??
    cursor;
  const agendaEnd =
    dayFromParam(agendaQuery.data?.pages.at(-1)?.range.endDay ?? initialAgendaRange.endDay) ??
    cursor;
  const agendaDays: Date[] = [];
  if (current === 'agenda') {
    for (let day = new Date(agendaStart); day < agendaEnd; day.setDate(day.getDate() + 1)) {
      agendaDays.push(new Date(day));
    }
  }
  const agendaTarget =
    agendaToday >= localKey(agendaStart) && agendaToday < localKey(agendaEnd)
      ? agendaToday
      : agendaOrigin;
  const allCells =
    current === 'agenda' ? agendaDays : viewDays(current ?? 'month', cursor, weekStart);
  const filteredCells =
    workweek && (current === 'week' || current === 'multi-day')
      ? allCells.filter((day) => day.getDay() !== 0 && day.getDay() !== 6)
      : allCells;
  const cells = filteredCells;
  const range = current === 'year' ? yearQueryRange(cursor) : monthQueryRange(cells);
  const rangedTasks = useQuery<Task[]>({
    enabled: current !== 'agenda',
    queryKey: ['calendar-tasks', range.dueAfter, range.dueBefore],
    queryFn: () =>
      collectTasks((query) => api.listTasks(query), {
        status: 'active',
        limit: 100,
        sort: 'due',
        dueAfter: range.dueAfter,
        dueBefore: range.dueBefore,
      }),
  });
  const tasks =
    current === 'agenda'
      ? { ...agendaQuery, data: agendaQuery.data?.pages.flatMap((page) => page.tasks) }
      : rangedTasks;
  const rangedEvents = useQuery<Awaited<ReturnType<typeof api.calendarEvents>>>({
    enabled: current !== 'agenda',
    queryKey: ['calendar-events', range.dueAfter, range.dueBefore],
    queryFn: () => api.calendarEvents(range.dueAfter, range.dueBefore),
  });
  const externalQuery =
    current === 'agenda'
      ? {
          ...agendaQuery,
          data: agendaQuery.data
            ? {
                tasks: agendaQuery.data.pages.flatMap((page) =>
                  Array.isArray(page.events.tasks) ? (page.events.tasks as unknown[]) : [],
                ),
                external: agendaQuery.data.pages.flatMap((page) =>
                  Array.isArray(page.events.external) ? (page.events.external as unknown[]) : [],
                ),
              }
            : undefined,
        }
      : rangedEvents;
  const startTaskIds = Array.isArray(externalQuery.data?.tasks)
    ? externalQuery.data.tasks.flatMap((value: unknown) => {
        if (typeof value !== 'object' || value === null) return [];
        const row = value as { id?: unknown; start_date?: unknown; due_date?: unknown };
        return typeof row.id === 'string' &&
          typeof row.start_date === 'string' &&
          !(tasks.data ?? []).some((task) => task.id === row.id)
          ? [row.id]
          : [];
      })
    : [];
  const startTasks = useQuery({
    queryKey: ['calendar-start-tasks', ...startTaskIds],
    queryFn: () => Promise.all(startTaskIds.map((id) => api.getTask(id))),
    enabled: startTaskIds.length > 0,
  });
  useLayoutEffect(() => {
    const node = agendaScroll.current;
    if (current !== 'agenda') {
      agendaInitialized.current = '';
      return;
    }
    if (!node) return;
    if (agendaAnchor.current) {
      if (tasks.isFetching || externalQuery.isFetching) return;
      const anchor = node.querySelector<HTMLElement>(
        `[data-agenda-day="${agendaAnchor.current.key}"]`,
      );
      if (anchor) node.scrollTop += anchor.getBoundingClientRect().top - agendaAnchor.current.top;
      agendaAnchor.current = null;
    } else if (agendaInitialized.current !== agendaOrigin) {
      const anchor = node.querySelector<HTMLElement>(`[data-agenda-day="${agendaTarget}"]`);
      if (anchor) {
        node.scrollTop += anchor.getBoundingClientRect().top - node.getBoundingClientRect().top;
        agendaInitialized.current = agendaOrigin;
      }
    }
    const start = node.scrollTop <= 1;
    const end = node.scrollHeight - node.scrollTop - node.clientHeight <= 1;
    setAgendaEdges((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    );
  });
  const extendAgenda = (direction: -1 | 1) => {
    if (tasks.isFetching || externalQuery.isFetching) return;
    agendaScrollIntent.current = false;
    const node = agendaScroll.current;
    if (node) {
      const anchor = [...node.querySelectorAll<HTMLElement>('[data-agenda-day]')].find(
        (day) => day.getBoundingClientRect().bottom > node.getBoundingClientRect().top,
      );
      if (anchor)
        agendaAnchor.current = {
          key: anchor.dataset.agendaDay ?? '',
          top: anchor.getBoundingClientRect().top,
        };
    }
    runAction(direction < 0 ? agendaQuery.fetchPreviousPage() : agendaQuery.fetchNextPage());
  };
  const subscriptions = useQuery({
    queryKey: ['calendar-subscriptions'],
    queryFn: () => api.listCalendarSubscriptions(),
  });
  const [openEvent, setOpenEvent] = useState<ExternalEventView | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const external = (Array.isArray(externalQuery.data?.external) ? externalQuery.data.external : [])
    .filter(isExternalEvent)
    .filter((event, index, all) => all.findIndex((other) => other.id === event.id) === index)
    .filter((event) => sourceSelected(sourceParams.get('cals'), event.subscription_id ?? ''));
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects.data?.items ?? []) {
      if (typeof project.color === 'string' && project.color.length > 0) {
        map.set(project.id, project.color);
      }
    }
    return map;
  }, [projects.data]);
  const dated = [...(tasks.data ?? []), ...(startTasks.data ?? [])]
    .filter(
      (task, index, all) =>
        (task.start_date ?? task.due_date) !== null &&
        (contextProject === undefined || task.project_id === contextProject) &&
        (!tagId || task.tag_ids.includes(tagId)) &&
        (!filterTaskIds || filterTaskIds.has(task.id)) &&
        (!selectedTaskIds || selectedTaskIds.has(task.id)) &&
        sourceSelected(sourceParams.get('lists'), task.project_id) &&
        (sourceParams.get('tags') === null ||
          task.tag_ids.some((id) => sourceSelected(sourceParams.get('tags'), id))) &&
        task.kind === 'task' &&
        all.findIndex((other) => other.id === task.id) === index,
    )
    .map((task) => ({ ...task, due_date: task.start_date ?? task.due_date })); // Calendar display date only; mutations still address the original task ID.
  const activeFilterCount =
    Number(!!contextProject) +
    Number(!!filterId) +
    Number(!!tagId) +
    Number(workweek && (current === 'week' || current === 'multi-day')) +
    ['lists', 'tags', 'cals', 'filters'].filter((key) => sourceParams.has(key)).length +
    subscriptionItems(subscriptions.data).filter((subscription) => !subscription.visible).length;
  const title =
    current === 'day' && mobile
      ? new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(cursor)
      : calendarTitle(locale, current ?? 'month', cursor, cells);
  const move = (delta: number): void => {
    const next = shiftView(cursor, current ?? 'month', delta, weekStart);
    setCursor(next);
    {
      const query = new URLSearchParams(params);
      query.set('date', localDateParam(next));
      setParams(query);
    }
  };
  return (
    <section className={`screen-page is-wide calendar-page calendar-${current ?? 'month'}`}>
      <header className="calendar-toolbar">
        <SidebarFoldButton />
        {current !== 'agenda' ? (
          <>
            <div className="calendar-nav">
              <Button
                aria-label={calendarShiftLabel(messages, current ?? 'month', -1)}
                onClick={() => {
                  move(-1);
                }}
              >
                ‹
              </Button>
              <Button
                onClick={() => {
                  const today = localToday(new Date());
                  setCursor(today);
                  const query = new URLSearchParams(params);
                  query.set('date', localDateParam(today));
                  setParams(query);
                }}
              >
                {messages.calToday}
              </Button>
              <Button
                aria-label={calendarShiftLabel(messages, current ?? 'month', 1)}
                onClick={() => {
                  move(1);
                }}
              >
                ›
              </Button>
            </div>
            <CalendarPeriod
              title={
                mobile && (current === 'year' || current === 'week')
                  ? new Intl.DateTimeFormat(
                      locale,
                      current === 'year' ? { year: 'numeric' } : { month: 'long' },
                    ).format(cursor)
                  : title
              }
              date={cursor}
              onPick={(date) => {
                setCursor(date);
                const query = new URLSearchParams(params);
                query.set('date', localKey(date));
                setParams(query);
              }}
            />
          </>
        ) : null}
        {current === 'week' || current === 'multi-day' ? (
          <span className="calendar-week-number">S{isoWeek(cells[0] ?? cursor)}</span>
        ) : null}
        {current !== 'agenda' ? (
          <Button
            className="calendar-add"
            aria-label={messages.captureTitle}
            onClick={() => {
              openTaskComposer(composerContextFor(window.location, { cache: composerClient }));
            }}
          >
            <Plus size={17} aria-hidden="true" />
          </Button>
        ) : null}
        <CalendarMenu
          className="calendar-filter-menu"
          label={messages.calendarFilterTitle}
          trigger={
            <span className="calendar-filter-indicator" data-active={activeFilterCount > 0}>
              <ListFilter size={22} aria-hidden="true" />
              {activeFilterCount > 0 ? (
                <sup
                  className="calendar-filter-count"
                  aria-label={messages.calendarActiveFilters.replace(
                    '{count}',
                    String(activeFilterCount),
                  )}
                >
                  {activeFilterCount}
                </sup>
              ) : null}
            </span>
          }
        >
          {() => (
            <div className="calendar-filter-content">
              <CalendarSources />
              {current === 'week' || current === 'multi-day' ? (
                <label>
                  <input
                    type="checkbox"
                    checked={workweek}
                    onChange={(event) => {
                      setWorkweek(event.target.checked);
                      localStorage.setItem(
                        'tick-tack-done.calendar-workweek',
                        String(event.target.checked),
                      );
                    }}
                  />
                  {messages.calWorkweek}
                </label>
              ) : null}
            </div>
          )}
        </CalendarMenu>
        <CalendarMenu
          className="calendar-mobile-views"
          label={messages.calendarTitle}
          trigger={<ViewIcon size={22} aria-hidden="true" data-view={current} />}
        >
          {(close) => (
            <div className="calendar-view-links mobile-view-links">
              {['agenda', 'year', 'month', 'week', 'two-weeks', 'multi-day', 'day', 'quarter']
                .filter((item) => !mobile || item !== 'quarter')
                .map((item) => {
                  const Icon = calendarViewIcon(item);
                  return (
                    <Link
                      key={item}
                      aria-current={current === item ? 'page' : undefined}
                      to={`/calendar/${item}?${new URLSearchParams({ ...Object.fromEntries(params), date: localKey(cursor) })}`}
                      onClick={close}
                    >
                      <Icon size={21} aria-hidden="true" />
                      <span>{labelView(messages, item)}</span>
                      {current === item ? <Check size={20} aria-hidden="true" /> : null}
                    </Link>
                  );
                })}
            </div>
          )}
        </CalendarMenu>
      </header>
      {current === 'day' && mobile ? (
        <DayWeekStrip
          selected={cursor}
          weekStart={weekStart}
          onSelect={(day) => {
            setCursor(day);
            const query = new URLSearchParams(params);
            query.set('date', localKey(day));
            setParams(query);
          }}
        />
      ) : null}
      {tasks.isPending ||
      externalQuery.isPending ||
      (startTaskIds.length > 0 && startTasks.isPending) ? (
        <SkeletonRows />
      ) : null}
      {tasks.isError || externalQuery.isError || startTasks.isError ? (
        <ErrorState
          title={fill(messages.loadFailed, messages.calendarTitle)}
          retryLabel={messages.retry}
          onRetry={() => {
            if (current === 'agenda') runAction(agendaQuery.refetch());
            else {
              runAction(rangedTasks.refetch());
              runAction(rangedEvents.refetch());
            }
            if (startTaskIds.length) runAction(startTasks.refetch());
          }}
        />
      ) : null}
      {openEvent !== null ? (
        <ExternalEventPopover
          event={openEvent}
          messages={messages}
          locale={locale}
          onClose={() => {
            setOpenEvent(null);
          }}
        />
      ) : null}
      {!tasks.isPending &&
      !externalQuery.isPending &&
      !(startTaskIds.length > 0 && startTasks.isPending) &&
      !startTasks.isError &&
      !tasks.isError &&
      !externalQuery.isError ? (
        <>
          {current === 'quarter' ? (
            <YearBoard
              onCreateDay={createOnDay}
              year={cursor.getFullYear()}
              months={quarterMonths(cursor).map((month) => month.getMonth())}
              tasks={dated}
              events={external}
              weekStart="monday"
              colors={colors}
              onOpen={(month) => {
                setCursor(new Date(cursor.getFullYear(), month, 1));
                runAction(
                  Promise.resolve(
                    navigate(
                      `/calendar/month?date=${localKey(new Date(cursor.getFullYear(), month, 1))}`,
                    ),
                  ),
                );
              }}
            />
          ) : null}
          {current === 'year' ? (
            <YearBoard
              onCreateDay={createOnDay}
              onMove={move}
              year={cursor.getFullYear()}
              events={external}
              tasks={dated}
              weekStart={weekStart}
              colors={colors}
              onOpen={(month) => {
                setCursor(new Date(cursor.getFullYear(), month, 1));
                runAction(
                  Promise.resolve(
                    navigate(
                      `/calendar/month?date=${localKey(new Date(cursor.getFullYear(), month, 1))}`,
                    ),
                  ),
                );
              }}
            />
          ) : null}
          {current === 'agenda' ? (
            <div
              className="calendar-agenda-timeline"
              tabIndex={0}
              role="region"
              aria-label={messages.calAgenda}
              onWheel={(event) => {
                agendaScrollIntent.current = true;
                const node = event.currentTarget;
                if (
                  event.deltaY > 0 &&
                  node.scrollHeight - node.scrollTop - node.clientHeight < 120
                )
                  extendAgenda(1);
                else if (event.deltaY < 0 && node.scrollTop < 120) extendAgenda(-1);
              }}
              onTouchMove={() => {
                agendaScrollIntent.current = true;
              }}
              onKeyDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(
                    event.key,
                  )
                )
                  agendaScrollIntent.current = true;
              }}
              ref={agendaScroll}
              data-at-start={agendaEdges.start}
              data-at-end={agendaEdges.end}
              onScroll={(event) => {
                const node = event.currentTarget;
                setAgendaEdges({
                  start: node.scrollTop <= 1,
                  end: node.scrollHeight - node.scrollTop - node.clientHeight <= 1,
                });
                if (
                  agendaScrollIntent.current &&
                  agendaInitialized.current === agendaOrigin &&
                  !agendaQuery.isFetching &&
                  node.scrollHeight > node.clientHeight
                ) {
                  if (node.scrollTop < 120) extendAgenda(-1);
                  else if (node.scrollHeight - node.scrollTop - node.clientHeight < 120)
                    extendAgenda(1);
                }
              }}
            >
              <Button
                variant="ghost"
                className="calendar-agenda-extend"
                aria-label={messages.calendarAgendaPrevious}
                onClick={() => {
                  extendAgenda(-1);
                }}
                disabled={tasks.isFetching || externalQuery.isFetching}
              >
                <ChevronUp size={16} aria-hidden="true" />
                <span>
                  {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                    new Date(agendaStart.getFullYear(), agendaStart.getMonth() - 1, 1),
                  )}
                </span>
              </Button>
              <Agenda
                onCreateDay={createOnDay}
                days={cells}
                anchorDay={agendaTarget}
                showMonths
                tasks={dated}
                events={external}
                locale={locale}
                messages={messages}
                colors={colors}
                onOpenEvent={setOpenEvent}
              />
              <Button
                variant="ghost"
                className="calendar-agenda-extend"
                aria-label={messages.calendarAgendaNext}
                onClick={() => {
                  extendAgenda(1);
                }}
                disabled={tasks.isFetching || externalQuery.isFetching}
              >
                <span>
                  {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                    agendaEnd,
                  )}
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {current === 'week' && mobile ? (
            <MobileWeekBoard
              onTaskChange={taskChange.change}
              onCreateDay={createOnDay}
              days={cells}
              cursor={cursor}
              tasks={dated}
              events={external}
              colors={colors}
              weekStart={weekStart}
              timeZone={timeZone}
              onMove={move}
              onOpenEvent={setOpenEvent}
            />
          ) : current === 'day' || current === 'week' || current === 'multi-day' ? (
            <HourGrid
              onTaskChange={taskChange.change}
              onOpenDay={setPicked}
              days={cells}
              tasks={dated}
              events={external}
              colors={colors}
              messages={messages}
              onOpenEvent={setOpenEvent}
              onCreateAt={createAt}
              draftSlot={draft?.slot}
              timeZone={timeZone}
            />
          ) : null}
          {current === 'two-weeks' || current === 'month' ? (
            <>
              <DayGrid
                onTaskChange={taskChange.change}
                days={current === 'month' ? monthCells(startOfMonth(cursor), weekStart) : cells}
                columns={7}
                tasks={dated}
                events={external}
                colors={colors}
                onOpenEvent={setOpenEvent}
                messages={messages}
                cursor={cursor}
                outsideMonth
                onNavigate={current === 'month' ? move : undefined}
                onPick={setPicked}
                onCreateAt={createAt}
                draftingDay={draft ? calendarDay(draft.slot.start, timeZone) : null}
                timeZone={timeZone}
              />
            </>
          ) : null}
        </>
      ) : null}
      {taskChange.feedback}
      {picked !== null ? (
        <DaySheet
          dayKey={picked}
          tasks={dated}
          events={external}
          messages={messages}
          colors={colors}
          onOpenEvent={setOpenEvent}
          onClose={() => {
            setPicked(null);
          }}
        />
      ) : null}
      {draft ? (
        <QuickAddPopover
          slot={draft.slot}
          anchor={draft.anchor}
          defaultProjectId={contextProject}
          onClose={closeDraft}
          onCreated={(notice) => {
            setCreatedNotice(
              messages.calendarQuickCreated.replace(
                '{name}',
                notice.title +
                  ' · ' +
                  new Date(notice.when ?? draft.slot.start).toLocaleString(locale, {
                    timeZone,
                    dateStyle: 'medium',
                    ...(draft.slot.allDay ? {} : { timeStyle: 'short' }),
                  }),
              ),
            );
            setDraft(null);
          }}
        />
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {createdNotice}
      </p>
    </section>
  );
}

function startOfMonth(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

function localKey(day: Date): string {
  if (Number.isNaN(day.getTime())) {
    return '';
  }
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${String(day.getFullYear())}-${month}-${date}`;
}

function calendarTitle(locale: string, view: string, cursor: Date, cells: readonly Date[]): string {
  if (view === 'year') {
    return String(cursor.getFullYear());
  }
  if (view === 'quarter') {
    const months = quarterMonths(cursor);
    const first = months[0] ?? cursor;
    const last = months[2] ?? cursor;
    const start = new Intl.DateTimeFormat(locale, { month: 'long' }).format(first);
    const end = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(last);
    return `${start} – ${end}`;
  }
  if (view === 'day') {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(cursor);
  }
  const first = cells[0] ?? cursor;
  const last = cells.at(-1) ?? cursor;
  if (view === 'week' || view === 'multi-day' || view === 'two-weeks' || view === 'agenda') {
    const sameMonth = first.getMonth() === last.getMonth();
    const start = new Intl.DateTimeFormat(
      locale,
      sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' },
    ).format(first);
    const end = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(last);
    return `${start} – ${end}`;
  }
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor);
}

function DayGrid({
  onTaskChange,
  days,
  columns,
  tasks,
  events = [],
  colors = new Map<string, string>(),
  onOpenEvent,
  messages,
  cursor,
  outsideMonth,
  onNavigate,
  onPick,
  dots = false,
  onCreateAt,
  draftingDay,
  timeZone = 'Europe/Madrid',
}: {
  readonly onTaskChange?: CalendarTaskChange | undefined;
  readonly onCreateAt?: ((slot: CalendarSlot, anchor: SlotAnchor) => void) | undefined;
  readonly draftingDay?: string | null;
  readonly timeZone?: string;
  readonly days: readonly Date[];
  readonly columns: number;
  readonly tasks: readonly Task[];
  readonly events?: readonly ExternalEventView[];
  readonly colors?: ReadonlyMap<string, string>;
  readonly onOpenEvent?: (event: ExternalEventView) => void;
  readonly messages: Messages;
  readonly cursor: Date;
  readonly outsideMonth: boolean;
  readonly onNavigate?: ((delta: number) => void) | undefined;
  readonly onPick?: (dayKey: string) => void;
  readonly dots?: boolean;
}) {
  const location = useLocation();
  const locale = useAppLocale();
  const verticalNavigation = useVerticalCalendarNavigation(onNavigate);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useCalendarDrag(grid, timeZone, onTaskChange);
  const [overflow, setOverflow] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const counts: Record<string, number> = {};
      const barSpace = new Map<number, number>();
      const hiddenBars = new Map<string, number>();
      for (const bar of node.querySelectorAll<HTMLElement>('.calendar-month-span')) {
        const week = Number(bar.dataset.week);
        const cell = node.querySelector<HTMLElement>(`[data-week="${String(week)}"].cal-cell`);
        const offset = barSpace.get(week) ?? 0;
        const height = bar.getBoundingClientRect().height;
        const visible = !!cell && offset + height <= cell.clientHeight * 0.5;
        bar.style.marginTop = `${String(32 + offset)}px`;
        bar.style.visibility = visible ? 'visible' : 'hidden';
        bar.inert = !visible;
        bar.setAttribute('aria-hidden', String(!visible));
        if (visible) barSpace.set(week, offset + height + 3);
        else
          for (const cell of node.querySelectorAll<HTMLElement>(
            `.cal-cell[data-week="${String(week)}"]`,
          )) {
            const col = Number(cell.dataset.column);
            if (
              col >= Number(bar.dataset.column) &&
              col < Number(bar.dataset.column) + Number(bar.dataset.span)
            ) {
              const key = cell.dataset.day ?? '';
              hiddenBars.set(key, (hiddenBars.get(key) ?? 0) + 1);
            }
          }
      }
      for (const cell of node.querySelectorAll<HTMLElement>('.cal-cell')) {
        const key = cell.dataset.day ?? '';
        const list = cell.querySelector<HTMLElement>('.calendar-cell-items');
        if (!list) continue;
        const space = window.innerWidth <= 700 ? 0 : (barSpace.get(Number(cell.dataset.week)) ?? 0);
        list.style.marginTop = `${String(space)}px`;
        const children = [...list.children] as HTMLElement[];
        const room = cell.clientHeight - list.offsetTop - 4;
        const heights = children.map((child) => child.offsetHeight + 3);
        const total = heights.reduce((sum, height) => sum + height, 0);
        const maxItems = node.closest('.calendar-two-weeks') ? 5 : Number.POSITIVE_INFINITY;
        const reserve = total > room || children.length > maxItems || hiddenBars.has(key) ? 26 : 0;
        let used = 0;
        let hidden = hiddenBars.get(key) ?? 0;
        children.forEach((child, index) => {
          used += heights[index] ?? 0;
          const visible = index < maxItems && used <= room - reserve;
          child.style.visibility = visible ? 'visible' : 'hidden';
          child.inert = !visible;
          child.setAttribute('aria-hidden', String(!visible));
          if (!visible) hidden++;
        });
        counts[key] = hidden;
      }
      setOverflow((previous) =>
        JSON.stringify(previous) === JSON.stringify(counts) ? previous : counts,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    node
      .querySelectorAll('.cal-cell, .calendar-cell-items > *, .calendar-month-span')
      .forEach((child) => {
        observer.observe(child);
      });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [days, tasks, events]);
  const todayKey = useCalendarToday();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const heads = Array.from({ length: columns }, (_, index) =>
    weekday.format(days[index] ?? cursor),
  );
  const weeks = Array.from({ length: Math.ceil(days.length / columns) }, (_, index) =>
    days.slice(index * columns, (index + 1) * columns),
  );
  const bars = weeks.flatMap((week, weekIndex) =>
    events
      .filter(
        (event) => event.is_all_day && eventDayRange(event).start !== eventDayRange(event).end,
      )
      .flatMap((event) => {
        const position = eventSpan(event, week);
        return position ? [{ event, position, weekIndex }] : [];
      }),
  );
  return (
    <div
      ref={grid}
      {...verticalNavigation}
      className={dots ? 'cal-month is-dots' : 'cal-month'}
      style={{
        gridTemplateColumns: `${dots ? '' : '2rem '}repeat(${String(columns)}, minmax(0, 1fr))`,
      }}
    >
      <span id={drag.helpId} className="sr-only">
        {messages.calendarDragHelp}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
      {!dots ? (
        <div className="cal-head" aria-label={messages.calWeekNumber}>
          S
        </div>
      ) : null}
      {heads.map((label, index) => (
        <div key={`${label}-${String(index)}`} className="cal-head">
          {label}
        </div>
      ))}
      {days.map((day, index) => {
        const items = tasksOnCell(tasks, day);
        const dayEvents = eventsOnDay(events, day);
        const chips = mixChips(items, dayEvents);
        const key = localKey(day);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const outside = outsideMonth && day.getMonth() !== cursor.getMonth();
        const href = overflowHref(day);
        const classes = [
          'cal-cell',
          key === draftingDay ? 'is-drafting' : '',
          weekend ? 'is-weekend' : '',
          key === todayKey ? 'is-today' : '',
          outside ? 'is-outside' : '',
        ]
          .filter((item) => item.length > 0)
          .join(' ');
        return (
          <Fragment key={key}>
            {!dots && index % columns === 0 ? (
              <span
                className="cal-week-number"
                style={{ gridColumn: 1, gridRow: Math.floor(index / columns) + 2 }}
              >
                {isoWeek(day)}
              </span>
            ) : null}
            <div
              className={classes}
              tabIndex={onCreateAt ? 0 : undefined}
              role={onCreateAt ? 'gridcell' : undefined}
              aria-label={
                onCreateAt
                  ? messages.calendarQuickCreateAt.replace(
                      '{name}',
                      day.toLocaleDateString(locale, { dateStyle: 'full' }),
                    )
                  : undefined
              }
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  !event.target.closest('button, a, input, .calendar-cell-task')
                )
                  onCreateAt?.(allDaySlot(key, timeZone), {
                    x: event.clientX,
                    y: event.clientY,
                    element: event.currentTarget,
                  });
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  onCreateAt?.(allDaySlot(key, timeZone), {
                    x: box.right,
                    y: box.top,
                    element: event.currentTarget,
                  });
                }
              }}
              data-calendar-drop-day={key}
              data-calendar-drop-kind="day"
              data-day={key}
              data-week={Math.floor(index / columns)}
              data-column={(index % columns) + 2}
              style={{
                gridColumn: (index % columns) + (dots ? 1 : 2),
                gridRow: Math.floor(index / columns) + 2,
              }}
              title={
                dots
                  ? chips
                      .map((chip) => (chip.kind === 'task' ? chip.task.title : chip.event.title))
                      .join(' · ')
                  : undefined
              }
            >
              <strong>
                {onPick !== undefined ? (
                  <button
                    type="button"
                    aria-label={`${day.toLocaleDateString(locale, { dateStyle: 'full' })}, ${String(chips.length)} ${chips.length === 1 ? messages.calendarItem : messages.calendarItems}`}
                    aria-current={key === todayKey ? 'date' : undefined}
                    onClick={() => {
                      onPick(key);
                    }}
                  >
                    <TodayMark today={key === todayKey}>{day.getDate()}</TodayMark>
                  </button>
                ) : (
                  <Link to={href}>
                    <TodayMark today={key === todayKey}>{day.getDate()}</TodayMark>
                  </Link>
                )}
              </strong>
              <span className="cal-dots" aria-hidden="true">
                {chips.map((chip) => (
                  <i
                    key={chip.kind === 'task' ? chip.task.id : chip.event.id}
                    style={{
                      background:
                        chip.kind === 'task'
                          ? (colors.get(chip.task.project_id) ?? 'var(--accent)')
                          : (chip.event.color ?? 'var(--accent)'),
                    }}
                  />
                ))}
              </span>
              <div className="calendar-cell-items">
                {dots
                  ? null
                  : chips
                      .filter(
                        (chip) =>
                          chip.kind === 'task' ||
                          !chip.event.is_all_day ||
                          eventDayRange(chip.event).start === eventDayRange(chip.event).end,
                      )
                      .map((chip) =>
                        chip.kind === 'task' ? (
                          <div
                            key={chip.task.id}
                            {...drag.bindTask(chip.task, true)}
                            className="calendar-cell-task calendar-chip"
                            style={chipStyle(colors.get(chip.task.project_id))}
                          >
                            <CalendarTaskMark task={chip.task} />
                            <Link
                              title={chipLabel(chip.task, messages.untitled, locale)}
                              className={
                                isCalendarOverdue(
                                  chip.task.due_date,
                                  chip.task.time_zone,
                                  new Date(),
                                )
                                  ? 'cal-pill is-overdue'
                                  : 'cal-pill'
                              }
                              to={taskQueryHref(location.pathname, location.search, chip.task.id)}
                            >
                              {calendarTaskLabel(
                                chip.task.title,
                                chip.task.due_date,
                                chip.task.time_zone,
                                messages.untitled,
                              )}
                            </Link>
                            {!chip.task.is_all_day && chip.task.due_date ? (
                              <time dateTime={chip.task.due_date}>
                                {formatDueTime(chip.task.due_date, chip.task.time_zone, locale)}
                              </time>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            key={chip.event.id}
                            {...drag.external}
                            title={chip.event.title}
                            type="button"
                            className="cal-pill calendar-chip"
                            style={chipStyle(chip.event.color)}
                            onClick={() => {
                              onOpenEvent?.(chip.event);
                            }}
                          >
                            <CalendarDays
                              size={13}
                              aria-hidden="true"
                              className="calendar-event-mark"
                            />
                            <span>{chip.event.title}</span>
                            {!chip.event.is_all_day ? (
                              <time dateTime={chip.event.starts_at}>
                                {localKey(day) > eventDayRange(chip.event).start
                                  ? '00:00'
                                  : clockLabel(chip.event.starts_at, locale)}
                              </time>
                            ) : null}
                          </button>
                        ),
                      )}
              </div>
              {(overflow[key] ?? 0) > 0 ? (
                <button type="button" className="calendar-overflow" onClick={() => onPick?.(key)}>
                  +{overflow[key]} {messages.calendarMoreViews.toLocaleLowerCase(locale)}
                </button>
              ) : null}
            </div>
          </Fragment>
        );
      })}
      {!dots
        ? bars.map((bar) => {
            return (
              <button
                key={`${bar.event.id}-${String(bar.weekIndex)}`}
                {...drag.external}
                type="button"
                className="cal-pill calendar-month-span calendar-chip"
                data-week={bar.weekIndex}
                data-column={bar.position.column}
                data-span={bar.position.span}
                style={{
                  ...chipStyle(bar.event.color),
                  gridColumn: `${String(bar.position.column)} / span ${String(bar.position.span)}`,
                  gridRow: bar.weekIndex + 2,
                }}
                onClick={() => {
                  onOpenEvent?.(bar.event);
                }}
              >
                <CalendarDays size={13} aria-hidden="true" />
                <span>{bar.event.title}</span>
              </button>
            );
          })
        : null}
    </div>
  );
}

function createInDaySpaceWithKey(
  event: KeyboardEvent<HTMLElement>,
  day: string,
  onCreate?: (day: string, anchor: SlotAnchor) => void,
) {
  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  const box = event.currentTarget.getBoundingClientRect();
  onCreate?.(day, { element: event.currentTarget, x: box.left, y: box.top });
}

function createInDaySpace(
  event: MouseEvent<HTMLElement>,
  day: string,
  onCreate?: (day: string, anchor: SlotAnchor) => void,
) {
  if (
    !(event.target instanceof Element) ||
    event.target.closest('button, a, input, header, .mobile-week-chip, .agenda-row')
  )
    return;
  onCreate?.(day, { element: event.currentTarget, x: event.clientX, y: event.clientY });
}

function MobileWeekBoard({
  onTaskChange,
  days,
  cursor,
  tasks,
  events,
  colors,
  weekStart,
  timeZone,
  onMove,
  onOpenEvent,
  onCreateDay,
}: {
  readonly onTaskChange?: CalendarTaskChange | undefined;
  readonly onCreateDay?: ((day: string, anchor: SlotAnchor) => void) | undefined;
  days: readonly Date[];
  cursor: Date;
  tasks: readonly Task[];
  events: readonly ExternalEventView[];
  colors: ReadonlyMap<string, string>;
  weekStart: 'monday' | 'sunday';
  timeZone: string;
  onMove: (delta: number) => void;
  onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const today = useCalendarToday();
  const location = useLocation();
  const board = useRef<HTMLDivElement>(null);
  const drag = useCalendarDrag(board, timeZone, onTaskChange);
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const suppressClick = useRef(0);
  const mini = monthCells(cursor, weekStart);
  const selected = new Set(days.map(localKey));
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone });
  return (
    <div
      ref={board}
      className={`mobile-week-board${days.length === 5 ? ' is-workweek' : ''}`}
      tabIndex={0}
      aria-label={messages.calWeek}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          !['ArrowLeft', 'ArrowRight'].includes(event.key)
        )
          return;
        event.preventDefault();
        onMove(event.key === 'ArrowLeft' ? -1 : 1);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch' || !event.isPrimary) {
          gesture.current = null;
          return;
        }
        gesture.current = { x: event.clientX, y: event.clientY, at: Date.now() };
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (
          Date.now() - start.at < 700 &&
          Math.abs(dx) >= 65 &&
          Math.abs(dx) > Math.abs(dy) * 1.5
        ) {
          suppressClick.current = Date.now() + 400;
          onMove(dx < 0 ? 1 : -1);
        }
      }}
      onClickCapture={(event) => {
        if (Date.now() < suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <span id={drag.helpId} className="sr-only">
        {messages.calendarDragHelp}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
      <div className="mobile-week-mini" aria-label={messages.calendarSidebarTitle}>
        {mini.slice(0, 7).map((day) => (
          <span className="mobile-week-dow" key={localKey(day)}>
            {day.toLocaleDateString(locale, { weekday: 'narrow' })}
          </span>
        ))}
        {mini.map((day) => {
          const key = localKey(day);
          return (
            <Link
              key={key}
              to={`/calendar/week?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), date: key })}`}
              aria-label={day.toLocaleDateString(locale, { dateStyle: 'full' })}
              aria-current={key === today ? 'date' : undefined}
              className={`${selected.has(key) ? 'is-selected' : ''} ${day.getMonth() !== cursor.getMonth() ? 'is-outside' : ''}`}
            >
              <TodayMark today={key === today}>{day.getDate()}</TodayMark>
            </Link>
          );
        })}
      </div>
      {days.map((day, index) => {
        const key = localKey(day);
        const chips = mixChips(
          tasksOnCell(tasks, day, timeZone),
          events.filter((event) => {
            const range = eventDayRange(event, timeZone);
            return key >= range.start && key <= range.end;
          }),
        );
        return (
          <section
            className="mobile-week-day"
            data-calendar-drop-day={key}
            data-calendar-drop-kind="day"
            tabIndex={onCreateDay ? 0 : undefined}
            onKeyDown={(event) => {
              createInDaySpaceWithKey(event, key, onCreateDay);
            }}
            onClick={(event) => {
              createInDaySpace(event, key, onCreateDay);
            }}
            key={key}
            aria-label={day.toLocaleDateString(locale, { dateStyle: 'full' })}
          >
            <header>
              <Link
                className="mobile-week-day-link"
                to={`/calendar/day?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), date: key })}`}
                aria-current={key === today ? 'date' : undefined}
              >
                {day.toLocaleDateString(locale, { weekday: 'short' })}{' '}
                <TodayMark today={key === today}>{day.getDate()}</TodayMark>
              </Link>
              {index === 0 ? <small>S{isoWeek(day)}</small> : null}
            </header>
            <div className="mobile-week-items">
              {chips.map((item) => {
                if (item.kind === 'event') {
                  const event = item.event;
                  return (
                    <button
                      type="button"
                      {...drag.external}
                      className="mobile-week-chip calendar-chip"
                      key={`event-${event.id}`}
                      style={chipStyle(event.color)}
                      onClick={() => {
                        onOpenEvent(event);
                      }}
                    >
                      <CalendarDays size={12} aria-hidden="true" />
                      <span>{event.title}</span>
                      {!event.is_all_day ? (
                        <time>{time.format(new Date(event.starts_at))}</time>
                      ) : null}
                    </button>
                  );
                }
                const task = item.task;
                return (
                  <div
                    {...drag.bindTask(task, true)}
                    className="mobile-week-chip calendar-chip"
                    key={task.id}
                    style={chipStyle(colors.get(task.project_id))}
                  >
                    <CalendarTaskMark task={task} />
                    <Link
                      className={
                        isCalendarOverdue(task.due_date, task.time_zone, new Date())
                          ? 'is-overdue'
                          : undefined
                      }
                      to={taskQueryHref(location.pathname, location.search, task.id)}
                    >
                      {displayTitle(task.title)}
                    </Link>
                    {!task.is_all_day && task.due_date ? (
                      <time>{time.format(new Date(task.due_date))}</time>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function YearBoard({
  year,
  onMove,
  months = Array.from({ length: 12 }, (_, index) => index),
  events = [],
  tasks,
  weekStart,
  colors,
  onOpen,
  onCreateDay,
}: {
  readonly onCreateDay?: ((day: string, anchor: SlotAnchor) => void) | undefined;
  readonly year: number;
  readonly onMove?: (delta: number) => void;
  readonly months?: readonly number[];
  readonly events?: readonly ExternalEventView[];
  readonly tasks: readonly Task[];
  readonly weekStart: 'monday' | 'sunday';
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpen: (month: number) => void;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const todayKey = useCalendarToday();
  const verticalNavigation = useVerticalCalendarNavigation(onMove);
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const sample = monthCells(new Date(year, 0, 1), weekStart);
  const heads = sample.slice(0, 7).map((day) => weekday.format(day));
  return (
    <div
      className={months.length === 3 ? 'year-board is-quarter' : 'year-board'}
      tabIndex={onMove ? 0 : undefined}
      onKeyDown={(event) => {
        if (
          !onMove ||
          event.target !== event.currentTarget ||
          !['PageUp', 'PageDown'].includes(event.key)
        )
          return;
        event.preventDefault();
        onMove(event.key === 'PageDown' ? 1 : -1);
      }}
      {...verticalNavigation}
    >
      {months.map((month) => {
        const cells = monthCells(new Date(year, month, 1), weekStart);
        return (
          <section key={month} className="year-card">
            <button
              type="button"
              className="year-month"
              onClick={() => {
                onOpen(month);
              }}
            >
              {monthName.format(new Date(year, month, 1))}
            </button>
            <div
              className="year-mini"
              style={
                months.length === 3
                  ? { gridTemplateColumns: '1.5rem repeat(7,minmax(0,1fr))' }
                  : undefined
              }
            >
              {months.length === 3 ? <span className="year-dow">S</span> : null}
              {heads.map((label, index) => (
                <span key={`${label}-${String(index)}`} className="year-dow">
                  {label}
                </span>
              ))}
              {cells.map((day, index) => {
                const key = localKey(day);
                const inside = day.getMonth() === month;
                const marks = inside
                  ? [
                      ...dayMarks(tasks, day, colors),
                      ...eventsOnDay(events, day).map((event) => event.color ?? 'var(--accent)'),
                    ]
                  : [];
                const when = new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(day);
                return (
                  <Fragment key={key}>
                    {months.length === 3 && index % 7 === 0 ? (
                      <span className="year-week-number">{isoWeek(day)}</span>
                    ) : null}
                    <Link
                      className={[
                        'year-day',
                        inside ? '' : 'is-outside',
                        key === todayKey ? 'is-today' : '',
                      ]
                        .filter((item) => item.length > 0)
                        .join(' ')}
                      onClick={(event) => {
                        if (
                          !onCreateDay ||
                          (event.target instanceof Element && event.target.closest('.year-num'))
                        )
                          return;
                        event.preventDefault();
                        onCreateDay(key, {
                          element: event.currentTarget,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      to={`/calendar/day?date=${key}`}
                      aria-current={key === todayKey ? 'date' : undefined}
                      aria-label={`${when}, ${String(tasksOnCell(tasks, day).length + eventsOnDay(events, day).length)} ${tasksOnCell(tasks, day).length + eventsOnDay(events, day).length === 1 ? messages.calendarItem : messages.calendarItems}`}
                    >
                      <TodayMark className="year-num" today={key === todayKey}>
                        {day.getDate()}
                      </TodayMark>
                      <span className="year-marks" aria-hidden="true">
                        {marks.map((color, index) => (
                          <i key={`${color}-${String(index)}`} style={{ background: color }} />
                        ))}
                      </span>
                    </Link>
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function dayMarks(
  tasks: readonly Task[],
  day: Date,
  colors: ReadonlyMap<string, string>,
): string[] {
  const seen = new Set<string>();
  for (const task of tasksOnCell(tasks, day)) {
    const color = colors.get(task.project_id);
    seen.add(color !== undefined && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : 'var(--accent)');
    if (seen.size === 3) {
      break;
    }
  }
  return [...seen];
}

function Agenda({
  days,
  anchorDay,
  showMonths = false,
  tasks,
  events,
  locale,
  messages,
  colors,
  onOpenEvent,
  onCreateDay,
}: {
  readonly onCreateDay?: ((day: string, anchor: SlotAnchor) => void) | undefined;
  readonly days?: readonly Date[];
  readonly anchorDay?: string;
  readonly showMonths?: boolean;
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly locale: string;
  readonly messages: Messages;
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const location = useLocation();
  const cache = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const todayKey = useCalendarToday();
  type Item =
    | { kind: 'task'; task: Task; time: string }
    | { kind: 'event'; event: ExternalEventView; time: string };
  const groups = new Map<string, Item[]>();
  if (anchorDay) groups.set(anchorDay, []);
  function add(key: string, item: Item): void {
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  for (const task of tasks) {
    if (task.due_date !== null)
      add(calendarDay(task.due_date, task.time_zone), {
        kind: 'task',
        task,
        time: task.is_all_day ? '' : task.due_date,
      });
  }
  for (const event of events) {
    const range = eventDayRange(event);
    const dates = days
      ? days.map(localKey).filter((key) => key >= range.start && key <= range.end)
      : [range.start];
    for (const key of dates)
      add(key, {
        kind: 'event',
        event,
        time: event.is_all_day ? '' : key > range.start ? `${key}T00:00` : event.starts_at,
      });
  }
  const emptyMonths = new Set<string>();
  if (showMonths) {
    const months = new Set((days ?? []).map((day) => localKey(day).slice(0, 7)));
    for (const month of months) {
      if (![...groups.keys()].some((key) => key.startsWith(month))) {
        const key = `${month}-01`;
        groups.set(key, []);
        emptyMonths.add(key);
      }
    }
  }
  const visibleKeys = days ? new Set(days.map(localKey)) : null;
  const forward = [...groups.entries()]
    .filter(([key]) => !visibleKeys || visibleKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
  });
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  if (forward.length === 0)
    return <EmptyState title={messages.calendarTitle} body={messages.calEmpty} />;
  return (
    <div className="agenda">
      {error !== null ? <p role="alert">{error}</p> : null}
      {forward.map(([key, bucket], index) => {
        const day = dayFromParam(key) ?? new Date();
        const previous = forward[index - 1]?.[0];
        const heading =
          key === todayKey ? `${messages.calToday} · ${weekday.format(day)}` : weekday.format(day);
        return (
          <Fragment key={key}>
            {previous?.slice(0, 7) !== key.slice(0, 7) ? (
              <h2 className="agenda-month" data-agenda-month={key.slice(0, 7)}>
                {monthName.format(day)}
              </h2>
            ) : null}
            {emptyMonths.has(key) ? (
              <p
                className="ui-muted"
                tabIndex={onCreateDay ? 0 : undefined}
                onKeyDown={(event) => {
                  createInDaySpaceWithKey(event, key, onCreateDay);
                }}
                onClick={(event) => {
                  createInDaySpace(event, key, onCreateDay);
                }}
              >
                {messages.calEmpty}
              </p>
            ) : (
              <section
                className="agenda-day"
                data-agenda-day={key}
                tabIndex={onCreateDay ? 0 : undefined}
                onKeyDown={(event) => {
                  createInDaySpaceWithKey(event, key, onCreateDay);
                }}
                onClick={(event) => {
                  createInDaySpace(event, key, onCreateDay);
                }}
              >
                <header
                  className={key === todayKey ? 'agenda-day-head is-today' : 'agenda-day-head'}
                >
                  <strong className="agenda-day-number">{day.getDate()}</strong>
                  <span>{heading}</span>
                </header>
                <ul>
                  {[...bucket]
                    .sort((left, right) => left.time.localeCompare(right.time))
                    .map((item) => {
                      if (item.kind === 'event') {
                        const event = item.event;
                        return (
                          <li key={`event-${event.id}`} className="agenda-row">
                            <time
                              className={
                                event.is_all_day ? 'agenda-time is-all-day' : 'agenda-time'
                              }
                            >
                              {event.is_all_day
                                ? messages.calAllDay
                                : `${key > eventDayRange(event).start ? '00:00' : clockLabel(event.starts_at, locale)}${event.ends_at ? ` – ${key < eventDayRange(event).end ? '24:00' : clockLabel(event.ends_at, locale)}` : ''}`}
                            </time>
                            <CalendarDays
                              className="calendar-event-mark"
                              size={17}
                              style={{ color: event.color ?? 'var(--accent)' }}
                              aria-hidden="true"
                            />
                            <button
                              type="button"
                              className="agenda-card"
                              title={event.title}
                              onClick={() => {
                                onOpenEvent(event);
                              }}
                            >
                              <span>{event.title}</span>
                            </button>
                          </li>
                        );
                      }
                      const task = item.task;
                      const title = displayTitle(task.title) || messages.untitled;
                      return (
                        <li key={`task-${task.id}`} className="agenda-row">
                          <time
                            className={task.is_all_day ? 'agenda-time is-all-day' : 'agenda-time'}
                          >
                            {task.is_all_day
                              ? messages.calAllDay
                              : clockLabel(task.due_date ?? '', locale)}
                          </time>
                          <PriorityCheck
                            priority={task.priority}
                            label={fill(messages.completeLabel, title)}
                            disabled={pending.has(task.id)}
                            onChange={() => {
                              setPending((ids) => new Set([...ids, task.id]));
                              setError(null);
                              void api
                                .completeTask(task.id, completeBody(), crypto.randomUUID())
                                .then(() => refreshTaskSurfaces(cache))
                                .catch(() => {
                                  setError(messages.saveFailed);
                                })
                                .finally(() => {
                                  setPending(
                                    (ids) => new Set([...ids].filter((id) => id !== task.id)),
                                  );
                                });
                            }}
                          />
                          <span
                            className="cal-dot"
                            style={{ background: colors.get(task.project_id) ?? 'var(--accent)' }}
                            aria-hidden="true"
                          />
                          <Link
                            className="agenda-card"
                            title={title}
                            to={taskQueryHref(location.pathname, location.search, task.id)}
                          >
                            <span>{title}</span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function DaySheet({
  dayKey,
  onClose,
  tasks,
  events,
  messages,
  colors,
  onOpenEvent,
}: {
  readonly dayKey: string;
  readonly onClose: () => void;
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly messages: Messages;
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale();
  const day = dayFromParam(dayKey);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => {
      node?.close();
    };
  }, []);
  if (day === null) {
    return null;
  }
  return (
    <dialog
      ref={dialog}
      className="calendar-day-sheet"
      aria-label={dayKey}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Button className="calendar-day-sheet-close" onClick={onClose} aria-label={messages.close}>
        <X aria-hidden="true" />
      </Button>
      <Agenda
        days={[day]}
        tasks={tasksOnCell(tasks, day)}
        events={eventsOnDay(events, day)}
        locale={locale}
        messages={messages}
        colors={colors}
        onOpenEvent={(event) => {
          onClose();
          onOpenEvent(event);
        }}
      />
    </dialog>
  );
}

function chipLabel(task: Task, untitled: string, locale: string): string {
  const title = calendarTaskLabel(task.title, task.due_date, task.time_zone, untitled);
  if (task.due_date === null || task.is_all_day) {
    return title;
  }
  const zone = task.time_zone.length > 0 ? task.time_zone : 'UTC';
  return `${formatDueTime(task.due_date, zone, locale)} ${title}`;
}

function eventsOnDay(events: readonly ExternalEventView[], day: Date): ExternalEventView[] {
  const key = localKey(day);
  return events.filter((event) => {
    const { start, end } = eventDayRange(event);
    return key >= start && key <= end;
  });
}

function mixChips(
  tasks: readonly Task[],
  events: readonly ExternalEventView[],
): (
  | { kind: 'task'; task: Task; sort: string }
  | { kind: 'event'; event: ExternalEventView; sort: string }
)[] {
  const chips = [
    ...tasks.map((task) => ({
      kind: 'task' as const,
      task,
      sort: `${task.is_all_day ? '0' : '1'}-${task.due_date ?? ''}`,
    })),
    ...events.map((event) => ({
      kind: 'event' as const,
      event,
      sort: `${event.is_all_day ? '0' : '1'}-${event.starts_at}`,
    })),
  ];
  return chips.sort((left, right) => left.sort.localeCompare(right.sort));
}

function clockLabel(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function subscriptionItems(
  value: unknown,
): { id: string; summary: string | null; color: string | null; visible: boolean }[] {
  if (typeof value !== 'object' || value === null || !('items' in value)) {
    return [];
  }
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const row = item as {
      id?: unknown;
      summary?: unknown;
      color?: unknown;
      visible?: unknown;
      provider?: unknown;
    };
    if (typeof row.id !== 'string') {
      return [];
    }
    return [
      {
        id: row.id,
        summary: typeof row.summary === 'string' ? row.summary : null,
        color: typeof row.color === 'string' ? row.color : null,
        visible: row.visible !== false,
      },
    ];
  });
}

function calendarViewIcon(view: string) {
  return (
    {
      agenda: List,
      year: Grid3X3,
      month: LayoutGrid,
      week: Columns3,
      'two-weeks': CalendarRange,
      'multi-day': Columns2,
      day: Square,
      quarter: Grid2X2,
    }[view] ?? CalendarDays
  );
}

function labelView(messages: Messages, view: string): string {
  switch (view) {
    case 'day':
      return messages.calDay;
    case 'week':
      return messages.calWeek;
    case 'multi-day':
      return messages.calMultiDay;
    case 'two-weeks':
      return messages.calTwoWeeks;
    case 'quarter':
      return messages.calQuarter;
    case 'year':
      return messages.calYear;
    case 'agenda':
      return messages.calAgenda;
    default:
      return messages.calMonth;
  }
}

/** CAL-9: aria-label matches the unit the arrows actually move. */
function calendarShiftLabel(messages: Messages, view: string, delta: number): string {
  const next = delta > 0;
  switch (view) {
    case 'day':
      return next ? messages.calNextDay : messages.calPrevDay;
    case 'week':
      return next ? messages.calNextWeek : messages.calPrevWeek;
    case 'multi-day':
    case 'two-weeks':
    case 'agenda':
      return next ? messages.calNextPeriod : messages.calPrevPeriod;
    case 'year':
      return next ? messages.calNextYear : messages.calPrevYear;
    case 'month':
      return next ? messages.calNext : messages.calPrev;
    default:
      return next ? messages.calNextPeriod : messages.calPrevPeriod;
  }
}

export function DashboardPage() {
  const messages = useMessages();
  const widgets = [
    messages.navToday,
    messages.overdueTitle,
    messages.habitsTitle,
    messages.calendarTitle,
    messages.navFocus,
    messages.settingsIntegrations,
  ];
  return (
    <section className="screen-page is-wide">
      <h1>{messages.dashboardTitle}</h1>
      <p>{messages.dashboardEmpty}</p>
      <div className="widget-grid">
        {widgets.map((title) => (
          <article key={title} className="widget">
            <h3>{title}</h3>
            <p>{messages.widgetEmpty}</p>
          </article>
        ))}
      </div>
      <p className="ui-muted">{messages.stickyHint}</p>
    </section>
  );
}

export function ReportsPage() {
  const messages = useMessages();
  const { week } = useParams();
  return (
    <section className="screen-page">
      <h1>{week === undefined ? messages.reportsTitle : `${messages.reportTitle} ${week}`}</h1>
      <EmptyState title={messages.reportsTitle} body={messages.reportEmpty} />
    </section>
  );
}

export function ReviewPage() {
  const messages = useMessages();
  const steps = [messages.overdueTitle, messages.noDate, messages.listsTitle, messages.habitsTitle];
  return (
    <section className="screen-page">
      <h1>{messages.reviewTitle}</h1>
      <p>{messages.reviewEmpty}</p>
      <ol>
        {steps.map((step, index) => (
          <li key={step}>
            {index + 1}. {step}. {messages.reviewStep}
          </li>
        ))}
      </ol>
    </section>
  );
}

function searchRow(item: unknown): RowModel | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const row = item as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.title !== 'string') {
    return null;
  }
  const priority =
    row.priority === 'low' || row.priority === 'medium' || row.priority === 'high'
      ? row.priority
      : 'none';
  return {
    id: row.id,
    title: row.title,
    priority,
    dueDate: typeof row.due_date === 'string' ? row.due_date : null,
    startDate: typeof row.start_date === 'string' ? row.start_date : null,
    durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
    isAllDay: row.is_all_day === true,
    timeZone: typeof row.time_zone === 'string' ? row.time_zone : 'UTC',
    projectId: typeof row.project_id === 'string' ? row.project_id : '',
    projectName: typeof row.project_name === 'string' ? row.project_name : '',
    columnId: null,
    tags: [],
    checklist: { completed: 0, total: 0 },
    kind: row.kind === 'note' ? 'note' : 'task',
    status: typeof row.status === 'string' ? row.status : 'active',
    repeat: typeof row.repeat_rule === 'string' && row.repeat_rule.length > 0,
    source: 'manual',
    content: '',
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
  };
}

export function SearchPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const search = useQuery({
    queryKey: ['search-page', q],
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
  });
  return (
    <section className="screen-page">
      <h1>{messages.searchTitle}</h1>
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const raw = data.get('q');
          const next = new URLSearchParams(params);
          next.set('q', typeof raw === 'string' ? raw : '');
          setParams(next, { replace: true });
        }}
      >
        <input
          className="search-input"
          name="q"
          defaultValue={q}
          placeholder={messages.searchPlaceholder}
          aria-label={messages.searchTitle}
        />
      </form>
      {search.data?.groups.length === 0 ? (
        <p>
          {messages.searchEmpty} {messages.searchRetryHint}
        </p>
      ) : null}
      {(search.data?.groups ?? []).map((group) => (
        <section key={group.type}>
          <h2>
            {group.type === 'task'
              ? group.items.length === 1
                ? messages.searchTaskSingular
                : messages.searchTaskCount.replace('{count}', String(group.items.length))
              : group.type === 'note'
                ? group.items.length === 1
                  ? messages.searchNoteSingular
                  : messages.searchNoteCount.replace('{count}', String(group.items.length))
                : groupLabel(messages, group.type)}
          </h2>
          {group.type === 'task' || group.type === 'note' ? (
            <TaskList
              messages={messages}
              rows={group.items.flatMap((item) => {
                const row = searchRow(item);
                return row === null ? [] : [row];
              })}
              locale={locale}
              view="list"
              hideCompleted={false}
              highlightQuery={q}
              onComplete={(row) => {
                const call =
                  row.status === 'completed'
                    ? api.uncompleteTask(row.id, crypto.randomUUID())
                    : api.completeTask(row.id, completeBody(), crypto.randomUUID());
                runAction(call.then(() => refreshTaskSurfaces(queryClient)));
              }}
            />
          ) : (
            <ul className="task-list">
              {group.items.map((item, index) => {
                const title =
                  typeof item.title === 'string'
                    ? item.title
                    : typeof item.name === 'string'
                      ? item.name
                      : '';
                const id = typeof item.id === 'string' ? item.id : String(index);
                const href = group.type === 'tag' ? `/tag/${id}` : `/list/${id}`;
                return (
                  <li key={id}>
                    <Link className="task-row" to={href}>
                      <span className="task-title">{highlight(title, q)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}

export function NoteRoute() {
  const { id, taskId } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (id !== undefined && taskId !== undefined) {
      runAction(Promise.resolve(navigate(`/list/${id}?task=${taskId}`, { replace: true })));
    }
  }, [id, navigate, taskId]);
  return <SkeletonRows />;
}

export function TaskRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.taskDetail(id ?? ''),
    enabled: id !== undefined,
  });
  useEffect(() => {
    if (detail.data !== undefined) {
      runAction(
        Promise.resolve(
          navigate(`/list/${detail.data.project_id}?task=${detail.data.id}`, { replace: true }),
        ),
      );
    }
  }, [detail.data, navigate]);
  if (detail.isError) {
    return <p>{id}</p>;
  }
  return <SkeletonRows />;
}

export function AuthNote({ title, body }: { readonly title: string; readonly body: string }) {
  const messages = useMessages();
  return (
    <section className="screen-page">
      <h1>{title}</h1>
      <EmptyState
        title={title}
        body={body}
        action={<Link to="/today">{messages.backToday}</Link>}
      />
    </section>
  );
}

function groupLabel(messages: Messages, type: string): string {
  if (type === 'task') {
    return messages.entityTask;
  }
  if (type === 'list') {
    return messages.listsTitle;
  }
  if (type === 'tag') {
    return messages.tagsTitle;
  }
  return type;
}

function highlight(title: string, query: string): ReactNode {
  const needle = query.trim();
  const index = needle.length === 0 ? -1 : title.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return title;
  }
  return (
    <>
      {title.slice(0, index)}
      <mark>{title.slice(index, index + needle.length)}</mark>
      {title.slice(index + needle.length)}
    </>
  );
}

const SETTINGS_GROUPS = [
  [
    'groupGeneral',
    ['/settings/account', '/settings/appearance', '/settings/workday', '/settings/features'],
  ],
  [
    'groupWork',
    ['/settings/capture', '/settings/focus', '/settings/notifications', '/settings/smart-lists', '/settings/calendar'],
  ],
  [
    'groupAdvanced',
    [
      '/settings/tokens',
      '/settings/integrations',
      '/settings/automations',
      '/settings/webhooks',
      '/settings/plugins',
      '/settings/sharing',
      '/settings/data',
      '/settings/shortcuts',
      '/settings/about',
    ],
  ],
] as const;

function settingsLabel(messages: Messages, path: string): string {
  const labels: Record<string, string> = {
    '/settings/about': messages.aboutTitle,
    '/settings/account': messages.settingsAccount,
    '/settings/workday': messages.settingsWorkday,
    '/settings/features': messages.settingsFeatures,
    '/settings/appearance': messages.appearanceTitle,
    '/settings/capture': messages.settingsCapture,
    '/settings/focus': messages.focusSettingsTitle,
    '/settings/notifications': messages.settingsNotifications,
    '/settings/smart-lists': messages.settingsSmart,
    '/settings/calendar': messages.settingsCalendar,
    '/settings/tokens': messages.settingsTokens,
    '/settings/integrations': messages.settingsIntegrations,
    '/settings/automations': messages.settingsAutomations,
    '/settings/webhooks': messages.settingsWebhooks,
    '/settings/data': messages.settingsData,
    '/settings/plugins': messages.settingsPlugins,
    '/settings/sharing': messages.settingsSharing,
    '/settings/shortcuts': messages.settingsShortcuts,
  };
  return labels[path] ?? path;
}

export function SettingsHome() {
  const messages = useMessages();
  return (
    <section>
      <h1>{messages.settingsTitle}</h1>
      <p>{messages.settingsHome}</p>
      <nav className="settings-nav">
        {SETTINGS_GROUPS.flatMap(([, paths]) => paths).map((path) => (
          <NavLink key={path} to={path}>
            {settingsLabel(messages, path)}
          </NavLink>
        ))}
      </nav>
    </section>
  );
}

export function SettingsLayout() {
  const messages = useMessages();
  const location = useLocation();
  const section = location.pathname === '/settings' ? 'index' : 'child';
  return (
    <div className="settings-layout" data-section={section}>
      <nav className="settings-nav" aria-label={messages.settingsTitle}>
        {SETTINGS_GROUPS.map(([group, paths]) => (
          <div key={group}>
            <h2>{messages[group]}</h2>
            {paths.map((path) => (
              <NavLink key={path} to={path}>
                {settingsLabel(messages, path)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="settings-main">
        {section === 'child' ? (
          <Link className="settings-back" to="/settings">
            {messages.settingsBack}
          </Link>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}

export function IntegrationSettings() {
  const messages = useMessages();
  return <GapPage title={messages.settingsIntegrations} body={messages.integrationsEmpty} />;
}

export function AutomationSettings() {
  const messages = useMessages();
  return <GapPage title={messages.settingsAutomations} body={messages.automationsEmpty} />;
}

export function WebhookSettings() {
  const messages = useMessages();
  return <GapPage title={messages.settingsWebhooks} body={messages.webhooksEmpty} />;
}

export function DataSettings() {
  const messages = useMessages();
  return (
    <section>
      <h1>{messages.settingsData}</h1>
      <p>{messages.dataHint}</p>
      <EmptyState title={messages.settingsData} body={messages.backupEmpty} />
      <p>{messages.exportEmpty}</p>
    </section>
  );
}

export function PluginSettings() {
  const messages = useMessages();
  return <GapPage title={messages.settingsPlugins} body={messages.pluginEmpty} />;
}

export function SharingSettings() {
  const messages = useMessages();
  return <GapPage title={messages.settingsSharing} body={messages.shareEmpty} />;
}

export function LoginPage() {
  const messages = useMessages();
  return <AuthNote title={messages.loginTitle} body={messages.loginDev} />;
}

export function RegisterPage() {
  const messages = useMessages();
  return <AuthNote title={messages.registerTitle} body={messages.registerDev} />;
}

export function ForgotPage() {
  const messages = useMessages();
  return <AuthNote title={messages.forgotTitle} body={messages.forgotDev} />;
}

export function AccountPage() {
  const messages = useMessages();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const profile = me.data;
  const [name, setName] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [children, setChildren] = useState<'ask' | 'complete' | 'leave' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [againPassword, setAgainPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const displayName = name ?? profile?.display_name ?? '';
  const timeZone = zone ?? profile?.time_zone ?? '';
  const childPolicy = children ?? profile?.task_complete_children ?? 'ask';
  const [zoneQuery, setZoneQuery] = useState('');
  const zones = timeZones(timeZone);
  const matchingZones = [timeZone, ...zones.filter((item) => item !== timeZone)].filter(
    (item) =>
      item === timeZone ||
      `${item} ${timeZoneLabel(item)}`.toLowerCase().includes(zoneQuery.toLowerCase()),
  );
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsAccount}</h1>
          <p className="lede">{messages.accountHint}</p>
        </div>
      </header>
      {profile === undefined && me.isPending ? <SkeletonRows /> : null}
      {me.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
      {profile !== undefined ? (
        <>
          <section className="token-panel">
            <form
              className="token-form"
              onSubmit={(event) => {
                event.preventDefault();
                setStatus(null);
                void api
                  .updateMe({
                    display_name: displayName,
                    time_zone: timeZone,
                    task_complete_children: childPolicy,
                  })
                  .then(() => {
                    setStatus(messages.saved);
                  })
                  .catch(() => {
                    setStatus(messages.saveFailed);
                  });
              }}
            >
              <label className="token-label" htmlFor="account-name">
                {messages.displayName}
              </label>
              <input
                id="account-name"
                className="token-name"
                value={displayName}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <p className="token-label">{messages.email}</p>
              <p className="token-meta">{profile.email}</p>
              <label className="token-label" htmlFor="account-zone">
                {messages.timeZone}
              </label>
              <input
                type="search"
                className="token-name"
                value={zoneQuery}
                aria-label={messages.timeZoneSearch}
                placeholder={messages.timeZoneSearch}
                onChange={(event) => {
                  setZoneQuery(event.target.value);
                }}
              />
              {zones.length > 0 ? (
                <select
                  id="account-zone"
                  className="token-name"
                  value={timeZone}
                  onChange={(event) => {
                    setZone(event.target.value);
                  }}
                >
                  {matchingZones.map((item) => (
                    <option key={item} value={item}>
                      {timeZoneLabel(item)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="account-zone"
                  className="token-name"
                  value={timeZone}
                  onChange={(event) => {
                    setZone(event.target.value);
                  }}
                />
              )}
              <p className="token-meta">{messages.timeZoneHint}</p>
              <label className="token-label" htmlFor="account-children">
                {messages.childrenPolicy}
              </label>
              <select
                id="account-children"
                className="token-name"
                value={childPolicy}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === 'ask' || next === 'complete' || next === 'leave') {
                    setChildren(next);
                  }
                }}
              >
                <option value="ask">{messages.childrenAsk}</option>
                <option value="complete">{messages.completeChildren}</option>
                <option value="leave">{messages.leaveChildren}</option>
              </select>
              <Button type="submit" variant="primary" size="sm">
                {messages.saveChanges}
              </Button>
              {status !== null ? <p role="status">{status}</p> : null}
            </form>
          </section>
          <section className="token-panel">
            <div className="token-panel-head">
              <div>
                <h2>{messages.password}</h2>
                <p>{messages.passwordShort}</p>
              </div>
            </div>
            <form
              className="token-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (nextPassword.length < 10) {
                  setPasswordStatus(messages.passwordShort);
                  return;
                }
                if (nextPassword !== againPassword) {
                  setPasswordStatus(messages.passwordMismatch);
                  return;
                }
                setPasswordStatus(null);
                void api.changePassword(currentPassword, nextPassword).then(
                  () => {
                    setCurrentPassword('');
                    setNextPassword('');
                    setAgainPassword('');
                    setPasswordStatus(messages.passwordChanged);
                  },
                  (reason: unknown) => {
                    setPasswordStatus(failureMessage(reason, messages.settingsFailed));
                  },
                );
              }}
            >
              <label className="token-label" htmlFor="password-current">
                {messages.passwordCurrent}
              </label>
              <input
                id="password-current"
                className="token-name"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                }}
              />
              <label className="token-label" htmlFor="password-new">
                {messages.passwordNew}
              </label>
              <input
                id="password-new"
                className="token-name"
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(event) => {
                  setNextPassword(event.target.value);
                }}
              />
              <label className="token-label" htmlFor="password-again">
                {messages.passwordAgain}
              </label>
              <input
                id="password-again"
                className="token-name"
                type="password"
                autoComplete="new-password"
                value={againPassword}
                onChange={(event) => {
                  setAgainPassword(event.target.value);
                }}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={
                  currentPassword.length === 0 ||
                  nextPassword.length === 0 ||
                  againPassword.length === 0
                }
              >
                {messages.saveChanges}
              </Button>
              {passwordStatus !== null ? (
                <p role={passwordStatus === messages.passwordChanged ? 'status' : 'alert'}>
                  {passwordStatus}
                </p>
              ) : null}
            </form>
          </section>
          <section className="token-panel">
            <div className="token-panel-head">
              <div>
                <h2>{messages.enableTwoFactor}</h2>
                <p>{messages.twoFactorHint}</p>
              </div>
            </div>
            {setup === null ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setTotpError(null);
                  void api
                    .beginTotp()
                    .then((body) => {
                      const secret = textOf(body.secret);
                      const otpauth = textOf(body.otpauth);
                      if (secret.length === 0) {
                        setTotpError(messages.settingsFailed);
                        return;
                      }
                      setSetup({ secret, otpauth });
                    })
                    .catch(() => {
                      setTotpError(messages.settingsFailed);
                    });
                }}
              >
                {messages.enableTwoFactor}
              </Button>
            ) : (
              <div className="token-secret">
                <p>{messages.twoFactorReady}</p>
                {setup.otpauth.length > 0 ? (
                  <TotpQr value={setup.otpauth} label={messages.twoFactorQr} />
                ) : null}
                <code>{setup.secret}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAction(
                      api.cancelTotp().finally(() => {
                        setSetup(null);
                        setTotpCode('');
                        setTotpError(null);
                      }),
                    );
                  }}
                >
                  {messages.cancel}
                </Button>
              </div>
            )}
            {setup !== null && codes === null ? (
              <form
                className="token-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (totpCode.trim().length !== 6) {
                    return;
                  }
                  setTotpError(null);
                  void api
                    .confirmTotp(totpCode.trim())
                    .then((body) => {
                      setCodes(stringsOf(body.recovery_codes));
                      setTotpCode('');
                    })
                    .catch((reason: unknown) => {
                      setTotpError(
                        reason instanceof ApiError && reason.code === 'invalid_totp'
                          ? messages.twoFactorInvalid
                          : messages.settingsFailed,
                      );
                    });
                }}
              >
                <label className="token-label" htmlFor="totp-code">
                  {messages.twoFactorCode}
                </label>
                <input
                  id="totp-code"
                  className="token-name"
                  value={totpCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onChange={(event) => {
                    setTotpCode(event.target.value);
                  }}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={totpCode.trim().length !== 6}
                >
                  {messages.saveChanges}
                </Button>
              </form>
            ) : null}
            {codes !== null ? (
              <div className="token-secret">
                <p>{messages.twoFactorCodes}</p>
                <pre className="token-snippet">{codes.join('\n')}</pre>
              </div>
            ) : null}
            {totpError !== null ? <p role="alert">{totpError}</p> : null}
          </section>
          <section className="token-panel">
            <div className="token-panel-head">
              <div>
                <h2>{messages.accountDanger}</h2>
                <p>{messages.deleteAccountUnavailable}</p>
              </div>
            </div>
            <form
              className="token-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (confirmEmail !== profile.email) {
                  return;
                }
                runAction(api.deleteAccount(profile.email));
              }}
            >
              <label className="token-label" htmlFor="account-delete">
                {messages.email}
              </label>
              <input
                id="account-delete"
                className="token-name"
                type="email"
                value={confirmEmail}
                autoComplete="off"
                onChange={(event) => {
                  setConfirmEmail(event.target.value);
                }}
              />
              <Button
                type="submit"
                size="sm"
                variant="danger"
                disabled={confirmEmail !== profile.email}
              >
                {messages.deleteAccount}
              </Button>
            </form>
          </section>
        </>
      ) : null}
    </section>
  );
}

export function CaptureSettings() {
  const messages = useMessages();
  const parser = usePreferences((state) => state.parser);
  const setParser = usePreferences((state) => state.setParser);
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsCapture}</h1>
          <p className="lede">{messages.captureLede}</p>
        </div>
      </header>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2 id="parser-title">{messages.parserLanguage}</h2>
            <p>{messages.parserHint}</p>
          </div>
        </div>
        <select
          id="parser-language"
          className="token-name is-short"
          aria-labelledby="parser-title"
          value={parser}
          onChange={(event) => {
            const value = event.target.value;
            setParser(value === 'en' || value === 'es' ? value : 'auto');
          }}
        >
          <option value="auto">{messages.languageAuto}</option>
          <option value="es">{messages.languageEs}</option>
          <option value="en">{messages.languageEn}</option>
        </select>
      </section>
      <InboundEmailCard />
    </section>
  );
}


function timeZones(current: string): readonly string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  if (current.length > 0 && !known.includes(current)) {
    return [current, ...known];
  }
  return known;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function GapPage({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <EmptyState title={title} body={body} />
    </section>
  );
}

export function AppearanceExtras() {
  const messages = useMessages();
  const density = usePreferences((state) => state.density);
  const setDensity = usePreferences((state) => state.setDensity);
  const accent = usePreferences((state) => state.accent);
  const setAccent = usePreferences((state) => state.setAccent);
  const week = usePreferences((state) => state.weekStart);
  const setWeek = usePreferences((state) => state.setWeekStart);
  return (
    <>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.density}</h2>
            <p>{messages.densityHint}</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label={messages.density}>
          <button
            type="button"
            className={density === 'comfortable' ? 'is-active' : undefined}
            aria-pressed={density === 'comfortable'}
            onClick={() => {
              setDensity('comfortable');
            }}
          >
            {messages.densityComfortable}
          </button>
          <button
            type="button"
            className={density === 'compact' ? 'is-active' : undefined}
            aria-pressed={density === 'compact'}
            onClick={() => {
              setDensity('compact');
            }}
          >
            {messages.densityCompact}
          </button>
        </div>
      </section>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.accent}</h2>
            <p>{messages.accentHint}</p>
          </div>
        </div>
        <div className="accent-swatches" role="radiogroup" aria-label={messages.accent}>
          {ACCENTS.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              className={accent === item ? 'is-active' : undefined}
              style={{ background: ACCENT_COLOR[item] }}
              aria-label={accentName(messages, item)}
              aria-checked={accent === item}
              onClick={() => {
                setAccent(item);
              }}
            />
          ))}
        </div>
      </section>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.weekStart}</h2>
            <p>{messages.weekStartHint}</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label={messages.weekStart}>
          <button
            type="button"
            className={week === 'monday' ? 'is-active' : undefined}
            aria-pressed={week === 'monday'}
            onClick={() => {
              setWeek('monday');
            }}
          >
            {messages.monday}
          </button>
          <button
            type="button"
            className={week === 'sunday' ? 'is-active' : undefined}
            aria-pressed={week === 'sunday'}
            onClick={() => {
              setWeek('sunday');
            }}
          >
            {messages.sunday}
          </button>
        </div>
      </section>
      <LanguageField />
    </>
  );
}

function accentName(messages: Messages, item: AccentId): string {
  switch (item) {
    case 'indigo':
      return messages.accentIndigo;
    case 'violet':
      return messages.accentViolet;
    case 'teal':
      return messages.accentTeal;
    case 'amber':
      return messages.accentAmber;
    case 'rose':
      return messages.accentRose;
    case 'slate':
      return messages.accentSlate;
  }
}

function LanguageField() {
  const messages = useMessages();
  const choice = useLocale((state) => state.choice);
  const setChoice = useLocale((state) => state.setChoice);
  return (
    <section className="token-panel">
      <div className="token-panel-head">
        <h2>{messages.language}</h2>
      </div>
      <div className="segmented" role="radiogroup" aria-label={messages.language}>
        {(['auto', 'es', 'en'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={choice === item ? 'is-active' : undefined}
            aria-pressed={choice === item}
            onClick={() => {
              setChoice(item);
            }}
          >
            {item === 'auto'
              ? messages.languageAuto
              : item === 'es'
                ? messages.languageEs
                : messages.languageEn}
          </button>
        ))}
      </div>
    </section>
  );
}

export function BlockedSettings({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}) {
  return <GapPage title={title} body={body} />;
}

export { smartApiKey };

function timeZoneLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('es-ES', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const city = zone.split('/').at(-1)?.replaceAll('_', ' ') ?? zone;
    return `${city} (${offset.replace('GMT', 'UTC')})`;
  } catch {
    return zone;
  }
}
