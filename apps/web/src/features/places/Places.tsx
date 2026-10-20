import { PriorityCheck } from '../../components/PriorityCheck';
import { displayTitle } from '../tasks/displayTitle';
import { ApiError, type Project, type Task } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { eventDayRange } from './event-span';
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

  return (
    <section className="screen-page">
      <header className="page-header">
        <h1>
          {messages.inboxTitle}{' '}
          {inbox !== undefined ? <span className="ui-badge">{inbox.active_task_count}</span> : null}
        </h1>
        <Button
          onClick={() => {
            setProcess(true);
            setCursor(0);
          }}
        >
          {messages.process}
        </Button>
      </header>
      {!process ? <TaskComposer defaultProjectId={inbox?.id} /> : null}
      {tasks.isPending ? <SkeletonRows /> : null}
      {tasks.isError ? (
        <ErrorState
          title={fill(messages.loadFailed, messages.inboxTitle)}
          retryLabel={messages.retry}
          onRetry={() => {
            void tasks.refetch();
          }}
        />
      ) : null}
      {process && current !== undefined ? (
        <>
          <p>{fill(messages.processOf, `${String(cursor + 1)}/${String(rows.length)}`)}</p>
          <Button
            variant="ghost"
            onClick={() => {
              setProcess(false);
            }}
          >
            {messages.processExit}
          </Button>
          <ProcessCard
            messages={messages}
            locale={locale}
            taskTitle={current.title}
            projects={projects.data?.items ?? []}
            onDate={(preset, date) => {
              void api.snoozeTask(current.id, preset, date).then(() => {
                step(messages.processDate);
              });
            }}
            onMove={(projectId) => {
              void api.moveTask(current.id, projectId).then(() => {
                step(messages.processMove);
              });
            }}
            onDone={() => {
              void runOrQueue(newMutation('complete', current.id, {}), (key) =>
                api.completeTask(current.id, completeBody(), key),
              ).then(() => {
                step(messages.processDoneAction);
              });
            }}
            onDelete={() => {
              const id = current.id;
              void api.deleteTask(id).then(() => {
                useActionToast.getState().show(messages.movedToTrash, () => {
                  void api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient));
                });
                step(messages.movedToTrash);
              });
            }}
            onSkip={() => {
              step();
            }}
          />
        </>
      ) : null}
      {process && current === undefined && !tasks.isPending ? (
        <EmptyState title={messages.processDone} body={messages.emptyInbox} />
      ) : null}
      {!process && !tasks.isError ? (
        rows.length === 0 && !tasks.isPending ? (
          <EmptyState title={messages.inboxTitle} body={messages.emptyInbox} />
        ) : (
          <TaskList
            messages={messages}
            rows={rows}
            locale={locale}
            view="list"
            onComplete={(row) => {
              void runOrQueue(newMutation('complete', row.id, {}), (key) =>
                api.completeTask(row.id, completeBody(), key),
              );
            }}
            onCreated={() => {
              void refreshTaskSurfaces(queryClient);
            }}
          />
        )
      ) : null}
    </section>
  );

  function step(text?: string): void {
    setCursor((value) => value + 1);
    if (text !== undefined) {
      useActionToast.getState().show(text);
    }
    void refreshTaskSurfaces(queryClient);
  }
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
      void navigate('/calendar/month', { replace: true });
    }
  }, [view, knownView, navigate]);
  const [workweek, setWorkweek] = useState(
    () => localStorage.getItem('tick-tack-done.calendar-workweek') === 'true',
  );
  const allCells = viewDays(current ?? 'month', cursor, weekStart);
  const cells =
    workweek && (current === 'week' || current === 'multi-day')
      ? allCells.filter((day) => day.getDay() !== 0 && day.getDay() !== 6)
      : allCells;
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
    ? (tasks.data ?? []).filter((task) => task.due_date !== null && task.kind === 'task')
    : [];
  const title = calendarTitle(locale, current ?? 'month', cursor, cells);
  const move = (delta: number): void => {
    const next = shiftView(cursor, current ?? 'month', delta, weekStart);
    setCursor(next);
    if (current === 'day') {
      const query = new URLSearchParams(params);
      query.set('date', localDateParam(next));
      setParams(query, { replace: true });
    }
  };
  return (
    <section className={`screen-page is-wide calendar-page calendar-${current ?? 'month'}`}>
      <header className="cal-toolbar">
        <h1>
          {title}
          {current === 'week' || current === 'multi-day'
            ? ` · S${String(isoWeek(cells[0] ?? cursor))}`
            : ''}
        </h1>
        {current === 'week' || current === 'multi-day' ? (
          <label className="cal-workweek">
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
        <div className="cal-nav">
          <Button
            onClick={() => {
              const today = localToday(new Date());
              setCursor(today);
              if (current === 'day') {
                const query = new URLSearchParams(params);
                query.set('date', localDateParam(today));
                setParams(query, { replace: true });
              }
            }}
          >
            {messages.calToday}
          </Button>
          <Button
            aria-label={calendarShiftLabel(messages, current ?? 'month', -1)}
            onClick={() => {
              move(-1);
            }}
          >
            ‹
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
        <CalendarVisibility
          messages={messages}
          showTasks={showTasks}
          onTasks={setShowTasks}
          subscriptions={subscriptionItems(subscriptions.data)}
        />
        <div className="cal-views">
          {CAL_VIEWS.map((item) => (
            <Link
              key={item}
              to={`/calendar/${item}`}
              aria-current={current === item ? 'page' : undefined}
            >
              {labelView(messages, item)}
            </Link>
          ))}
        </div>
      </header>
      {subscriptionItems(subscriptions.data).length === 0 && external.length === 0 ? (
        <p className="ui-muted">
          <Link to="/settings/calendar">{messages.externalEmptyTitle}</Link>
        </p>
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
      {current === 'quarter' ? (
        <QuarterBoard
          months={quarterMonths(cursor)}
          tasks={dated}
          weekStart={weekStart}
          messages={messages}
          onOpen={(month) => {
            setCursor(month);
            void navigate('/calendar/month');
          }}
        />
      ) : null}
      {current === 'year' ? (
        <YearBoard
          year={cursor.getFullYear()}
          tasks={dated}
          weekStart={weekStart}
          colors={colors}
          onOpen={(month) => {
            setCursor(new Date(cursor.getFullYear(), month, 1));
            void navigate('/calendar/month');
          }}
        />
      ) : null}
      {current === 'agenda' ? (
        <Agenda
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
            />
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
  const locale = useAppLocale();
  const todayKey = localKey(new Date());
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const heads = Array.from({ length: columns }, (_, index) =>
    weekday.format(days[index] ?? cursor),
  );
  return (
    <div
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
        const hidden = chips.length - 3;
        const when = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(day);
        const moreLabel = (hidden === 1 ? messages.moreTask : messages.moreTasks)
          .replace('{count}', String(hidden))
          .replace('{date}', when);
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
              <span className="cal-week-number">{isoWeek(day)}</span>
            ) : null}
            <div
              className={classes}
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
                {chips.slice(0, 3).map((chip) => (
                  <i key={chip.kind === 'task' ? chip.task.id : chip.event.id} />
                ))}
              </span>
              {dots
                ? null
                : chips.slice(0, 3).map((chip) =>
                    chip.kind === 'task' ? (
                      <Link
                        key={chip.task.id}
                        title={chipLabel(chip.task, messages.untitled, locale)}
                        style={chipStyle(colors.get(chip.task.project_id))}
                        className={
                          isCalendarOverdue(chip.task.due_date, chip.task.time_zone, new Date())
                            ? 'cal-pill is-overdue'
                            : 'cal-pill'
                        }
                        to={`/list/${chip.task.project_id}?task=${chip.task.id}`}
                      >
                        {chipLabel(chip.task, messages.untitled, locale)}
                      </Link>
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
                        {chip.event.is_all_day
                          ? ''
                          : `${clockLabel(chip.event.starts_at, locale)} `}
                        {chip.event.title}
                      </button>
                    ),
                  )}
              {!dots && hidden > 0 ? (
                <Link to={href} aria-label={moreLabel}>
                  +{hidden}
                </Link>
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function QuarterBoard({
  months,
  tasks,
  weekStart,
  messages,
  onOpen,
}: {
  readonly months: readonly Date[];
  readonly tasks: readonly Task[];
  readonly weekStart: 'monday' | 'sunday';
  readonly messages: Messages;
  readonly onOpen: (month: Date) => void;
}) {
  const locale = useAppLocale();
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  return (
    <div className="quarter-board">
      {months.map((month) => (
        <section key={localKey(month)} className="quarter-month">
          <button
            type="button"
            onClick={() => {
              onOpen(month);
            }}
          >
            {monthName.format(month)}
          </button>
          <DayGrid
            days={monthCells(month, weekStart)}
            columns={7}
            tasks={tasks}
            messages={messages}
            cursor={month}
            outsideMonth
            dots
          />
        </section>
      ))}
    </div>
  );
}

function YearBoard({
  year,
  tasks,
  weekStart,
  colors,
  onOpen,
}: {
  readonly year: number;
  readonly tasks: readonly Task[];
  readonly weekStart: 'monday' | 'sunday';
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpen: (month: number) => void;
}) {
  const locale = useAppLocale();
  const todayKey = localKey(new Date());
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const sample = monthCells(new Date(year, 0, 1), weekStart);
  const heads = sample.slice(0, 7).map((day) => weekday.format(day));
  return (
    <div className="year-board">
      {Array.from({ length: 12 }, (_, month) => {
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
            <div className="year-mini">
              {heads.map((label, index) => (
                <span key={`${label}-${String(index)}`} className="year-dow">
                  {label}
                </span>
              ))}
              {cells.map((day) => {
                const key = localKey(day);
                const inside = day.getMonth() === month;
                const marks = inside ? dayMarks(tasks, day, colors) : [];
                const when = new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'long',
                }).format(day);
                return (
                  <Link
                    key={key}
                    className={[
                      'year-day',
                      inside ? '' : 'is-outside',
                      key === todayKey ? 'is-today' : '',
                    ]
                      .filter((item) => item.length > 0)
                      .join(' ')}
                    to={`/calendar/day?date=${key}`}
                    aria-label={marks.length > 0 ? `${when}, ${String(marks.length)}` : when}
                  >
                    <span className="year-num">{day.getDate()}</span>
                    <span className="year-marks" aria-hidden="true">
                      {marks.map((color) => (
                        <i key={color} style={{ background: color }} />
                      ))}
                    </span>
                  </Link>
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
  tasks,
  events,
  locale,
  messages,
  colors,
  onOpenEvent,
}: {
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly locale: string;
  readonly messages: Messages;
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const cache = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const todayKey = localKey(new Date());
  type Item =
    | { kind: 'task'; task: Task; time: string }
    | { kind: 'event'; event: ExternalEventView; time: string };
  const groups = new Map<string, Item[]>();
  function add(key: string, item: Item): void {
    if (key < todayKey) return;
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
    add(eventDayRange(event).start, {
      kind: 'event',
      event,
      time: event.is_all_day ? '' : event.starts_at,
    });
  }
  const forward = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
              <header className="agenda-day-head">{heading}</header>
              <ul>
                {[...bucket]
                  .sort((left, right) => left.time.localeCompare(right.time))
                  .map((item) => {
                    if (item.kind === 'event') {
                      const event = item.event;
                      return (
                        <li key={`event-${event.id}`} className="agenda-row">
                          <span
                            className="cal-dot"
                            style={{ background: event.color ?? 'var(--accent)' }}
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
                            <span>
                              {event.is_all_day
                                ? messages.calAllDay
                                : clockLabel(event.starts_at, locale)}{' '}
                              · {event.title}
                            </span>
                          </button>
                        </li>
                      );
                    }
                    const task = item.task;
                    const title = displayTitle(task.title) || messages.untitled;
                    return (
                      <li key={`task-${task.id}`} className="agenda-row">
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
                          to={`/list/${task.project_id}?task=${task.id}`}
                        >
                          <span>
                            {task.is_all_day
                              ? messages.calAllDay
                              : clockLabel(task.due_date ?? '', locale)}{' '}
                            · {title}
                          </span>
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
  tasks,
  events,
  messages,
  colors,
  onOpenEvent,
}: {
  readonly dayKey: string;
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly messages: Messages;
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale();
  const day = dayFromParam(dayKey);
  if (day === null) {
    return null;
  }
  return (
    <Agenda
      tasks={tasksOnCell(tasks, day)}
      events={eventsOnDay(events, day)}
      locale={locale}
      messages={messages}
      colors={colors}
      onOpenEvent={onOpenEvent}
    />
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
  const [open, setOpen] = useState(false);
  return (
    <div className="group-popover">
      <Button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {messages.calendarSource}
      </Button>
      {open ? (
        <div className="menu-card" role="menu">
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
                  void api
                    .updateCalendarSubscription(row.id, { visible: !row.visible })
                    .then(() => {
                      void queryClient.invalidateQueries({ queryKey: ['calendar-subscriptions'] });
                      void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
                    });
                }}
              />
              {row.summary ?? row.id}
            </label>
          ))}
        </div>
      ) : null}
    </div>
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
                void call.then(() => refreshTaskSurfaces(queryClient));
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
      void navigate(`/list/${id}?task=${taskId}`, { replace: true });
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
      void navigate(`/list/${detail.data.project_id}?task=${detail.data.id}`, { replace: true });
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
                    void api.cancelTotp().finally(() => {
                      setSetup(null);
                      setTotpCode('');
                      setTotpError(null);
                    });
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
                void api.deleteAccount(profile.email);
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
                void queryClient.invalidateQueries({ queryKey: ['me'] });
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
                    void api
                      .updateProject(list.id, {
                        default_reminder_trigger: next.length === 0 ? null : next,
                      })
                      .then(() => {
                        void queryClient.invalidateQueries({ queryKey: ['projects'] });
                      });
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
              void Notification.requestPermission().then((next) => {
                setPush(next);
              });
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
