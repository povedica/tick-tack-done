import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, GripVertical, Lightbulb, Menu, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PriorityCheck } from '../../components/PriorityCheck';
import { UndoToastStack } from '../../components/UndoToast';
import { ViewMenu } from '../../components/ViewMenu';
import { api } from '../../api';
import { captureLanguage, fill, useMessages, type Messages } from '../../i18n';
import { warningText } from '../capture/components/CaptureSheet';
import { noticesFrom, useCaptureNotice } from '../capture/notice';
import { quickAddRequest } from '../capture/quick-add';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { useShellActions } from '../../shell/shell-actions';
import { isTypingTarget } from '../../shell/shortcuts';
import { flushOfflineQueue, newMutation, runOrQueue } from '../offline/client';
import { tasksApi } from './api';
import { loadTodayTasks } from './board';
import { requestUndo, settleComplete, pushUndo, type CompleteJob } from './completion';
import {
  formatDayId,
  formatDueDate,
  groupFromLocation,
  groupTasks,
  partitionToday,
  visibleTasks,
  type TaskGroupKey,
  type TodayTask,
} from './groups';

const GROUP_KEY = 'tick-tack-done.today.group';

export function TodayPage() {
  const messages = useMessages();
  const shell = useShellActions();
  const locale = navigator.language;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notice = useCaptureNotice((state) => state.notice);
  const setNotice = useCaptureNotice((state) => state.setNotice);
  const [draft, setDraft] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const group = groupFromLocation(params.get('group'), readGroup());
  const tasks = useQuery({
    queryKey: ['today-tasks'],
    queryFn: () => loadTodayTasks(tasksApi, new Date()),
    refetchOnWindowFocus: false,
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => tasksApi.listProjects(),
    refetchOnWindowFocus: false,
  });
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
    refetchOnWindowFocus: false,
  });
  const habits = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.listHabits(),
    refetchOnWindowFocus: false,
  });
  const tagNames = new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag.name]));
  const tagColors = new Map((tags.data?.items ?? []).map((tag) => [tag.id, colorOf(tag)]));
  const projectNames = new Map(
    (projects.data?.items ?? []).map((project) => [
      project.id,
      project.is_inbox ? messages.smartInbox : project.name,
    ]),
  );
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [toasts, setToasts] = useState<readonly { id: string; title: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [details, setDetails] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [groupOpen, setGroupOpen] = useState(false);
  const jobs = useRef(new Map<string, CompleteJob>());
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  useEffect(() => {
    if (notice === null) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
  }, [notice, queryClient]);

  useEffect(() => {
    function onOnline(): void {
      void flushOfflineQueue().then(() => {
        void queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      });
    }
    window.addEventListener('online', onOnline);
    onOnline();
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [queryClient]);

  useEffect(() => {
    if (params.get('group') === group) {
      return;
    }
    const next = new URLSearchParams(params);
    next.set('group', group);
    setParams(next, { replace: true });
  }, [group, params, setParams]);

  const expireToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const undo = useCallback(
    (id: string) => {
      setToasts((current) => current.filter((item) => item.id !== id));
      setHidden((current) => {
        if (!current.has(id)) {
          return current;
        }
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      const job = jobs.current.get(id);
      if (job === undefined || requestUndo(job) === 'defer') {
        return;
      }
      void tasksApi.uncompleteTask(id, crypto.randomUUID()).catch(() => {
        setHidden((current) => new Set(current).add(id));
        setActionError(messages.undoFailed);
      });
    },
    [messages.undoFailed],
  );

  const undoRef = useRef(undo);
  undoRef.current = undo;

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'z' ||
        event.shiftKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      const latest = toasts.at(-1);
      if (latest === undefined) {
        return;
      }
      event.preventDefault();
      undoRef.current(latest.id);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toasts]);

  function chooseGroup(value: TaskGroupKey): void {
    writeGroup(value);
    const next = new URLSearchParams(params);
    next.set('group', value);
    setParams(next, { replace: true });
  }

  function complete(task: TodayTask): void {
    if (hidden.has(task.id)) {
      return;
    }
    const job: CompleteJob = { phase: 'inflight' };
    jobs.current.set(task.id, job);
    setHidden((current) => new Set(current).add(task.id));
    setToasts((current) => pushUndo(current, { id: task.id, title: task.title }));
    setActionError(null);
    void runOrQueue(newMutation('complete', task.id, {}), (key) =>
      tasksApi.completeTask(task.id, {}, key),
    )
      .then(async ({ result }) => {
        if (result === null) {
          job.phase = 'done';
          return;
        }
        try {
          const outcome = await settleComplete(job, () =>
            tasksApi.uncompleteTask(task.id, crypto.randomUUID()),
          );
          if (outcome === 'reverted') {
            setHidden((current) => {
              const next = new Set(current);
              next.delete(task.id);
              return next;
            });
          } else {
            void refreshTaskSurfaces(queryClient);
          }
        } catch {
          setHidden((current) => new Set(current).add(task.id));
          setActionError(messages.undoFailed);
        }
      })
      .catch(() => {
        if (job.phase === 'undo') {
          return;
        }
        setHidden((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
        setToasts((current) => current.filter((item) => item.id !== task.id));
        setActionError(messages.completeFailed);
      });
  }

  const inbox = projects.data?.items.find((project) => project.is_inbox);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function addTask(): void {
    const title = draft.trim();
    if (title.length === 0) {
      return;
    }
    const request = quickAddRequest({
      text: title,
      language: captureLanguage(locale),
      now: new Date().toISOString(),
      timeZone,
      viewDay: 'today',
    });
    const tempId = `pending-${crypto.randomUUID()}`;
    setDraft('');
    setActionError(null);
    addRef.current?.focus();
    queryClient.setQueryData<TodayTask[]>(['today-tasks'], (current) => [
      {
        id: tempId,
        title: request.parsed.title.length > 0 ? request.parsed.title : title,
        priority: request.parsed.priority ?? 'none',
        dueDate: request.dueDate ?? request.parsed.due?.date ?? null,
        timeZone,
        status: 'active',
        projectId: inbox?.id ?? '',
        tagIds: [],
      },
      ...(current ?? []),
    ]);
    void runOrQueue(newMutation('create', tempId, { ...request.body }), (key) =>
      api.createTask(request.body, key),
    )
      .then(async (outcome) => {
        if (outcome.result !== null) {
          const warnings = noticesFrom(outcome.result.warnings);
          if (warnings.length > 0) {
            setNotice({ title: outcome.result.title, warnings });
          }
        }
        if (!outcome.queued) {
          await refreshTaskSurfaces(queryClient);
        }
      })
      .catch(() => {
        queryClient.setQueryData<TodayTask[]>(['today-tasks'], (current) =>
          (current ?? []).filter((task) => task.id !== tempId),
        );
        setDraft(title);
        setActionError(messages.createFailed);
        addRef.current?.focus();
      });
  }
  const shown = visibleTasks(tasks.data ?? [], hidden).filter((task) =>
    hideCompleted ? task.status !== 'completed' : true,
  );
  const parts = partitionToday(shown, new Date());
  const sections = groupTasks(parts.today, group);
  const empty =
    !tasks.isPending && !tasks.isError && parts.overdue.length + parts.today.length === 0;

  return (
    <section className="today" aria-labelledby="today-heading">
      <header className="today-header">
        <div className="page-title">
          <button
            type="button"
            className="icon-button"
            aria-label={shell.navLabel}
            onClick={shell.toggleNav}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div>
            <h1 id="today-heading">{messages.todayTitle}</h1>
            <p className="today-date">{dateLabel}</p>
          </div>
        </div>
        <div className="page-actions">
          <Link className="icon-button" to="/habits" aria-label={messages.suggestions}>
            <Lightbulb size={20} aria-hidden="true" />
          </Link>
          <div className="group-popover">
            <button
              type="button"
              className="icon-button"
              aria-label={messages.groupLabel}
              aria-expanded={groupOpen}
              onClick={() => {
                setGroupOpen((current) => !current);
              }}
            >
              <ArrowUpDown size={20} aria-hidden="true" />
            </button>
            {groupOpen ? (
              <div className="menu-card" role="menu" aria-label={messages.groupLabel}>
                <GroupOption
                  label={messages.groupPriority}
                  checked={group === 'priority'}
                  onClick={() => {
                    chooseGroup('priority');
                    setGroupOpen(false);
                  }}
                />
                <GroupOption
                  label={messages.groupDue}
                  checked={group === 'due'}
                  onClick={() => {
                    chooseGroup('due');
                    setGroupOpen(false);
                  }}
                />
                <GroupOption
                  label={messages.groupTag}
                  checked={group === 'tag'}
                  onClick={() => {
                    chooseGroup('tag');
                    setGroupOpen(false);
                  }}
                />
                <GroupOption
                  label={messages.groupList}
                  checked={group === 'list'}
                  onClick={() => {
                    chooseGroup('list');
                    setGroupOpen(false);
                  }}
                />
              </div>
            ) : null}
          </div>
          <ViewMenu
            messages={messages}
            details={details}
            onDetails={setDetails}
            hideCompleted={hideCompleted}
            onHideCompleted={setHideCompleted}
            onPrint={() => {
              window.print();
            }}
          >
            <GroupOption
              label={messages.groupPriority}
              checked={group === 'priority'}
              onClick={() => {
                chooseGroup('priority');
              }}
            />
            <GroupOption
              label={messages.groupDue}
              checked={group === 'due'}
              onClick={() => {
                chooseGroup('due');
              }}
            />
            <GroupOption
              label={messages.groupTag}
              checked={group === 'tag'}
              onClick={() => {
                chooseGroup('tag');
              }}
            />
            <GroupOption
              label={messages.groupList}
              checked={group === 'list'}
              onClick={() => {
                chooseGroup('list');
              }}
            />
          </ViewMenu>
        </div>
      </header>
      <form
        className="quick-add"
        onSubmit={(event) => {
          event.preventDefault();
          addTask();
        }}
      >
        <input
          ref={addRef}
          name="title"
          value={draft}
          aria-label={messages.addTask}
          placeholder={`+ ${messages.addTask}`}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
      </form>
      <details className="plan" open>
        <summary>{messages.planTitle}</summary>
        <p>{messages.planEmpty}</p>
      </details>
      {notice !== null ? (
        <div className="notice" role="status">
          <p>
            {messages.created}: {notice.title}
          </p>
          {notice.warnings.map((warning) => (
            <p key={`${warning.code}-${warning.name ?? ''}`}>{warningText(messages, warning)}</p>
          ))}
        </div>
      ) : null}
      {actionError !== null ? (
        <p className="error" role="alert">
          {actionError}
        </p>
      ) : null}
      {tasks.isPending ? (
        <div aria-hidden="true">
          <div className="task-skeleton" />
          <div className="task-skeleton" />
          <div className="task-skeleton" />
        </div>
      ) : null}
      {tasks.isError ? (
        <div className="waiting">
          <p className="error">{messages.todayFailed}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              void tasks.refetch();
            }}
          >
            {messages.retry}
          </button>
        </div>
      ) : null}
      {parts.overdue.length > 0 ? (
        <TaskGroup
          label={messages.overdueTitle}
          tasks={parts.overdue}
          locale={locale}
          overdue
          completeLabel={messages.completeLabel}
          repeatLabel={messages.repeatLink}
          moreLabel={messages.openDetail}
          untitled={messages.untitled}
          projectNames={projectNames}
          tagNames={tagNames}
          tagColors={tagColors}
          details={details}
          openTaskId={params.get('task')}
          onComplete={complete}
          onOpen={(id) => {
            const next = new URLSearchParams(params);
            next.set('task', id);
            setParams(next, { replace: true });
          }}
        />
      ) : null}
      {sections.map((section) => (
        <TaskGroup
          key={section.id}
          label={sectionLabel(group, section.id, messages, locale, projectNames, tagNames)}
          tasks={section.tasks}
          locale={locale}
          overdue={false}
          completeLabel={messages.completeLabel}
          repeatLabel={messages.repeatLink}
          moreLabel={messages.openDetail}
          untitled={messages.untitled}
          projectNames={projectNames}
          tagNames={tagNames}
          tagColors={tagColors}
          details={details}
          openTaskId={params.get('task')}
          onComplete={complete}
          onOpen={(id) => {
            const next = new URLSearchParams(params);
            next.set('task', id);
            setParams(next, { replace: true });
          }}
        />
      ))}
      <section>
        <h2>{messages.habitsToday}</h2>
        <ul className="task-list">
          {(habits.data?.items ?? [])
            .filter((habit) => !habit.archived)
            .map((habit) => (
              <li key={habit.id}>
                <div className="task-row">
                  <button
                    type="button"
                    className={
                      habit.today.count >= habit.goal.target_count
                        ? 'habit-check is-done'
                        : 'habit-check'
                    }
                    aria-label={messages.checkIn}
                    onClick={() => {
                      void api.checkInHabit(
                        habit.id,
                        { date: habit.today.date, count: habit.today.count + 1 },
                        crypto.randomUUID(),
                      );
                    }}
                  />
                  <Link className="task-title" to={`/habits/${habit.id}`}>
                    {habit.name}
                  </Link>
                  <span className="task-meta">
                    {habit.today.count}/{habit.goal.target_count}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      </section>
      {empty ? (
        <div className="waiting">
          <p>{messages.todayEmpty}</p>
          <div className="waiting-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                void navigate('/quick-add');
              }}
            >
              {messages.fab}
            </button>
            <Link className="text-button" to="/inbox">
              {messages.reviewInbox}
            </Link>
          </div>
        </div>
      ) : null}
      <UndoToastStack
        items={toasts}
        message={messages.completedToast}
        undoLabel={messages.undo}
        onUndo={undo}
        onExpire={expireToast}
      />
    </section>
  );
}

function TaskGroup({
  label,
  tasks,
  locale,
  overdue,
  completeLabel,
  repeatLabel,
  moreLabel,
  untitled,
  projectNames,
  tagNames,
  tagColors,
  details,
  openTaskId,
  onComplete,
  onOpen,
}: {
  readonly label: string;
  readonly tasks: readonly TodayTask[];
  readonly locale: string;
  readonly overdue: boolean;
  readonly completeLabel: string;
  readonly repeatLabel: string;
  readonly moreLabel: string;
  readonly untitled: string;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly tagNames: ReadonlyMap<string, string>;
  readonly tagColors: ReadonlyMap<string, string | null>;
  readonly details: boolean;
  readonly openTaskId: string | null;
  readonly onComplete: (task: TodayTask) => void;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <details className="task-group" open>
      <summary>
        <span>{label}</span>
        <span className="task-count">{tasks.length}</span>
      </summary>
      <ul className="task-list" data-details={details ? 'on' : 'off'}>
        {tasks.map((task) => {
          const selected = openTaskId === task.id;
          const listName = projectNames.get(task.projectId) ?? '';
          return (
            <li key={task.id}>
              <div
                className={selected ? 'task-row is-selected' : 'task-row'}
                data-selected={selected ? 'true' : undefined}
              >
                <GripVertical className="task-grip" size={12} aria-hidden="true" />
                <PriorityCheck
                  priority={task.priority}
                  label={fill(completeLabel, task.title)}
                  onChange={() => {
                    onComplete(task);
                  }}
                />
                <button
                  type="button"
                  className="task-title"
                  onClick={() => {
                    onOpen(task.id);
                  }}
                >
                  {task.title.trim().length === 0 ? untitled : task.title}
                </button>
                <span className="task-meta">
                  {task.tagIds.map((id) => (
                    <span key={id} className="ui-tag" style={tagStyle(tagColors.get(id) ?? null)}>
                      {tagNames.get(id) ?? id}
                    </span>
                  ))}
                  {listName.length > 0 ? <span className="task-list-name">{listName}</span> : null}
                  {task.dueDate !== null ? (
                    <time
                      className={overdue ? 'task-date is-overdue' : 'task-date'}
                      dateTime={task.dueDate}
                    >
                      {formatDueDate(task.dueDate, task.timeZone, locale)}
                    </time>
                  ) : null}
                  <Link className="task-list-name" to={`/repeat?task=${task.id}`}>
                    {repeatLabel}
                  </Link>
                </span>
                <button
                  type="button"
                  className="task-more"
                  aria-label={moreLabel}
                  onClick={() => {
                    onOpen(task.id);
                  }}
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function GroupOption({
  label,
  checked,
  onClick,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function colorOf(tag: object): string | null {
  if (!('color' in tag)) {
    return null;
  }
  return typeof tag.color === 'string' ? tag.color : null;
}

function tagStyle(color: string | null): CSSProperties | undefined {
  if (color === null || color.length === 0) {
    return undefined;
  }
  return { '--tag': color } as CSSProperties;
}

function sectionLabel(
  group: TaskGroupKey,
  id: string,
  messages: Messages,
  locale: string,
  projectNames: ReadonlyMap<string, string>,
  tagNames: ReadonlyMap<string, string>,
): string {
  if (group === 'priority') {
    switch (id) {
      case 'high':
        return messages.priorityHigh;
      case 'medium':
        return messages.priorityMedium;
      case 'low':
        return messages.priorityLow;
      default:
        return messages.priorityNone;
    }
  }
  if (id === 'none') {
    if (group === 'tag') {
      return messages.noTag;
    }
    if (group === 'list') {
      return messages.noList;
    }
    return messages.noDate;
  }
  if (group === 'due') {
    return formatDayId(id, locale);
  }
  if (group === 'list') {
    return projectNames.get(id) ?? messages.noList;
  }
  return tagNames.get(id) ?? id;
}

function readGroup(): string | null {
  try {
    return localStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
}

function writeGroup(value: TaskGroupKey): void {
  localStorage.setItem(GROUP_KEY, value);
}
