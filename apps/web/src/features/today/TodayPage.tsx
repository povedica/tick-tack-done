import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, ChevronDown, Lightbulb, Menu, Sprout } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api';
import type { CreateTaskBody } from '@reflexionia/sdk';
import { UndoToastStack } from '../../components/UndoToast';
import { ViewMenu } from '../../components/ViewMenu';
import { useActionToast } from '../../components/action-toast';
import { captureLanguage, fill, useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { warningText } from '../capture/components/CaptureSheet';
import { noticesFrom, openTaskComposer, useCaptureNotice } from '../capture/notice';
import { quickAddRequest } from '../capture/quick-add';
import { HabitsEmpty } from '../habits/components/HabitsEmpty';
import { HABITS_DISMISS_KEY, habitsDismissed } from '../habits/dismiss';
import { flushOfflineQueue, newMutation, runOrQueue } from '../offline/client';
import { isTypingTarget } from '../../shell/shortcuts';
import { useShellActions } from '../../shell/shell-actions';
import { collectTags } from '../tasks/collect';
import { QuickAddTools, type QuickPreview } from '../tasks/QuickAddTools';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { tasksApi } from './api';
import { loadTodayTasks } from './board';
import {
  completeLeaveMs,
  pushUndo,
  requestUndo,
  settleComplete,
  type CompleteJob,
} from './completion';
import {
  calendarDay,
  formatDayId,
  formatDueChip,
  groupFromLocation,
  groupTasks,
  mergeForGroup,
  parseSort,
  parseSortDir,
  partitionToday,
  planTaskIds,
  rangeIds,
  shiftDayKey,
  visibleTasks,
  zonedWallTime,
  type TaskGroupKey,
  type TaskSortDir,
  type TaskSortKey,
  type TodayTask,
} from './groups';
import { listCommand } from './list-keys';
import { PIN_KEY, readPins, togglePin } from './pins';
import { TaskContextMenu } from './TaskContextMenu';
import { TaskGroup } from './TaskGroup';

const GROUP_KEY = 'tick-tack-done.today.group';
const SORT_KEY = 'tick-tack-done.today.sort';
const SORT_DIR_KEY = 'tick-tack-done.today.sortDir';
const COLLAPSE_KEY = 'tick-tack-done.today.collapsed';
const PLAN_KEY = 'tick-tack-done.plan.accepted';

export function TodayPage() {
  const messages = useMessages();
  const shell = useShellActions();
  const locale = useAppLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notice = useCaptureNotice((state) => state.notice);
  const setNotice = useCaptureNotice((state) => state.setNotice);
  const clearNotice = useCaptureNotice((state) => state.clear);
  const showToast = useActionToast((state) => state.show);
  const [draft, setDraft] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const group = groupFromLocation(params.get('group'), readStored(GROUP_KEY));
  const [sort, setSort] = useState<TaskSortKey>(() => parseSort(readStored(SORT_KEY)));
  const [sortDir, setSortDir] = useState<TaskSortDir>(() => parseSortDir(readStored(SORT_DIR_KEY)));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(readList(COLLAPSE_KEY)),
  );
  const [pins, setPins] = useState<readonly string[]>(() => readPins(readStored(PIN_KEY)));
  const [groupOpen, setGroupOpen] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [toasts, setToasts] = useState<readonly { id: string; title: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [details, setDetails] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [habitsHidden, setHabitsHidden] = useState(() =>
    habitsDismissed(readStored(HABITS_DISMISS_KEY), Date.now()),
  );
  const [planAccepted, setPlanAccepted] = useState(
    () =>
      readStored(PLAN_KEY) ===
      calendarDay(new Date().toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const jobs = useRef(new Map<string, CompleteJob>());
  const leaveTimers = useRef(new Map<string, number>());
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
    queryFn: collectTags,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const habits = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.listHabits(),
    refetchOnWindowFocus: false,
  });
  const plan = useQuery({
    queryKey: ['review-daily'],
    queryFn: () => api.reviewDaily(),
    refetchOnWindowFocus: false,
  });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const preview = useMemo(
    () => buildPreview(draft, locale, timeZone, messages),
    [draft, locale, messages, timeZone],
  );

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const extra = notice.warnings.map((warning) => warningText(messages, warning)).join(' ');
    showToast(
      extra.length > 0
        ? `${messages.created}: ${notice.title}. ${extra}`
        : `${messages.created}: ${notice.title}`,
    );
    clearNotice();
    void queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
  }, [clearNotice, messages, notice, queryClient, showToast]);

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
      const timer = leaveTimers.current.get(id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        leaveTimers.current.delete(id);
      }
      setToasts((current) => current.filter((item) => item.id !== id));
      setLeaving((current) => dropId(current, id));
      setHidden((current) => dropId(current, id));
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
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey &&
        !isTypingTarget(event.target)
      ) {
        const latest = toasts.at(-1);
        if (latest !== undefined) {
          event.preventDefault();
          undoRef.current(latest.id);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toasts]);

  const tagNames = new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag.name]));
  const tagColors = new Map((tags.data?.items ?? []).map((tag) => [tag.id, colorOf(tag)]));
  const projectNames = new Map(
    (projects.data?.items ?? []).map((project) => [
      project.id,
      project.is_inbox ? messages.smartInbox : project.name,
    ]),
  );
  const shown = visibleTasks(tasks.data ?? [], hidden).filter((task) =>
    hideCompleted ? task.status !== 'completed' : true,
  );
  const parts = partitionToday(shown, new Date());
  const merged = mergeForGroup(parts, group);
  const sections = groupTasks(pinFirst(merged.grouped, pins), group, sort, sortDir);
  const overdueBlock =
    merged.overdue.length > 0 ? groupTasks(merged.overdue, 'none', sort, sortDir) : [];
  const flatIds = [
    ...overdueBlock.flatMap((section) => section.tasks.map((task) => task.id)),
    ...sections.flatMap((section) => section.tasks.map((task) => task.id)),
  ];
  const flatRef = useRef(flatIds);
  flatRef.current = flatIds;
  const focusRef = useRef(focusId);
  focusRef.current = focusId;

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) {
        return;
      }
      const command = listCommand(event);
      if (command === null) {
        return;
      }
      const ids = flatRef.current;
      if (ids.length === 0) {
        return;
      }
      const current = focusRef.current ?? ids[0] ?? null;
      if (current === null) {
        return;
      }
      event.preventDefault();
      if (command === 'up' || command === 'down') {
        const index = Math.max(0, ids.indexOf(current));
        const next =
          ids[command === 'up' ? Math.max(0, index - 1) : Math.min(ids.length - 1, index + 1)];
        if (next !== undefined) {
          setFocusId(next);
          document.querySelector<HTMLElement>(`[data-task-id="${next}"]`)?.focus();
        }
        return;
      }
      const task = (tasks.data ?? []).find((item) => item.id === current);
      if (task === undefined) {
        return;
      }
      if (command === 'open') {
        openTask(task.id);
      } else if (command === 'complete') {
        complete(task);
      } else if (command === 'toggle-select') {
        chooseSelect(task.id, 'toggle');
      } else if (command === 'delete') {
        removeTask(task.id);
      } else if (command === 'priority') {
        const order: TodayTask['priority'][] = ['high', 'medium', 'low', 'none'];
        const next = order[(order.indexOf(task.priority) + 1) % order.length] ?? 'none';
        patchTask(task.id, { priority: next });
      } else {
        setMenu({ id: task.id, x: 24, y: 120 });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [tasks.data]);

  function chooseGroup(value: TaskGroupKey): void {
    localStorage.setItem(GROUP_KEY, value);
    const next = new URLSearchParams(params);
    next.set('group', value);
    setParams(next, { replace: true });
    setGroupOpen(false);
  }

  function chooseSort(value: TaskSortKey): void {
    setSort(value);
    localStorage.setItem(SORT_KEY, value);
  }

  function chooseDir(value: TaskSortDir): void {
    setSortDir(value);
    localStorage.setItem(SORT_DIR_KEY, value);
  }

  function openTask(id: string): void {
    const next = new URLSearchParams(params);
    next.set('task', id);
    setParams(next, { replace: true });
  }

  function patchTask(id: string, body: Parameters<typeof api.patchTask>[1]): void {
    void api.patchTask(id, body).then(() => refreshTaskSurfaces(queryClient));
  }

  function removeTask(id: string): void {
    void api.deleteTask(id).then(() => {
      showToast(messages.movedToTrash, () => {
        void api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient));
      });
      void refreshTaskSurfaces(queryClient);
    });
  }

  function chooseSelect(id: string, mode: 'toggle' | 'range' | 'plain'): void {
    if (mode === 'range' && anchor !== null) {
      setSelected(new Set(rangeIds(flatIds, anchor, id)));
      return;
    }
    setAnchor(id);
    setSelected((current) => {
      const next = new Set(current);
      if (mode === 'plain') {
        return new Set([id]);
      }
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function complete(task: TodayTask): void {
    if (hidden.has(task.id) || leaving.has(task.id)) {
      return;
    }
    const job: CompleteJob = { phase: 'inflight' };
    jobs.current.set(task.id, job);
    setLeaving((current) => new Set(current).add(task.id));
    setToasts((current) => pushUndo(current, { id: task.id, title: task.title }));
    setActionError(null);
    const delay = completeLeaveMs(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const timer = window.setTimeout(() => {
      setHidden((current) => new Set(current).add(task.id));
      setLeaving((current) => dropId(current, task.id));
    }, delay);
    leaveTimers.current.set(task.id, timer);
    void runOrQueue(newMutation('complete', task.id, {}), (key) =>
      tasksApi.completeTask(task.id, {}, key),
    )
      .then(async ({ result }) => {
        if (result === null) {
          job.phase = 'done';
          return;
        }
        const outcome = await settleComplete(job, () =>
          tasksApi.uncompleteTask(task.id, crypto.randomUUID()),
        );
        if (outcome === 'reverted') {
          setHidden((current) => dropId(current, task.id));
          setLeaving((current) => dropId(current, task.id));
        } else {
          void refreshTaskSurfaces(queryClient);
        }
      })
      .catch(() => {
        if (job.phase === 'undo') {
          return;
        }
        setHidden((current) => dropId(current, task.id));
        setLeaving((current) => dropId(current, task.id));
        setToasts((current) => current.filter((item) => item.id !== task.id));
        setActionError(messages.completeFailed);
      });
  }

  const inbox = projects.data?.items.find((project) => project.is_inbox);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const activeHabits = (habits.data?.items ?? []).filter((habit) => !habit.archived);
  const planIds = planTaskIds(plan.data);
  const accepted = planAccepted;
  const planTasks = (tasks.data ?? []).filter((task) => planIds.includes(task.id)).slice(0, 5);
  const empty =
    !tasks.isPending && !tasks.isError && parts.overdue.length + parts.today.length === 0;
  const menuTask = (tasks.data ?? []).find((task) => task.id === menu?.id);

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
    const due = request.dueDate ?? request.parsed.due?.date ?? null;
    queryClient.setQueryData<TodayTask[]>(['today-tasks'], (current) => [
      {
        id: tempId,
        title: request.parsed.title.length > 0 ? request.parsed.title : title,
        priority: request.parsed.priority ?? 'none',
        dueDate: due,
        timeZone,
        allDay: request.parsed.due?.isAllDay ?? due !== null,
        hasReminder: request.parsed.reminderTrigger !== null,
        checklistDone: 0,
        checklistTotal: 0,
        hasContent: false,
        hasRepeat: request.parsed.repeatRule !== null,
        attachmentCount: 0,
        source: 'manual',
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

  function groupProps(sectionId: string, rows: readonly TodayTask[], overdueLabel = false) {
    return {
      id: overdueLabel ? 'overdue' : sectionId,
      label: overdueLabel
        ? messages.overdueTitle
        : sectionLabel(group, sectionId, messages, locale, projectNames, tagNames),
      tasks: rows,
      locale,
      todayLabel: messages.dateToday,
      tomorrowLabel: messages.dateTomorrow,
      completeLabel: messages.completeLabel,
      moreLabel: messages.openDetail,
      untitled: messages.untitled,
      groupKind: overdueLabel ? 'due' : group,
      collapsed: collapsed.has(overdueLabel ? 'overdue' : sectionId),
      selected,
      leaving,
      pinned: new Set(pins),
      focusId,
      projectNames,
      tagNames,
      tagColors,
      details,
      openTaskId: params.get('task'),
      onToggle: (id: string, open: boolean) => {
        setCollapsed((current) => {
          const next = new Set(current);
          if (open) {
            next.delete(id);
          } else {
            next.add(id);
          }
          localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
          return next;
        });
      },
      onComplete: complete,
      onOpen: openTask,
      onMore: (task: TodayTask, x: number, y: number) => {
        setMenu({ id: task.id, x, y });
      },
      onSelect: chooseSelect,
      onPriorityDrop: (taskId: string, priority: TodayTask['priority']) => {
        patchTask(taskId, { priority });
      },
      onFocus: setFocusId,
    };
  }

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
                <p className="popover-label">{messages.groupBy}</p>
                {(['priority', 'due', 'tag', 'list', 'none'] as const).map((value) => (
                  <GroupOption
                    key={value}
                    label={groupName(value, messages)}
                    checked={group === value}
                    onClick={() => {
                      chooseGroup(value);
                    }}
                  />
                ))}
                <p className="popover-label">{messages.sortBy}</p>
                {(['due', 'priority', 'title'] as const).map((value) => (
                  <GroupOption
                    key={value}
                    label={sortName(value, messages)}
                    checked={sort === value}
                    onClick={() => {
                      chooseSort(value);
                    }}
                  />
                ))}
                <GroupOption
                  label={messages.sortOldest}
                  checked={sortDir === 'asc'}
                  onClick={() => {
                    chooseDir('asc');
                  }}
                />
                <GroupOption
                  label={messages.sortNewest}
                  checked={sortDir === 'desc'}
                  onClick={() => {
                    chooseDir('desc');
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
            {(['priority', 'due', 'tag', 'list', 'none'] as const).map((value) => (
              <GroupOption
                key={value}
                label={groupName(value, messages)}
                checked={group === value}
                onClick={() => {
                  chooseGroup(value);
                }}
              />
            ))}
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
        <div className="quick-add-field">
          <div className="quick-add-mirror" aria-hidden="true">
            {highlight(draft)}
          </div>
          <input
            ref={addRef}
            name="title"
            value={draft}
            className={draft.length > 0 ? 'is-mirroring' : undefined}
            aria-label={messages.addTask}
            aria-describedby="quick-add-summary"
            placeholder={`+ ${fill(messages.addTaskTo, inbox?.is_inbox === true ? messages.smartInbox : (inbox?.name ?? messages.smartInbox))}`}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft('');
              }
            }}
          />
        </div>
        <p id="quick-add-summary" className="sr-only">
          {preview === null ? '' : fill(messages.quickAddSummary, preview.summary)}
        </p>
        <QuickAddTools
          draft={draft}
          preview={preview}
          onDraft={(value) => {
            setDraft(value);
            addRef.current?.focus();
          }}
        />
      </form>
      {planIds.length === 0 || accepted ? (
        <p className="plan-line">
          <Link to="/review">{messages.planMyDay}</Link>
        </p>
      ) : (
        <section className="plan">
          <h2>{messages.planTitle}</h2>
          <ul>
            {(planTasks.length > 0 ? planTasks : planIds.map((id) => ({ id, title: id }))).map(
              (item) => (
                <li key={item.id}>{item.title}</li>
              ),
            )}
          </ul>
          <button
            type="button"
            className="ui-button is-primary is-sm"
            onClick={() => {
              const day = calendarDay(new Date().toISOString(), timeZone);
              localStorage.setItem(PLAN_KEY, day);
              setPlanAccepted(true);
            }}
          >
            {messages.planAcceptToday}
          </button>
        </section>
      )}
      {actionError !== null ? (
        <p className="error" role="alert">
          {actionError}
        </p>
      ) : null}
      {tasks.isPending ? (
        <div aria-hidden="true">
          <div className="task-skeleton is-head" />
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
      {overdueBlock.map((section) => (
        <TaskGroup key="overdue" {...groupProps(section.id, section.tasks, true)} />
      ))}
      {sections.map((section) => (
        <TaskGroup key={section.id} {...groupProps(section.id, section.tasks)} />
      ))}
      {habits.isPending ? (
        <div aria-hidden="true">
          <div className="task-skeleton" />
          <div className="task-skeleton" />
        </div>
      ) : null}
      {!habits.isPending && activeHabits.length > 0 ? (
        <details className="task-group" open>
          <summary>
            <ChevronDown className="task-chevron" size={16} aria-hidden="true" />
            <span>{messages.habitGroup}</span>
            <span className="task-count">{activeHabits.length}</span>
          </summary>
          <ul className="task-list">
            {activeHabits.map((habit) => {
              const done = habit.today.count >= habit.goal.target_count;
              const width =
                habit.goal.target_count === 0
                  ? 0
                  : Math.min(100, Math.round((habit.today.count / habit.goal.target_count) * 100));
              return (
                <li key={habit.id}>
                  <div className="task-row">
                    <button
                      type="button"
                      className={done ? 'habit-check is-done' : 'habit-check'}
                      aria-label={messages.checkIn}
                      onClick={() => {
                        void api
                          .checkInHabit(
                            habit.id,
                            { date: habit.today.date, count: habit.today.count + 1 },
                            crypto.randomUUID(),
                          )
                          .then(() => queryClient.invalidateQueries({ queryKey: ['habits'] }));
                      }}
                    />
                    <Link className="task-title" to={`/habits/${habit.id}`}>
                      {habit.name}
                    </Link>
                    <span className="task-meta">
                      <span className="habit-progress" aria-hidden="true">
                        <i style={{ width: `${String(width)}%` }} />
                      </span>
                      {habit.today.count}/{habit.goal.target_count}
                      {habit.reminder_time !== null ? (
                        <time className="task-time">{habit.reminder_time}</time>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
      {!habits.isPending && activeHabits.length === 0 && !habitsHidden ? (
        <HabitsEmpty
          onCreate={(body) => {
            void api.createHabit(body, crypto.randomUUID()).then((created) => {
              showToast(messages.habitCreated, () => {
                void api.deleteHabit(created.id).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['habits'] });
                });
              });
              void queryClient.invalidateQueries({ queryKey: ['habits'] });
            });
          }}
          onOpen={() => {
            void navigate('/habits');
          }}
          onDismiss={() => {
            localStorage.setItem(HABITS_DISMISS_KEY, String(Date.now()));
            setHabitsHidden(true);
          }}
        />
      ) : null}
      {empty ? (
        <div className="waiting today-clear">
          <Sprout size={28} aria-hidden="true" />
          <h2>{messages.todayClearTitle}</h2>
          <p>{messages.todayClearBody}</p>
          <button
            type="button"
            className="ui-button is-primary is-md"
            onClick={() => {
              addRef.current?.focus();
              openTaskComposer();
            }}
          >
            {messages.addTask}
          </button>
        </div>
      ) : null}
      {selected.size > 0 ? (
        <div className="batch-bar" role="status">
          <span>{messages.batchSelected.replace('{count}', String(selected.size))}</span>
          <button
            type="button"
            onClick={() => {
              void api.batchTasks({ action: 'complete', ids: [...selected] }).then(() => {
                setSelected(new Set());
                return refreshTaskSurfaces(queryClient);
              });
            }}
          >
            {messages.completeLabel.replace(' «{name}»', '')}
          </button>
          <button
            type="button"
            onClick={() => {
              void api.batchTasks({ action: 'delete', ids: [...selected] }).then(() => {
                setSelected(new Set());
                return refreshTaskSurfaces(queryClient);
              });
            }}
          >
            {messages.batchDelete}
          </button>
        </div>
      ) : null}
      {menu !== null && menuTask !== undefined ? (
        <TaskContextMenu
          x={menu.x}
          y={menu.y}
          messages={messages}
          projects={(projects.data?.items ?? []).map((project) => ({
            id: project.id,
            name: project.is_inbox ? messages.smartInbox : project.name,
          }))}
          onClose={() => {
            setMenu(null);
          }}
          onDate={(preset) => {
            if (preset === 'none') {
              patchTask(menuTask.id, { due_date: null, is_all_day: true });
              return;
            }
            const today = calendarDay(new Date().toISOString(), timeZone);
            const offset = preset === 'today' ? 0 : preset === 'tomorrow' ? 1 : 7;
            const due = zonedWallTime(shiftDayKey(today, offset), 0, 0, timeZone);
            if (due !== null) {
              patchTask(menuTask.id, { due_date: due, is_all_day: true, time_zone: timeZone });
            }
          }}
          onPriority={(priority) => {
            patchTask(menuTask.id, { priority });
          }}
          onSubtask={() => {
            void api.createTask(
              {
                title: messages.subtaskTitle,
                project_id: menuTask.projectId,
                parent_id: menuTask.id,
              } as unknown as CreateTaskBody,
              crypto.randomUUID(),
            );
          }}
          onPin={() => {
            const next = togglePin(pins, menuTask.id);
            setPins(next);
            localStorage.setItem(PIN_KEY, JSON.stringify(next));
          }}
          onMove={(projectId) => {
            void api.moveTask(menuTask.id, projectId).then(() => refreshTaskSurfaces(queryClient));
          }}
          onTags={() => {
            openTask(menuTask.id);
          }}
          onFocus={() => {
            void api.startFocus({ task_id: menuTask.id }).then(() => navigate('/focus'));
          }}
          onDuplicate={() => {
            void api
              .duplicateTask(menuTask.id, crypto.randomUUID())
              .then(() => refreshTaskSurfaces(queryClient));
          }}
          onCopy={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/task/${menuTask.id}`);
          }}
          onConvert={() => {
            patchTask(menuTask.id, { kind: 'note' });
          }}
          onDelete={() => {
            removeTask(menuTask.id);
          }}
        />
      ) : null}
      <UndoToastStack
        items={toasts}
        message={messages.completedToast}
        undoLabel={`${messages.undo} · Ctrl/Cmd+Z`}
        onUndo={undo}
        onExpire={expireToast}
      />
    </section>
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
  if (!('color' in tag) || typeof tag.color !== 'string') {
    return null;
  }
  return tag.color;
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
  if (group === 'none') {
    return messages.allTasks;
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

function groupName(value: TaskGroupKey | TodayTask['priority'], messages: Messages): string {
  switch (value) {
    case 'priority':
    case 'high':
      return value === 'priority' ? messages.groupPriority : messages.priorityHigh;
    case 'due':
      return messages.groupDue;
    case 'tag':
      return messages.groupTag;
    case 'list':
      return messages.groupList;
    case 'none':
      return messages.groupNone;
    case 'medium':
      return messages.priorityMedium;
    case 'low':
      return messages.priorityLow;
    default:
      return messages.groupNone;
  }
}

function sortName(value: TaskSortKey, messages: Messages): string {
  if (value === 'priority') {
    return messages.sortPriority;
  }
  if (value === 'title') {
    return messages.sortTitle;
  }
  return messages.sortDate;
}

function buildPreview(
  draft: string,
  locale: string,
  timeZone: string,
  messages: Messages,
): QuickPreview | null {
  if (draft.trim().length === 0) {
    return null;
  }
  const request = quickAddRequest({
    text: draft,
    language: captureLanguage(locale),
    now: new Date().toISOString(),
    timeZone,
    viewDay: 'today',
  });
  const due = request.parsed.due?.date ?? request.dueDate;
  const chip =
    due === null
      ? null
      : formatDueChip(
          due,
          timeZone,
          request.parsed.due?.isAllDay ?? request.dueDate !== null,
          new Date(),
          locale,
          {
            empty: messages.noDate,
            today: messages.dateToday,
          },
        ).text;
  const parts = [
    chip,
    request.parsed.priority,
    ...request.parsed.tagNames,
    request.parsed.listName,
  ].filter((part): part is string => part !== null && part.length > 0);
  return {
    date: chip,
    priority: request.parsed.priority,
    tags: request.parsed.tagNames,
    summary: parts.join(', '),
  };
}

function highlight(text: string): string {
  return text;
}

function pinFirst(tasks: readonly TodayTask[], pins: readonly string[]): TodayTask[] {
  return [...tasks].sort(
    (left, right) => Number(pins.includes(right.id)) - Number(pins.includes(left.id)),
  );
}

function dropId(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!current.has(id)) {
    return current;
  }
  const next = new Set(current);
  next.delete(id);
  return next;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
