import { runAction } from '../../components/run-action';
import { CalendarMenu, CalendarPeriod } from '../calendar/CalendarControls';
import { CalendarDays, Plus } from 'lucide-react';
import { CalendarTaskMark } from '../calendar/CalendarTaskMark';
import { openTaskComposer } from '../capture/notice';
import '../calendar/calendar.css';
import { PriorityCheck } from '../../components/PriorityCheck';
import { displayTitle } from '../tasks/displayTitle';
import { ApiError, type Project, type Task } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
import { collectTags } from '../tasks/collect';
import { rowFromTask, smartApiKey, type RowModel } from '../tasks/model';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { newMutation, runOrQueue } from '../offline/client';
import { collectTasks } from '../today/board';
import { calendarDay, formatDueTime } from '../today/groups';
import { TaskList } from '../tasks/TaskList';
import { TaskComposer } from '../tasks/TaskComposer';
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
  spanDays,
  startOfWeek,
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
  'multi-week',
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
  locale,
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
        <input
          type="date"
          lang={locale.toLowerCase().startsWith('en') ? 'en-CA' : 'es-ES'}
          aria-label={messages.processDate}
          onChange={(event) => {
            if (event.target.value.length > 0) {
              onDate('date', `${event.target.value}T12:00:00.000Z`);
            }
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
  const messages = useMessages();
  const locale = useAppLocale();
  const navigate = useNavigate();
  const { view } = useParams();
  const [params, setParams] = useSearchParams();
  const knownView = CAL_VIEWS.includes(view as (typeof CAL_VIEWS)[number]);
  const current = knownView ? view : 'month';
  const weekStart = usePreferences((state) => state.weekStart);
  const [cursor, setCursor] = useState(
    () => dayFromParam(params.get('date') ?? '') ?? localToday(new Date()),
  );

  useEffect(() => {
    // CAL-0: unknown calendar routes redirect instead of silently rendering month.
    if (view !== undefined && !knownView) {
      runAction(Promise.resolve(navigate('/calendar/month', { replace: true })));
    }
  }, [view, knownView, navigate]);
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
  const weekCount = Math.max(2, Math.min(6, Number(params.get('weeks')) || 2));
  const allCells =
    current === 'multi-week'
      ? spanDays(startOfWeek(cursor, weekStart), weekCount * 7)
      : viewDays(current ?? 'month', cursor, weekStart);
  const filteredCells =
    workweek && (current === 'week' || current === 'multi-day')
      ? allCells.filter((day) => day.getDay() !== 0 && day.getDay() !== 6)
      : allCells;
  const cells = filteredCells;
  const range = current === 'year' ? yearQueryRange(cursor) : monthQueryRange(cells);
  const tasks = useQuery({
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
  const externalQuery = useQuery({
    queryKey: ['calendar-events', range.dueAfter, range.dueBefore],
    queryFn: () => api.calendarEvents(range.dueAfter, range.dueBefore),
  });
  const startTaskIds = Array.isArray(externalQuery.data?.tasks)
    ? externalQuery.data.tasks.flatMap((value: unknown) => {
        if (typeof value !== 'object' || value === null) return [];
        const row = value as { id?: unknown; start_date?: unknown; due_date?: unknown };
        return typeof row.id === 'string' &&
          typeof row.start_date === 'string' &&
          row.due_date === null
          ? [row.id]
          : [];
      })
    : [];
  const startTasks = useQuery({
    queryKey: ['calendar-start-tasks', ...startTaskIds],
    queryFn: () => Promise.all(startTaskIds.map((id) => api.getTask(id))),
    enabled: startTaskIds.length > 0,
  });
  const subscriptions = useQuery({
    queryKey: ['calendar-subscriptions'],
    queryFn: () => api.listCalendarSubscriptions(),
  });
  const [showTasks, setShowTasks] = useState(true);
  const [openEvent, setOpenEvent] = useState<ExternalEventView | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const external = (
    Array.isArray(externalQuery.data?.external) ? externalQuery.data.external : []
  ).filter(isExternalEvent);
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
  const dated = showTasks
    ? [
        ...(tasks.data ?? []),
        ...(startTasks.data ?? []).map((task) => ({ ...task, due_date: task.start_date })),
      ].filter(
        (task, index, all) =>
          task.due_date !== null &&
          task.kind === 'task' &&
          all.findIndex((other) => other.id === task.id) === index,
      )
    : [];
  const title = calendarTitle(locale, current ?? 'month', cursor, cells);
  const move = (delta: number): void => {
    const next =
      current === 'multi-week'
        ? new Date(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate() + delta * weekCount * 7,
          )
        : shiftView(cursor, current ?? 'month', delta, weekStart);
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
          title={title}
          date={cursor}
          onPick={(date) => {
            setCursor(date);
            const query = new URLSearchParams(params);
            query.set('date', localKey(date));
            setParams(query);
          }}
        />
        {current === 'multi-week' ? (
          <label className="calendar-range">
            {messages.calendarWeeks}
            <select
              aria-label={messages.calendarWeekCount}
              value={weekCount}
              onChange={(event) => {
                const query = new URLSearchParams(params);
                query.set('weeks', event.target.value);
                setParams(query);
              }}
            >
              {[2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {current === 'week' || current === 'multi-day' ? (
          <span className="calendar-week-number">S{isoWeek(cells[0] ?? cursor)}</span>
        ) : null}
        <nav className="calendar-segments" aria-label={messages.calendarTitle}>
          {['day', 'week', 'month', 'agenda'].map((item) => (
            <Link
              key={item}
              to={`/calendar/${item}?date=${localKey(cursor)}`}
              aria-current={current === item ? 'page' : undefined}
            >
              {labelView(messages, item)}
            </Link>
          ))}
          <CalendarMenu label={messages.calendarMoreViews}>
            {(close) => (
              <div className="calendar-view-links">
                {['year', 'quarter', 'multi-week', 'multi-day'].map((item) => (
                  <Link
                    key={item}
                    onClick={close}
                    aria-current={current === item ? 'page' : undefined}
                    to={`/calendar/${item}?date=${localKey(cursor)}`}
                  >
                    {labelView(messages, item)}
                  </Link>
                ))}
              </div>
            )}
          </CalendarMenu>
        </nav>
        <select
          className="calendar-mobile-view"
          aria-label={messages.calendarTitle}
          value={current}
          onChange={(event) => {
            runAction(
              Promise.resolve(navigate(`/calendar/${event.target.value}?date=${localKey(cursor)}`)),
            );
          }}
        >
          {CAL_VIEWS.map((item) => (
            <option key={item} value={item}>
              {labelView(messages, item)}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          aria-label={messages.captureTitle}
          onClick={() => {
            openTaskComposer();
          }}
        >
          <Plus size={17} aria-hidden="true" />
        </Button>
        <CalendarMenu className="calendar-options" label={messages.calendarOptions} trigger="⋯">
          {() => (
            <div className="calendar-options-content">
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
              <CalendarVisibility
                messages={messages}
                showTasks={showTasks}
                onTasks={setShowTasks}
                subscriptions={subscriptionItems(subscriptions.data)}
              />
              <Link to="/settings/calendar">{messages.settingsCalendar}</Link>
            </div>
          )}
        </CalendarMenu>
      </header>
      {current === 'agenda' ? (
        <p className="calendar-window">{messages.calendarAgendaWindow}</p>
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
            runAction(tasks.refetch());
            runAction(externalQuery.refetch());
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
            <Agenda
              days={cells}
              tasks={dated}
              events={external}
              locale={locale}
              messages={messages}
              colors={colors}
              onOpenEvent={setOpenEvent}
            />
          ) : null}
          {current === 'day' || current === 'week' || current === 'multi-day' ? (
            <HourGrid
              days={cells}
              tasks={dated}
              events={external}
              colors={colors}
              messages={messages}
              onOpenEvent={setOpenEvent}
            />
          ) : null}
          {current === 'multi-week' || current === 'month' ? (
            <>
              <DayGrid
                days={current === 'month' ? monthCells(startOfMonth(cursor), weekStart) : cells}
                columns={7}
                tasks={dated}
                events={external}
                colors={colors}
                onOpenEvent={setOpenEvent}
                messages={messages}
                cursor={cursor}
                outsideMonth
                onPick={setPicked}
              />
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
            </>
          ) : null}
        </>
      ) : null}
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
  if (view === 'week' || view === 'multi-day' || view === 'multi-week' || view === 'agenda') {
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
  days,
  columns,
  tasks,
  events = [],
  colors = new Map<string, string>(),
  onOpenEvent,
  messages,
  cursor,
  outsideMonth,
  onPick,
  dots = false,
}: {
  readonly days: readonly Date[];
  readonly columns: number;
  readonly tasks: readonly Task[];
  readonly events?: readonly ExternalEventView[];
  readonly colors?: ReadonlyMap<string, string>;
  readonly onOpenEvent?: (event: ExternalEventView) => void;
  readonly messages: Messages;
  readonly cursor: Date;
  readonly outsideMonth: boolean;
  readonly onPick?: (dayKey: string) => void;
  readonly dots?: boolean;
}) {
  const location = useLocation();
  const locale = useAppLocale();
  const grid = useRef<HTMLDivElement>(null);
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
        const reserve = total > room || hiddenBars.has(key) ? 26 : 0;
        let used = 0;
        let hidden = hiddenBars.get(key) ?? 0;
        children.forEach((child, index) => {
          used += heights[index] ?? 0;
          const visible = used <= room - reserve;
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
  const todayKey = localKey(new Date());
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
      className={dots ? 'cal-month is-dots' : 'cal-month'}
      style={{
        gridTemplateColumns: `${dots ? '' : '2rem '}repeat(${String(columns)}, minmax(0, 1fr))`,
      }}
    >
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
                    {day.getDate()}
                  </button>
                ) : (
                  <Link to={href}>{day.getDate()}</Link>
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
                          <div key={chip.task.id} className="calendar-cell-task">
                            <CalendarTaskMark task={chip.task} />
                            <Link
                              title={chipLabel(chip.task, messages.untitled, locale)}
                              style={chipStyle(colors.get(chip.task.project_id))}
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
                              {chipLabel(chip.task, messages.untitled, locale)}
                            </Link>
                          </div>
                        ) : (
                          <button
                            key={chip.event.id}
                            title={chip.event.title}
                            type="button"
                            className="cal-pill"
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
                            {chip.event.is_all_day
                              ? ''
                              : `${localKey(day) > eventDayRange(chip.event).start ? '00:00' : clockLabel(chip.event.starts_at, locale)} `}
                            {chip.event.title}
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
                type="button"
                className="cal-pill calendar-month-span"
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
                {bar.event.title}
              </button>
            );
          })
        : null}
    </div>
  );
}

function YearBoard({
  year,
  months = Array.from({ length: 12 }, (_, index) => index),
  events = [],
  tasks,
  weekStart,
  colors,
  onOpen,
}: {
  readonly year: number;
  readonly months?: readonly number[];
  readonly events?: readonly ExternalEventView[];
  readonly tasks: readonly Task[];
  readonly weekStart: 'monday' | 'sunday';
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpen: (month: number) => void;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const todayKey = localKey(new Date());
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const sample = monthCells(new Date(year, 0, 1), weekStart);
  const heads = sample.slice(0, 7).map((day) => weekday.format(day));
  return (
    <div className={months.length === 3 ? 'year-board is-quarter' : 'year-board'}>
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
                      to={`/calendar/day?date=${key}`}
                      aria-current={key === todayKey ? 'date' : undefined}
                      aria-label={`${when}, ${String(tasksOnCell(tasks, day).length + eventsOnDay(events, day).length)} ${tasksOnCell(tasks, day).length + eventsOnDay(events, day).length === 1 ? messages.calendarItem : messages.calendarItems}`}
                    >
                      <span className="year-num">{day.getDate()}</span>
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
  tasks,
  events,
  locale,
  messages,
  colors,
  onOpenEvent,
}: {
  readonly days?: readonly Date[];
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
  const todayKey = localKey(new Date());
  type Item =
    | { kind: 'task'; task: Task; time: string }
    | { kind: 'event'; event: ExternalEventView; time: string };
  const groups = new Map<string, Item[]>();
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
              <h2 className="agenda-month">{monthName.format(day)}</h2>
            ) : null}
            <section className="agenda-day">
              <header className={key === todayKey ? 'agenda-day-head is-today' : 'agenda-day-head'}>
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
                            className={event.is_all_day ? 'agenda-time is-all-day' : 'agenda-time'}
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
      <Button onClick={onClose}>{messages.close}</Button>
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
    if (typeof row.id !== 'string' || row.provider === 'ical') {
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

function CalendarVisibility({
  messages,
  showTasks,
  onTasks,
  subscriptions,
}: {
  readonly messages: Messages;
  readonly showTasks: boolean;
  readonly onTasks: (value: boolean) => void;
  readonly subscriptions: readonly {
    id: string;
    summary: string | null;
    color: string | null;
    visible: boolean;
  }[];
}) {
  const queryClient = useQueryClient();
  return (
    <fieldset className="calendar-sources">
      <legend>{messages.calendarSource}</legend>
      <label>
        <input
          type="checkbox"
          checked={showTasks}
          onChange={() => {
            onTasks(!showTasks);
          }}
        />
        {messages.calendarTasks}
      </label>
      {subscriptions.map((row) => (
        <label key={row.id}>
          <input
            type="checkbox"
            checked={row.visible}
            onChange={() => {
              if (!navigator.onLine) {
                return;
              }
              runAction(
                api.updateCalendarSubscription(row.id, { visible: !row.visible }).then(() => {
                  runAction(
                    queryClient.invalidateQueries({ queryKey: ['calendar-subscriptions'] }),
                  );
                  runAction(queryClient.invalidateQueries({ queryKey: ['calendar-events'] }));
                }),
              );
            }}
          />
          {row.summary ?? row.id}
        </label>
      ))}
    </fieldset>
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
    case 'multi-week':
      return messages.calMultiWeek;
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
    case 'multi-week':
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
    ['/settings/capture', '/settings/notifications', '/settings/smart-lists', '/settings/calendar'],
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
    ],
  ],
] as const;

function settingsLabel(messages: Messages, path: string): string {
  const labels: Record<string, string> = {
    '/settings/account': messages.settingsAccount,
    '/settings/workday': messages.settingsWorkday,
    '/settings/features': messages.settingsFeatures,
    '/settings/appearance': messages.appearanceTitle,
    '/settings/capture': messages.settingsCapture,
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

const REMINDER_VALUES = ['-PT0M', '-PT5M', '-PT15M', '-PT30M', '-PT1H', '-P1D'] as const;

export function NotificationSettings() {
  const messages = useMessages();
  const locale = useAppLocale();
  const timeLang = locale.toLowerCase().startsWith('en') ? 'en-GB' : 'es-ES';
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const saved = me.data?.daily_reminder_time ?? '';
  const savedDefault = reminderValue(me.data, 'default_reminder_trigger');
  const [showAllLists, setShowAllLists] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [defaultDraft, setDefaultDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [push, setPush] = useState<NotificationPermission | 'missing'>(pushPermission);
  const [listOverrides, setListOverrides] = useState<Readonly<Record<string, string>>>({});
  const value = draft ?? saved;
  const defaultReminder = defaultDraft ?? savedDefault;
  const reminderLabels: Record<(typeof REMINDER_VALUES)[number], string> = {
    '-PT0M': messages.reminderAtTime,
    '-PT5M': messages.reminder5,
    '-PT15M': messages.reminder15,
    '-PT30M': messages.reminder30,
    '-PT1H': messages.reminderHour,
    '-P1D': messages.reminderDay,
  };
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsNotifications}</h1>
          <p className="lede">{messages.notificationsLede}</p>
        </div>
      </header>
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (me.data === undefined || value === saved) {
              return;
            }
            setStatus(null);
            void api
              .updateMe({ daily_reminder_time: value.length === 0 ? null : value })
              .then(() => {
                setDraft(null);
                setStatus(messages.saved);
              })
              .catch(() => {
                setStatus(messages.saveFailed);
              });
          }}
        >
          <label className="token-label" htmlFor="daily-reminder">
            {messages.dailyReminder}
          </label>
          <input
            id="daily-reminder"
            className="token-name is-time"
            type="time"
            lang={timeLang}
            step={60}
            value={value}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus(null);
            }}
          />
          <p className="token-meta">{messages.quietLocal}</p>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={me.data === undefined || value === saved}
          >
            {messages.reminderSaveDaily}
          </Button>
          {status !== null ? <p role="status">{status}</p> : null}
        </form>
      </section>
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (me.data === undefined || defaultReminder === savedDefault) {
              return;
            }
            setStatus(null);
            void api
              .updateMe({
                default_reminder_trigger: defaultReminder.length === 0 ? null : defaultReminder,
              })
              .then(() => {
                setDefaultDraft(null);
                setStatus(messages.saved);
                runAction(queryClient.invalidateQueries({ queryKey: ['me'] }));
              })
              .catch(() => {
                setStatus(messages.saveFailed);
              });
          }}
        >
          <label className="token-label" htmlFor="default-reminder">
            {messages.defaultReminder}
          </label>
          <select
            id="default-reminder"
            className="token-name is-short"
            value={defaultReminder}
            onChange={(event) => {
              setDefaultDraft(event.target.value);
              setStatus(null);
            }}
          >
            <option value="">{messages.reminderNone}</option>
            {REMINDER_VALUES.map((item) => (
              <option key={item} value={item}>
                {reminderLabels[item]}
              </option>
            ))}
          </select>
          <p className="token-meta">{messages.defaultReminderHint}</p>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={me.data === undefined || defaultReminder === savedDefault}
          >
            {messages.reminderSaveDefault}
          </Button>
        </form>
      </section>
      <section className="token-panel is-list" aria-label={messages.listReminders}>
        <div className="token-panel-head">
          <div>
            <h2>{messages.listReminders}</h2>
            <p>{messages.listRemindersHint}</p>
          </div>
        </div>
        <Button
          type="button"
          aria-pressed={showAllLists}
          onClick={() => {
            setShowAllLists(!showAllLists);
          }}
        >
          {showAllLists ? messages.reminderHideLists : messages.reminderShowLists}
        </Button>
        {(projects.data?.items ?? [])
          .filter(
            (list) =>
              showAllLists || (listOverrides[list.id] ?? listReminderValue(list)).length > 0,
          )
          .map((list) => {
            const current = listOverrides[list.id] ?? listReminderValue(list);
            return (
              <label className="token-row" key={list.id}>
                <span>{list.name}</span>
                <select
                  className="token-name is-short"
                  aria-label={list.name}
                  value={current}
                  onChange={(event) => {
                    const next = event.target.value;
                    setListOverrides((previous) => ({ ...previous, [list.id]: next }));
                    runAction(
                      api
                        .updateProject(list.id, {
                          default_reminder_trigger: next.length === 0 ? null : next,
                        })
                        .then(() => {
                          runAction(queryClient.invalidateQueries({ queryKey: ['projects'] }));
                        }),
                    );
                  }}
                >
                  <option value="">{messages.reminderInherit}</option>
                  <option value="off">{messages.reminderNone}</option>
                  {REMINDER_VALUES.map((item) => (
                    <option key={item} value={item}>
                      {reminderLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
      </section>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.pushTitle}</h2>
            <p>{pushText(messages, push)}</p>
          </div>
        </div>
        {push === 'default' ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (typeof Notification === 'undefined') {
                setPush('missing');
                return;
              }
              runAction(
                Notification.requestPermission().then((next) => {
                  setPush(next);
                }),
              );
            }}
          >
            {messages.pushEnable}
          </Button>
        ) : null}
      </section>
    </section>
  );
}

function reminderValue(me: unknown, key: string): string {
  if (typeof me !== 'object' || me === null) {
    return '';
  }
  const value = (me as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function listReminderValue(list: Project): string {
  const value = (list as Project & { default_reminder_trigger?: string | null })
    .default_reminder_trigger;
  return typeof value === 'string' ? value : '';
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

function pushPermission(): NotificationPermission | 'missing' {
  if (typeof Notification === 'undefined') {
    return 'missing';
  }
  return Notification.permission;
}

function pushText(messages: Messages, permission: NotificationPermission | 'missing'): string {
  if (permission === 'granted') {
    return messages.pushGranted;
  }
  if (permission === 'denied') {
    return messages.pushDenied;
  }
  if (permission === 'default') {
    return messages.pushDefault;
  }
  return messages.pushMissing;
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
