import { dateTimeFormat } from '../../lib/dates/formatters';
import { DayDetails } from '../calendar/DayDetails';
import { WorkHoursLine } from '../settings/WorkHoursLine';
import { composerContextFor } from '../capture/context';
import { useAgendaQuery } from '../calendar/use-agenda-query';
import { agendaPageRange } from '../calendar/agenda-range';
import { useCalendarTaskChange } from './use-calendar-task-change';
import { SidebarFoldButton } from '../../shell/SidebarFoldButton';
import { DayWeekStrip } from '../calendar/DayWeekStrip';
import { CalendarSources } from '../calendar/CalendarSources';
import { sourceSet } from '../calendar/source-selection';
import { calendarTaskQuery, uniqueById } from '../calendar/calendar-task-query';
import { useCalendarSources } from '../calendar/use-calendar-sources';
import { useCalendarToday } from '../../components/period/useCalendarToday';
import { QuickAddPopover } from '../capture/components/QuickAddPopover';
import { allDaySlot, type CalendarSlot, type SlotAnchor } from '../capture/calendar-slot';
import { runAction } from '../../components/run-action';
import { CalendarMenu, CalendarPeriod } from '../calendar/CalendarControls';
import {
  CalendarDays,
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
} from 'lucide-react';
import { openTaskComposer } from '../capture/notice';
import '../calendar/calendar.css';
import { type Task } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { YearBoard } from './year-board';
import { rememberCalendarView } from '../../shell/BottomBar';
import { api } from '../../api';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { fill, useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { usePreferences } from '../../theme/preferences';
import {
  ExternalEventPopover,
  isExternalEvent,
  type ExternalEventView,
} from '../calendar/ExternalEvent';
import { collectFilterTasks } from '../tasks/collect';
import { collectTasks } from '../today/board';
import { calendarDay } from '../today/groups';
import { MonthView } from '../calendar/views/MonthView';
import { WeekView } from '../calendar/views/WeekView';
import { AgendaView } from '../calendar/views/AgendaView';
import { DayView } from '../calendar/views/DayView';
import { eventsOnDay } from '../calendar/data/chips';
import {
  isoWeek,
  dayFromParam,
  localDateParam,
  localToday,
  monthCells,
  monthQueryRange,
  quarterMonths,
  shiftView,
  tasksOnCell,
  viewDays,
  yearQueryRange,
} from './month';

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
  const filterResults = useQuery({
    queryKey: ['calendar-filter-tasks', selectedFilters],
    queryFn: () => Promise.all(selectedFilters.map((id) => collectFilterTasks(id, {}))),
    enabled: selectedFilters.length > 0,
  });
  const selectedTaskIds = selectedFilters.length
    ? new Set(
        (filterResults.data ?? []).flatMap((result) =>
          result.groups.flatMap((group) => group.tasks.map((task) => task.id)),
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
    queryKey: ['calendar-tasks', 'auto', 'any', range.from, range.to],
    queryFn: () =>
      collectTasks((query) => api.listTasks(query), calendarTaskQuery(range.from, range.to)),
  });
  const tasks =
    current === 'agenda'
      ? { ...agendaQuery, data: agendaQuery.data?.pages.flatMap((page) => page.tasks) }
      : rangedTasks;
  const rangedEvents = useQuery<Awaited<ReturnType<typeof api.calendarEvents>>>({
    enabled: current !== 'agenda',
    queryKey: ['calendar-events', 'auto', range.dueAfter, range.dueBefore],
    queryFn: () => api.calendarEvents(range.dueAfter, range.dueBefore, 'auto', 'external'),
  });
  const externalQuery =
    current === 'agenda'
      ? {
          ...agendaQuery,
          data: agendaQuery.data
            ? {
                external: agendaQuery.data.pages.flatMap((page) =>
                  Array.isArray(page.events.external) ? (page.events.external as unknown[]) : [],
                ),
              }
            : undefined,
        }
      : rangedEvents;
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
  const pickedAnchor = useRef<HTMLElement | null>(null);
  const calSources = sourceSet(sourceParams.get('cals'));
  const listSources = sourceSet(sourceParams.get('lists'));
  const tagSources = sourceSet(sourceParams.get('tags'));
  const sourceAllows = (selected: Set<string> | null, id: string): boolean =>
    selected === null || selected.has(id);
  const external = uniqueById(
    (Array.isArray(externalQuery.data?.external) ? externalQuery.data.external : []).filter(
      isExternalEvent,
    ),
  ).filter((event) => sourceAllows(calSources, event.subscription_id ?? ''));
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
  const dated = uniqueById(tasks.data ?? [])
    .filter((task) => {
      return (
        (task.start_date ?? task.due_date) !== null &&
        (contextProject === undefined || task.project_id === contextProject) &&
        (!tagId || task.tag_ids.includes(tagId)) &&
        (!filterTaskIds || filterTaskIds.has(task.id)) &&
        (!selectedTaskIds || selectedTaskIds.has(task.id)) &&
        sourceAllows(listSources, task.project_id) &&
        (tagSources === null || task.tag_ids.some((id) => tagSources.has(id))) &&
        task.kind === 'task'
      );
    })
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
      ? dateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(cursor)
      : calendarTitle(locale, current ?? 'month', cursor, cells);
  const move = (delta: number): void => {
    const next = shiftView(cursor, current ?? 'month', delta, weekStart);
    setCursor(next);
    const query = new URLSearchParams(params);
    query.set('date', localDateParam(next));
    setParams(query);
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
                  ? dateTimeFormat(
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
      <WorkHoursLine />
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
      {tasks.isPending || externalQuery.isPending ? <SkeletonRows /> : null}
      {tasks.isError || externalQuery.isError ? (
        <ErrorState
          title={fill(messages.loadFailed, messages.calendarTitle)}
          retryLabel={messages.retry}
          onRetry={() => {
            if (current === 'agenda') runAction(agendaQuery.refetch());
            else {
              runAction(rangedTasks.refetch());
              runAction(rangedEvents.refetch());
            }
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
      {!tasks.isPending && !externalQuery.isPending && !tasks.isError && !externalQuery.isError ? (
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
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="m18 15-6-6-6 6" />
                </svg>
                <span>
                  {dateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                    new Date(agendaStart.getFullYear(), agendaStart.getMonth() - 1, 1),
                  )}
                </span>
              </Button>
              <AgendaView
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
                  {dateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(agendaEnd)}
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {current === 'week' && mobile ? (
            <WeekView
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
            <DayView
              onTaskChange={taskChange.change}
              onOpenDay={(key, element) => {
                pickedAnchor.current = element ?? null;
                setPicked(key);
              }}
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
              <MonthView
                onTaskChange={taskChange.change}
                days={current === 'month' ? monthCells(startOfMonth(cursor), weekStart) : cells}
                columns={7}
                monthView={current === 'month'}
                tasks={dated}
                events={external}
                colors={colors}
                onOpenEvent={setOpenEvent}
                messages={messages}
                cursor={cursor}
                outsideMonth
                onNavigate={current === 'month' ? move : undefined}
                onPick={(key, element) => {
                  pickedAnchor.current = element ?? null;
                  setPicked(key);
                }}
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
        <DayDetails
          dayKey={picked}
          anchor={pickedAnchor}
          tasks={tasksOnCell(dated, dayFromParam(picked) ?? cursor)}
          events={eventsOnDay(external, dayFromParam(picked) ?? cursor)}
          projects={projects.data?.items ?? []}
          defaultProjectId={contextProject}
          timeZone={timeZone}
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
    const start = dateTimeFormat(locale, { month: 'long' }).format(first);
    const end = dateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(last);
    return `${start} – ${end}`;
  }
  if (view === 'day') {
    return dateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(cursor);
  }
  const first = cells[0] ?? cursor;
  const last = cells.at(-1) ?? cursor;
  if (view === 'week' || view === 'multi-day' || view === 'two-weeks' || view === 'agenda') {
    const sameMonth = first.getMonth() === last.getMonth();
    const start = dateTimeFormat(
      locale,
      sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' },
    ).format(first);
    const end = dateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(last);
    return `${start} – ${end}`;
  }
  return dateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor);
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
