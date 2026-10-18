import type { Habit, Project, Task } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { applyQuadrantDrop, DEFAULT_QUADRANT_EFFECTS } from '@reflexionia/domain';
import { api } from '../../api';
import { Button, EmptyState, ErrorState, Kbd, SkeletonRows } from '../../components/ui';
import { fill, useMessages, type Messages } from '../../i18n';
import { useLocale } from '../../i18n/locale';
import { usePreferences, type AccentId } from '../../theme/preferences';
import { useThemePreference } from '../../theme/store';
import { quadrantOf, rowFromTask, smartApiKey } from '../tasks/model';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { newMutation, runOrQueue } from '../offline/client';
import { collectTasks } from '../today/board';
import { TaskList } from '../tasks/TaskList';
import {
  dayFromParam,
  localToday,
  monthCells,
  monthQueryRange,
  overflowHref,
  tasksOnCell,
  yearQueryRange,
} from './month';

const ACCENTS: readonly AccentId[] = ['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'];
const CAL_VIEWS = ['day', 'week', 'multi-day', 'multi-week', 'month', 'year', 'agenda'] as const;

export function InboxPage() {
  const messages = useMessages();
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
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.listTags() });
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
        <ProcessCard
          messages={messages}
          taskTitle={current.title}
          projects={projects.data?.items ?? []}
          onDate={() => {
            void api.snoozeTask(current.id, 'tomorrow').then(() => {
              step();
            });
          }}
          onMove={(projectId) => {
            void api.moveTask(current.id, projectId).then(() => {
              step();
            });
          }}
          onDone={() => {
            void runOrQueue(newMutation('complete', current.id, {}), (key) =>
              api.completeTask(current.id, {}, key),
            ).then(() => {
              step();
            });
          }}
          onDelete={() => {
            void api.deleteTask(current.id).then(() => {
              step();
            });
          }}
          onSkip={() => {
            step();
          }}
        />
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
            locale={navigator.language}
            view="list"
            createProjectId={inbox?.id}
            onComplete={(row) => {
              void runOrQueue(newMutation('complete', row.id, {}), (key) =>
                api.completeTask(row.id, {}, key),
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

  function step(): void {
    setCursor((value) => value + 1);
    void queryClient.invalidateQueries({ queryKey: ['inbox-tasks'] });
  }
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
  readonly taskTitle: string;
  readonly projects: readonly Project[];
  readonly onDate: () => void;
  readonly onMove: (projectId: string) => void;
  readonly onDone: () => void;
  readonly onDelete: () => void;
  readonly onSkip: () => void;
}) {
  return (
    <article>
      <h2>{taskTitle}</h2>
      <div className="page-toolbar">
        <Button onClick={onDate}>{messages.processDate}</Button>
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
  const { view } = useParams();
  const [params] = useSearchParams();
  const current = CAL_VIEWS.includes(view as (typeof CAL_VIEWS)[number]) ? view : 'month';
  const weekStart = usePreferences((state) => state.weekStart);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const cells = monthCells(cursor, weekStart);
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
  const dated = (tasks.data ?? []).filter((task) => task.due_date !== null && task.kind === 'task');
  const selected = params.get('date');
  const day = current === 'day' ? (dayFromParam(selected ?? '') ?? localToday(new Date())) : null;
  const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    cursor,
  );
  return (
    <section className="screen-page is-wide">
      <header className="cal-toolbar">
        <h1>{messages.calendarTitle}</h1>
        <Button
          onClick={() => {
            setCursor(startOfMonth(new Date()));
          }}
        >
          {messages.calToday}
        </Button>
        <Button
          aria-label={messages.calPrev}
          onClick={() => {
            setCursor((currentMonth) => shiftMonth(currentMonth, -1));
          }}
        >
          ‹
        </Button>
        <Button
          aria-label={messages.calNext}
          onClick={() => {
            setCursor((currentMonth) => shiftMonth(currentMonth, 1));
          }}
        >
          ›
        </Button>
        <p className="cal-title">{title}</p>
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
      <CalendarExtras messages={messages} />
      {current === 'year' ? <Year tasks={dated} /> : null}
      {current === 'day' && day !== null ? (
        <ul>
          {tasksOnCell(dated, day).map((task) => (
            <li key={task.id}>
              <Link to={`/list/${task.project_id}?task=${task.id}`}>
                {task.title.trim().length === 0 ? messages.untitled : task.title} · {task.due_date}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {current === 'agenda' ||
      current === 'week' ||
      current === 'multi-day' ||
      current === 'multi-week' ? (
        <ul className="task-list">
          {dated.map((task) => (
            <li key={task.id}>
              <Link className="task-row" to={`/list/${task.project_id}?task=${task.id}`}>
                <span className="task-title">{task.title}</span>
                <time className="task-date">{localKey(new Date(task.due_date ?? ''))}</time>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {current === 'month' ? (
        <Month tasks={dated} messages={messages} weekStart={weekStart} cursor={cursor} />
      ) : null}
    </section>
  );
}

function startOfMonth(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

function shiftMonth(day: Date, delta: number): Date {
  return new Date(day.getFullYear(), day.getMonth() + delta, 1);
}

function localKey(day: Date): string {
  if (Number.isNaN(day.getTime())) {
    return '';
  }
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${String(day.getFullYear())}-${month}-${date}`;
}

function Month({
  tasks,
  messages,
  weekStart,
  cursor,
}: {
  readonly tasks: readonly Task[];
  readonly messages: Messages;
  readonly weekStart: 'monday' | 'sunday';
  readonly cursor: Date;
}) {
  const locale = navigator.language;
  const todayKey = localKey(new Date());
  const cells = monthCells(cursor, weekStart);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const heads = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2026, 0, weekStart === 'monday' ? 5 + index : 4 + index);
    return weekday.format(day);
  });
  return (
    <div className="cal-month">
      {heads.map((label) => (
        <div key={label} className="cal-head">
          {label}
        </div>
      ))}
      {cells.map((day) => {
        const items = tasksOnCell(tasks, day);
        const key = localKey(day);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const outside = day.getMonth() !== cursor.getMonth();
        const href = overflowHref(day);
        const hidden = items.length - 3;
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
          <div key={key} className={classes}>
            <strong>
              <Link to={href}>{day.getDate()}</Link>
            </strong>
            {items.slice(0, 3).map((task) => (
              <Link
                key={task.id}
                className={
                  new Date(task.due_date ?? '').getTime() < Date.now()
                    ? 'cal-pill is-overdue'
                    : 'cal-pill'
                }
                to={`/list/${task.project_id}?task=${task.id}`}
              >
                {task.title.trim().length === 0 ? messages.untitled : task.title}
              </Link>
            ))}
            {hidden > 0 ? (
              <Link to={href} aria-label={moreLabel}>
                +{hidden}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Year({ tasks }: { readonly tasks: readonly Task[] }) {
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, month) => (
        <section key={month}>
          <h3>{month + 1}</h3>
          <p className="ui-badge">
            {tasks.filter((task) => new Date(task.due_date ?? '').getMonth() === month).length}
          </p>
        </section>
      ))}
    </div>
  );
}

function CalendarExtras({ messages }: { readonly messages: Messages }) {
  const events = useQuery({
    queryKey: ['calendar-range'],
    queryFn: () => {
      const from = new Date();
      const to = new Date(from.getTime() + 31 * 24 * 60 * 60 * 1000);
      return api.calendarEvents(from.toISOString(), to.toISOString());
    },
  });
  const external = Array.isArray(events.data?.external) ? events.data.external : [];
  return (
    <>
      <p className="ui-muted">{messages.externalEmpty}</p>
      {external.filter(isRecord).map((event) => (
        <p key={typeof event.id === 'string' ? event.id : 'event'}>
          {typeof event.title === 'string' ? event.title : ''}
        </p>
      ))}
    </>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    case 'year':
      return messages.calYear;
    case 'agenda':
      return messages.calAgenda;
    default:
      return messages.calMonth;
  }
}

export function MatrixPage() {
  const messages = useMessages();
  const tasks = useQuery({
    queryKey: ['matrix-tasks'],
    queryFn: () => api.listTasks({ status: 'active', limit: 100, flat: true }),
  });
  const now = useMemo(() => new Date(), []);
  const groups = {
    do: [] as Task[],
    schedule: [] as Task[],
    delegate: [] as Task[],
    drop: [] as Task[],
  };
  for (const task of tasks.data?.items ?? []) {
    if (task.kind !== 'task') {
      continue;
    }
    groups[quadrantOf(task.priority, task.due_date, now)].push(task);
  }
  const quads = [
    ['do', messages.quadrantDo, 'is-do'],
    ['schedule', messages.quadrantSchedule, 'is-schedule'],
    ['delegate', messages.quadrantDelegate, 'is-delegate'],
    ['drop', messages.quadrantDrop, 'is-drop'],
  ] as const;
  return (
    <section className="screen-page is-wide">
      <h1>{messages.matrixTitle}</h1>
      <p>{messages.matrixRules}</p>
      <p className="ui-muted">{messages.dropSummary}</p>
      {(tasks.data?.items.length ?? 0) === 0 && !tasks.isPending ? (
        <EmptyState title={messages.matrixTitle} body={messages.matrixEmpty} />
      ) : null}
      <div className="quad-grid">
        {quads.map(([key, label, tone]) => (
          <section
            key={key}
            className={`quad ${tone}`}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              const id = event.dataTransfer.getData('text/plain');
              const patch = applyQuadrantDrop(
                DEFAULT_QUADRANT_EFFECTS[key],
                new Date().toISOString(),
              );
              void api
                .patchTask(id, { priority: patch.priority, due_date: patch.dueDate })
                .then(() => {
                  void tasks.refetch();
                });
            }}
          >
            <h2>
              {label} <span className="ui-badge">{groups[key].length}</span>
            </h2>
            <ul>
              {groups[key].map((task) => (
                <li
                  key={task.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', task.id);
                  }}
                >
                  <Link to={`/list/${task.project_id}?task=${task.id}`}>{task.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
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

export function FocusPage() {
  const messages = useMessages();
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) {
      return;
    }
    const id = window.setInterval(() => {
      setLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [running]);
  return (
    <section className="screen-page">
      <h1>{messages.focusTitle}</h1>
      <p>{messages.focusHint}</p>
      <p className="detail-title">{formatClock(left)}</p>
      <div className="page-toolbar">
        <Button
          variant="primary"
          onClick={() => {
            setRunning((value) => !value);
          }}
        >
          {running ? messages.focusPause : messages.focusStart}
        </Button>
        <Button
          onClick={() => {
            setLeft(25 * 60);
            setRunning(false);
          }}
        >
          {messages.focusReset}
        </Button>
      </div>
    </section>
  );
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function SearchPage() {
  const messages = useMessages();
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
        <input name="q" defaultValue={q} aria-label={messages.searchTitle} />
      </form>
      {search.data?.groups.length === 0 ? <p>{messages.searchEmpty}</p> : null}
      {(search.data?.groups ?? []).map((group) => (
        <section key={group.type}>
          <h2>{groupLabel(messages, group.type)}</h2>
          <ul className="task-list">
            {group.items.map((item, index) => {
              const title =
                typeof item.title === 'string'
                  ? item.title
                  : typeof item.name === 'string'
                    ? item.name
                    : '';
              const id = typeof item.id === 'string' ? item.id : String(index);
              const projectId = typeof item.project_id === 'string' ? item.project_id : '';
              const href =
                group.type === 'list'
                  ? `/list/${id}`
                  : projectId.length > 0
                    ? `/list/${projectId}?task=${id}`
                    : `/search?q=${encodeURIComponent(title)}`;
              return (
                <li key={id}>
                  <Link className="task-row" to={href}>
                    <span className="task-title">{highlight(title, q)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}

export function HabitDetailPage() {
  const messages = useMessages();
  const { id } = useParams();
  const habits = useQuery({ queryKey: ['habits'], queryFn: () => api.listHabits() });
  const habit = habits.data?.items.find((item) => item.id === id);
  const stats = useQuery({
    queryKey: ['habit-stats', id],
    queryFn: () => api.habitStats(id ?? '', new Date().getFullYear()),
    enabled: id !== undefined,
  });
  if (habits.isPending || stats.isPending) {
    return <SkeletonRows />;
  }
  if (habit === undefined || stats.data === undefined) {
    return (
      <ErrorState
        title={fill(messages.loadFailed, messages.habitTitle)}
        retryLabel={messages.retry}
        onRetry={() => {
          void habits.refetch();
        }}
      />
    );
  }
  return (
    <section className="screen-page">
      <p>
        <Link to="/habits">{messages.habitsTitle}</Link>
      </p>
      <h1>{habit.name}</h1>
      <div className="page-toolbar">
        <Stat label={messages.streakCurrent} value={String(stats.data.streak_current)} />
        <Stat label={messages.streakBest} value={String(stats.data.streak_best)} />
        <Stat
          label={messages.monthPercent}
          value={`${String(stats.data.completion_percent.month)}%`}
        />
        <Stat
          label={messages.totalCheckins}
          value={String(stats.data.heatmap.reduce((sum, cell) => sum + cell.count, 0))}
        />
      </div>
      <h2>{messages.heatYear}</h2>
      <div className="habit-heat" aria-label={messages.heatYear}>
        {stats.data.heatmap.map((cell) => (
          <i
            key={cell.date}
            className={
              cell.count > 2
                ? 'is-3'
                : cell.count > 1
                  ? 'is-2'
                  : cell.count > 0
                    ? 'is-1'
                    : undefined
            }
            title={cell.date}
          />
        ))}
      </div>
      <WeekDots habit={habit} />
      <Button
        variant="danger"
        onClick={() => {
          if (id !== undefined) {
            void api.deleteHabit(id);
          }
        }}
      >
        {messages.deleteHabit}
      </Button>
    </section>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p>
      <span className="ui-muted">{label}</span>
      <strong> {value}</strong>
    </p>
  );
}

function WeekDots({ habit }: { readonly habit: Habit }) {
  return (
    <div className="week-dots" aria-label="week">
      {habit.frequency.map((day) => (
        <button
          key={day}
          type="button"
          className={habit.today.count > 0 ? 'is-done' : undefined}
          onClick={() => {
            void api.checkInHabit(
              habit.id,
              { date: habit.today.date, count: habit.today.count + 1 },
              crypto.randomUUID(),
            );
          }}
        >
          {day.slice(0, 2)}
        </button>
      ))}
    </div>
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

export function SettingsLayout() {
  const messages = useMessages();
  const links = [
    ['/settings/account', messages.settingsAccount],
    ['/settings/appearance', messages.appearanceTitle],
    ['/settings/capture', messages.settingsCapture],
    ['/settings/notifications', messages.settingsNotifications],
    ['/settings/smart-lists', messages.settingsSmart],
    ['/settings/calendar', messages.settingsCalendar],
    ['/settings/tokens', messages.settingsTokens],
    ['/settings/integrations', messages.settingsIntegrations],
    ['/settings/automations', messages.settingsAutomations],
    ['/settings/webhooks', messages.settingsWebhooks],
    ['/settings/data', messages.settingsData],
    ['/settings/plugins', messages.settingsPlugins],
    ['/settings/sharing', messages.settingsSharing],
    ['/settings/shortcuts', messages.settingsShortcuts],
  ] as const;
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={messages.settingsTitle}>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}

export function CalendarSettings() {
  const messages = useMessages();
  return <GapPage title={messages.settingsCalendar} body={messages.feedEmpty} />;
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
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  return (
    <section>
      <h1>{messages.settingsAccount}</h1>
      <p>{messages.accountHint}</p>
      {me.data === undefined ? <SkeletonRows /> : null}
      {me.data !== undefined ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void api
                .updateMe({
                  display_name: name.length > 0 ? name : me.data.display_name,
                  time_zone: zone.length > 0 ? zone : me.data.time_zone,
                })
                .then(() => {
                  setStatus(messages.saved);
                })
                .catch(() => {
                  setStatus(messages.saveFailed);
                });
            }}
          >
            <label>
              {messages.displayName}
              <input
                defaultValue={me.data.display_name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </label>
            <p>{me.data.email}</p>
            <label>
              {messages.timeZone}
              <input
                defaultValue={me.data.time_zone}
                onChange={(event) => {
                  setZone(event.target.value);
                }}
              />
            </label>
            <Button type="submit" variant="primary">
              {messages.saveChanges}
            </Button>
            {status !== null ? <p role="status">{status}</p> : null}
          </form>
          <section className="settings-block">
            <h2>{messages.enableTwoFactor}</h2>
            <p>{messages.twoFactorUnavailable}</p>
            <Button
              type="button"
              onClick={() => {
                void api.beginTotp().then((body) => {
                  const secret =
                    typeof body.secret === 'string' ? body.secret : messages.twoFactorCode;
                  setStatus(secret);
                });
              }}
            >
              {messages.enableTwoFactor}
            </Button>
            <label>
              {messages.twoFactorCode}
              <input
                value={totpCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => {
                  setTotpCode(event.target.value);
                }}
              />
            </label>
            <Button
              type="button"
              onClick={() => {
                void api.confirmTotp(totpCode).then(() => {
                  setStatus(messages.saved);
                });
              }}
            >
              {messages.saveChanges}
            </Button>
          </section>
          <section className="settings-block">
            <h2>{messages.accountDanger}</h2>
            <label>
              {messages.deleteAccountUnavailable}
              <input
                value={confirmEmail}
                onChange={(event) => {
                  setConfirmEmail(event.target.value);
                }}
              />
            </label>
            <Button
              type="button"
              variant="danger"
              disabled={confirmEmail !== me.data.email}
              onClick={() => {
                if (confirmEmail === me.data.email) {
                  void api.deleteAccount(me.data.email);
                }
              }}
            >
              {messages.deleteAccountUnavailable}
            </Button>
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
  const inbound = useQuery({ queryKey: ['inbound'], queryFn: () => api.inboundEmail() });
  const [address, setAddress] = useState<string | null>(null);
  return (
    <section>
      <h1>{messages.settingsCapture}</h1>
      <p>{messages.captureHint}</p>
      <label>
        {messages.parserLanguage}
        <select
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
      </label>
      <h2>{messages.inbound}</h2>
      <p>{inbound.data?.active === true ? messages.online : messages.offline}</p>
      {address !== null ? <p>{address}</p> : null}
      <div className="page-toolbar">
        <Button
          onClick={() => {
            void api.rotateInboundEmail().then((created) => {
              setAddress(created.address);
            });
          }}
        >
          {messages.regenerate}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            void api.revokeInboundEmail();
            setAddress(null);
          }}
        >
          {messages.revoke}
        </Button>
      </div>
    </section>
  );
}

export function NotificationSettings() {
  const messages = useMessages();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  return (
    <section>
      <h1>{messages.settingsNotifications}</h1>
      <p>{messages.notificationsHint}</p>
      <label>
        {messages.dailyReminder}
        <input
          type="time"
          defaultValue={me.data?.daily_reminder_time ?? ''}
          onBlur={(event) => {
            void api.updateMe({
              daily_reminder_time: event.target.value.length === 0 ? null : event.target.value,
            });
          }}
        />
      </label>
      <h2>{messages.quietHours}</h2>
      <p>{messages.quietLocal}</p>
      <p className="ui-muted">{messages.testUnavailable}</p>
    </section>
  );
}

export function GapPage({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <EmptyState title={title} body={body} />
    </section>
  );
}

export function ShortcutSettings() {
  const messages = useMessages();
  const rows = [
    ['?', messages.shortcutsTitle],
    ['N', messages.fab],
    ['Ctrl/Cmd+K', messages.paletteTitle],
    ['/', messages.searchTitle],
    ['G T', messages.navToday],
    ['G I', messages.navInbox],
    ['G C', messages.navCalendar],
    ['G M', messages.navMatrix],
    ['G S', messages.navSettings],
    ['Esc', messages.close],
    ['.', messages.syncNow],
  ];
  return (
    <section>
      <h1>{messages.settingsShortcuts}</h1>
      <table className="shortcut-table">
        <tbody>
          {rows.map(([keys, label]) => (
            <tr key={keys}>
              <td>{label}</td>
              <td>
                <Kbd>{keys ?? ''}</Kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const choice = useThemePreference((state) => state.preference);
  return (
    <section>
      <p>{messages.appearanceSaved}</p>
      <p className="ui-muted">
        {messages.themeLabel}: {choice}
      </p>
      <fieldset>
        <legend>{messages.density}</legend>
        <p>{messages.densityHint}</p>
        <label>
          <input
            type="radio"
            checked={density === 'comfortable'}
            onChange={() => {
              setDensity('comfortable');
            }}
          />
          {messages.densityComfortable}
        </label>
        <label>
          <input
            type="radio"
            checked={density === 'compact'}
            onChange={() => {
              setDensity('compact');
            }}
          />
          {messages.densityCompact}
        </label>
      </fieldset>
      <fieldset>
        <legend>{messages.accent}</legend>
        <p>{messages.accentHint}</p>
        {ACCENTS.map((item) => (
          <label key={item}>
            <input
              type="radio"
              checked={accent === item}
              onChange={() => {
                setAccent(item);
              }}
            />
            {item}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{messages.weekStart}</legend>
        <p>{messages.weekStartHint}</p>
        <label>
          <input
            type="radio"
            checked={week === 'monday'}
            onChange={() => {
              setWeek('monday');
            }}
          />
          {messages.monday}
        </label>
        <label>
          <input
            type="radio"
            checked={week === 'sunday'}
            onChange={() => {
              setWeek('sunday');
            }}
          />
          {messages.sunday}
        </label>
      </fieldset>
      <LanguageField />
    </section>
  );
}

function LanguageField() {
  const messages = useMessages();
  const choice = useLocale((state) => state.choice);
  const setChoice = useLocale((state) => state.setChoice);
  return (
    <fieldset>
      <legend>{messages.language}</legend>
      {(['auto', 'es', 'en'] as const).map((item) => (
        <label key={item}>
          <input
            type="radio"
            checked={choice === item}
            onChange={() => {
              setChoice(item);
            }}
          />
          {item === 'auto'
            ? messages.languageAuto
            : item === 'es'
              ? messages.languageEs
              : messages.languageEn}
        </label>
      ))}
    </fieldset>
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
