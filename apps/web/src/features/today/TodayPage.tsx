import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { UndoToastStack } from '../../components/UndoToast';
import { fill, messagesFor, type Messages } from '../../i18n';
import { warningText } from '../capture/components/CaptureSheet';
import { useCaptureNotice } from '../capture/notice';
import { isTypingTarget } from '../../shell/shortcuts';
import { tasksApi } from './api';
import { loadTodayTasks } from './board';
import { requestUndo, settleComplete, pushUndo, type CompleteJob } from './completion';
import {
  formatDayId,
  formatDueDate,
  groupFromLocation,
  groupTasks,
  parseGroup,
  partitionToday,
  visibleTasks,
  type TaskGroupKey,
  type TodayTask,
} from './groups';
import './today.css';

const GROUP_KEY = 'tick-tack-done.today.group';

export function TodayPage() {
  const messages = messagesFor(navigator.language);
  const locale = navigator.language;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notice = useCaptureNotice((state) => state.notice);
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
  const projectNames = new Map(
    (projects.data?.items ?? []).map((project) => [project.id, project.name]),
  );
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [toasts, setToasts] = useState<readonly { id: string; title: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
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
    void tasksApi
      .completeTask(task.id, {}, crypto.randomUUID())
      .then(async () => {
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

  const shown = visibleTasks(tasks.data ?? [], hidden);
  const parts = partitionToday(shown, new Date());
  const sections = groupTasks(parts.today, group);
  const empty =
    !tasks.isPending && !tasks.isError && parts.overdue.length + parts.today.length === 0;

  return (
    <section className="today" aria-labelledby="today-heading">
      <header className="today-header">
        <div className="today-heading">
          <h1 id="today-heading">{messages.todayTitle}</h1>
          <p className="today-date">{dateLabel}</p>
        </div>
        <label className="group-field">
          {messages.groupLabel}
          <select
            value={group}
            onChange={(event) => {
              chooseGroup(parseGroup(event.target.value));
            }}
          >
            <option value="priority">{messages.groupPriority}</option>
            <option value="due">{messages.groupDue}</option>
            <option value="tag">{messages.groupTag}</option>
            <option value="list">{messages.groupList}</option>
          </select>
        </label>
      </header>
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
      {actionError !== null ? <p className="error">{actionError}</p> : null}
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
      {!tasks.isPending && !tasks.isError ? (
        <button
          type="button"
          className="add-task"
          onClick={() => {
            void navigate('/quick-add');
          }}
        >
          <Plus size={16} aria-hidden="true" />
          <span>{messages.addTask}</span>
        </button>
      ) : null}
      {parts.overdue.length > 0 ? (
        <TaskGroup
          label={messages.overdueTitle}
          tasks={parts.overdue}
          locale={locale}
          projectNames={projectNames}
          overdue
          completeLabel={messages.completeLabel}
          onComplete={complete}
        />
      ) : null}
      {sections.map((section) => (
        <TaskGroup
          key={section.id}
          label={sectionLabel(group, section.id, messages, locale, projectNames)}
          tasks={section.tasks}
          locale={locale}
          projectNames={projectNames}
          overdue={false}
          completeLabel={messages.completeLabel}
          onComplete={complete}
        />
      ))}
      {empty ? (
        <div className="waiting">
          <p>{messages.todayEmpty}</p>
          <div className="waiting-actions">
            <button
              type="button"
              className="sidebar-capture"
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
  projectNames,
  overdue,
  completeLabel,
  onComplete,
}: {
  readonly label: string;
  readonly tasks: readonly TodayTask[];
  readonly locale: string;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly overdue: boolean;
  readonly completeLabel: string;
  readonly onComplete: (task: TodayTask) => void;
}) {
  return (
    <details className="task-group" open>
      <summary>
        <span className="task-group-title">
          <span className="task-group-name">{label}</span>
          <span className="task-count">{tasks.length}</span>
        </span>
      </summary>
      <ul className="task-list">
        {tasks.map((task) => {
          const listName = projectNames.get(task.projectId);
          return (
            <li key={task.id}>
              <div className="task-row">
                <label className="task-check-hit">
                  <input
                    type="checkbox"
                    className={`task-check prio-${task.priority}`}
                    aria-label={fill(completeLabel, task.title)}
                    onChange={() => {
                      onComplete(task);
                    }}
                  />
                </label>
                <span className="task-title">{task.title}</span>
                <span className="task-meta">
                  {listName !== undefined ? (
                    <span className="task-list-name">{listName}</span>
                  ) : null}
                  {task.dueDate !== null ? (
                    <time
                      className={overdue ? 'task-date is-overdue' : 'task-date'}
                      dateTime={task.dueDate}
                    >
                      {formatDueDate(task.dueDate, task.timeZone, locale)}
                    </time>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function sectionLabel(
  group: TaskGroupKey,
  id: string,
  messages: Messages,
  locale: string,
  projectNames: ReadonlyMap<string, string>,
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
  return id;
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
