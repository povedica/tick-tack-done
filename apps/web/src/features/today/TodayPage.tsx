import { calendarDragPatch } from '@reflexionia/domain';
import { runAction } from '../../components/run-action';
import { displayTitle } from '../tasks/displayTitle';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Sprout } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api';
import type { CreateTaskBody } from '@reflexionia/sdk';
import { UndoToastStack } from '../../components/UndoToast';
import { ViewMenu } from '../../components/ViewMenu';
import { useActionToast } from '../../components/action-toast';
import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { warningText } from '../capture/components/CaptureSheet';
import { allDaySlot } from '../capture/calendar-slot';
import { openTaskComposer, useCaptureNotice } from '../capture/notice';
import { TodayPlanStrip, type DayLoadBody } from './TodayPlanStrip';
import { TodayHabits } from './TodayHabits';
import './today-support.css';
import { HABITS_DISMISS_KEY, habitsDismissed } from '../habits/dismiss';
import { flushOfflineQueue, newMutation, runOrQueue } from '../offline/client';
import { isTypingTarget } from '../../shell/shortcuts';
import { SidebarFoldButton } from '../../shell/SidebarFoldButton';
import { collectTags } from '../tasks/collect';
import { completeBody } from '../tasks/complete-body';
import { TaskComposer } from '../tasks/TaskComposer';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { closingRequest } from '../closing/api';
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
  groupFromLocation,
  groupTasks,
  mergeForGroup,
  parseSort,
  parseSortDir,
  partitionToday,
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
import { countdownsApi } from '../countdowns/api';
import { countdownLabel } from '../countdowns/presentation';
import { MatrixBoard, MatrixViewToggle } from '../matrix/MatrixBoard';
import { readMatrixLayout, writeMatrixLayout } from '../matrix/layout';
import { useFeatures } from '../settings/feature-flags';

const GROUP_KEY = 'tick-tack-done.today.group';
const SORT_KEY = 'tick-tack-done.today.sort';
const SORT_DIR_KEY = 'tick-tack-done.today.sortDir';
const COLLAPSE_KEY = 'tick-tack-done.today.collapsed';

export function TodayPage() {
  const messages = useMessages();
  const flags = useFeatures((state) => state.flags);
  const locale = useAppLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const notice = useCaptureNotice((state) => state.notice);
  const clearNotice = useCaptureNotice((state) => state.clear);
  const showToast = useActionToast((state) => state.show);
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
  useEffect(() => {
    if (!habitsHidden) return;
    const check = () => {
      setHabitsHidden(habitsDismissed(readStored(HABITS_DISMISS_KEY), Date.now()));
    };
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [habitsHidden]);
  const [matrixLayout, setMatrixLayout] = useState(() => {
    const requested = params.get('view');
    return requested === 'list' || requested === 'matrix' || requested === 'kanban'
      ? requested
      : readMatrixLayout('today');
  });
  useEffect(() => {
    const requested = params.get('view');
    if (
      (requested === 'list' || requested === 'matrix' || requested === 'kanban') &&
      requested !== matrixLayout
    )
      setMatrixLayout(requested);
  }, [params, matrixLayout]);
  const jobs = useRef(new Map<string, CompleteJob>());
  const leaveTimers = useRef(new Map<string, number>());
  const tasks = useQuery({
    queryKey: ['today-tasks'],
    queryFn: () => loadTodayTasks(tasksApi, new Date()),
    refetchOnWindowFocus: false,
  });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const profile = me.data as
    | {
        deadline_soon_days?: number;
        evening_start?: string | null;
      }
    | undefined;
  const showWhen = flags.when_deadline;
  const showLoad = flags.day_load;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZone = zone;
  const load = useQuery({
    queryKey: ['day-load', zone],
    enabled: showLoad,
    queryFn: () =>
      closingRequest<DayLoadBody>(
        `/api/v1/planning/load?date=${calendarDay(new Date().toISOString(), zone)}&time_zone=${encodeURIComponent(zone)}`,
        'GET',
      ),
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
  const countdowns = useQuery({
    queryKey: ['countdowns', 'today'],
    queryFn: () => countdownsApi.list(false, 7),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (params.get('disabled') !== '1') {
      return;
    }
    showToast(messages.featureOffNotice);
    const next = new URLSearchParams(params);
    next.delete('disabled');
    setParams(next, { replace: true });
  }, [messages.featureOffNotice, params, setParams, showToast]);

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
    runAction(queryClient.invalidateQueries({ queryKey: ['today-tasks'] }));
  }, [clearNotice, messages, notice, queryClient, showToast]);

  useEffect(() => {
    function onOnline(): void {
      runAction(
        flushOfflineQueue().then(() => {
          runAction(queryClient.invalidateQueries({ queryKey: ['today-tasks'] }));
        }),
      );
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
  const eveningTasks = parts.today.filter((task) => task.eveningOnly === true);
  const merged = mergeForGroup(
    {
      overdue: parts.overdue,
      today: parts.today.filter((task) => task.eveningOnly !== true),
    },
    group,
  );
  const sections = groupTasks(pinFirst(merged.grouped, pins), group, sort, sortDir);
  const overdueBlock =
    merged.overdue.length > 0 ? groupTasks(merged.overdue, 'none', sort, sortDir) : [];

  useEffect(() => {
    const want =
      location.hash === '#overdue' ||
      (typeof location.state === 'object' &&
        location.state !== null &&
        'scrollTo' in location.state &&
        (location.state as { scrollTo?: string }).scrollTo === 'overdue');
    if (!want) {
      return;
    }
    const timer = window.setTimeout(() => {
      document.getElementById('overdue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => {
      window.clearTimeout(timer);
    };
  }, [location.hash, location.state, overdueBlock.length]);

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
    runAction(api.patchTask(id, body).then(() => refreshTaskSurfaces(queryClient)));
  }

  function removeTask(id: string): void {
    runAction(
      api.deleteTask(id).then(() => {
        showToast(messages.movedToTrash, () => {
          runAction(api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient)));
        });
        runAction(refreshTaskSurfaces(queryClient));
      }),
    );
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
    setToasts((current) => pushUndo(current, { id: task.id, title: displayTitle(task.title) }));
    setActionError(null);
    const delay = completeLeaveMs(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const timer = window.setTimeout(() => {
      setHidden((current) => new Set(current).add(task.id));
      setLeaving((current) => dropId(current, task.id));
    }, delay);
    leaveTimers.current.set(task.id, timer);
    void runOrQueue(newMutation('complete', task.id, completeBody()), (key) =>
      tasksApi.completeTask(task.id, completeBody(), key),
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
          runAction(refreshTaskSurfaces(queryClient));
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
  const empty =
    !tasks.isPending && !tasks.isError && parts.overdue.length + parts.today.length === 0;
  const menuTask = (tasks.data ?? []).find((task) => task.id === menu?.id);

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
      moreLabel: messages.moreActions,
      untitled: messages.untitled,
      groupKind: overdueLabel ? 'due' : group,
      onCreate:
        matrixLayout === 'kanban'
          ? () => {
              openTaskComposer({
                text: '',
                slot: allDaySlot(calendarDay(new Date().toISOString(), zone), zone),
                defaultProjectId: inbox?.id,
                ...(group === 'priority' && ['high', 'medium', 'low', 'none'].includes(sectionId)
                  ? { priority: sectionId as 'high' | 'medium' | 'low' | 'none' }
                  : {}),
                ...(group === 'list' && projectNames.has(sectionId) ? { project: sectionId } : {}),
                ...(group === 'tag' && tagNames.has(sectionId) ? { tags: [sectionId] } : {}),
              });
            }
          : undefined,
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
      deadlineSoonDays: profile?.deadline_soon_days ?? 2,
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
      onColumnDrop:
        matrixLayout === 'kanban' && group !== 'none' && group !== 'priority'
          ? (taskId: string) => {
              const task = tasks.data?.find((task) => task.id === taskId);
              if (!task) return;
              if (group === 'list' && projectNames.has(sectionId))
                runAction(
                  api
                    .moveTask(taskId, sectionId, null)
                    .then(() => refreshTaskSurfaces(queryClient)),
                );
              if (group === 'tag')
                patchTask(taskId, {
                  tag_ids:
                    sectionId === 'none'
                      ? []
                      : [
                          sectionId,
                          ...task.tagIds.filter((id) => id !== sectionId && id !== task.tagIds[0]),
                        ],
                });
              if (group === 'due') {
                if (sectionId === 'none') patchTask(taskId, { due_date: null, start_date: null });
                else {
                  const day = overdueLabel
                    ? shiftDayKey(calendarDay(new Date().toISOString(), task.timeZone), -1)
                    : sectionId;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(day))
                    patchTask(
                      taskId,
                      calendarDragPatch(
                        {
                          due_date: task.dueDate,
                          start_date: task.startDate ?? null,
                          duration_minutes: task.durationMinutes ?? null,
                          is_all_day: task.allDay,
                        },
                        { day, preserveClock: true },
                        task.timeZone,
                      ),
                    );
                }
              }
            }
          : undefined,
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
          <SidebarFoldButton />
          <div>
            <h1 id="today-heading">{messages.todayTitle}</h1>
            <p className="today-date">{dateLabel}</p>
          </div>
        </div>
        <div className="page-actions">
          <MatrixViewToggle
            showMatrix={flags.matrix}
            value={matrixLayout}
            onChange={(next) => {
              writeMatrixLayout('today', next);
              setMatrixLayout(next);
              const query = new URLSearchParams(params);
              query.set('view', next);
              setParams(query, { replace: true });
            }}
          />
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
      {matrixLayout !== 'kanban' ? (
        <TaskComposer inputRef={addRef} viewDay="today" defaultProjectId={inbox?.id} />
      ) : null}
      <TodayPlanStrip
        load={load.isSuccess ? load.data : undefined}
        loading={load.isPending && showLoad}
        showLoad={showLoad}
      />
      {countdowns.data?.items
        .filter((item) => item.kind === 'today' && item.showInSmartList)
        .map((item) => (
          <Link key={item.id} className="countdown-today" to="/countdowns">
            <span aria-hidden="true">{item.emoji ?? '⏳'}</span>
            <span>
              <strong>{item.title}</strong>
              <small>{messages.countdownIsToday}</small>
            </span>
          </Link>
        ))}
      {actionError !== null ? (
        <p className="error" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className={matrixLayout === 'kanban' ? 'today-layout is-kanban' : 'today-layout'}>
        <div className="today-task-groups">
          {flags.matrix && matrixLayout === 'matrix' ? (
            <MatrixBoard scope={{ kind: 'today' }} embedded />
          ) : (
            <>
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
                      runAction(tasks.refetch());
                    }}
                  >
                    {messages.retry}
                  </button>
                </div>
              ) : null}
              {overdueBlock.length > 0 ? (
                <div id="overdue">
                  {overdueBlock.map((section) => (
                    <TaskGroup key="overdue" {...groupProps(section.id, section.tasks, true)} />
                  ))}
                </div>
              ) : (
                <div id="overdue" hidden />
              )}
              {(matrixLayout === 'kanban' && group === 'priority'
                ? ['high', 'medium', 'low', 'none'].map((id) => ({
                    id,
                    tasks: sections.find((section) => section.id === id)?.tasks ?? [],
                  }))
                : sections
              ).map((section) => (
                <TaskGroup key={section.id} {...groupProps(section.id, section.tasks)} />
              ))}
              {showWhen && eveningTasks.length > 0 ? (
                <section className="plan">
                  <h2>{messages.eveningTitle}</h2>
                  <p>{messages.eveningHint.replace('18:00', profile?.evening_start ?? '18:00')}</p>
                  <TaskGroup {...groupProps('evening', eveningTasks)} />
                </section>
              ) : null}
            </>
          )}
        </div>
        <aside className="today-habits-column" hidden={habitsHidden}>
          {habits.isPending ? (
            <div aria-hidden="true">
              <div className="task-skeleton" />
              <div className="task-skeleton" />
            </div>
          ) : null}
          {habits.isSuccess ? (
            <TodayHabits
              habits={habits.data.items}
              hidden={habitsHidden}
              collapsed={collapsed.has('habits')}
              onToggle={(open) => {
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (open) next.delete('habits');
                  else next.add('habits');
                  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
                  return next;
                });
              }}
              onDismiss={() => {
                localStorage.setItem(HABITS_DISMISS_KEY, String(Date.now()));
                setHabitsHidden(true);
              }}
            />
          ) : habits.isError ? (
            <p className="today-habit-error" role="alert">
              {messages.todayHabitLoadError}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  runAction(habits.refetch());
                }}
              >
                {messages.retry}
              </button>
            </p>
          ) : null}
        </aside>
      </div>
      {(countdowns.data?.items.length ?? 0) > 0 ? (
        <section className="countdown-upcoming">
          <h2>{messages.upcomingDates}</h2>
          <ul>
            {countdowns.data?.items
              .filter((item) => item.kind !== 'today')
              .map((item) => (
                <li key={item.id}>
                  <Link to="/countdowns">
                    {item.emoji ?? '⏳'} {item.title}
                  </Link>
                  <span>{countdownLabel(item.kind, item.days, item.effectiveDate)}</span>
                </li>
              ))}
          </ul>
        </section>
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
              runAction(
                Promise.all(
                  [...selected].map((id) =>
                    runOrQueue(newMutation('complete', id, completeBody()), (key) =>
                      tasksApi.completeTask(id, completeBody(), key),
                    ),
                  ),
                ).then(() => {
                  setSelected(new Set());
                  return refreshTaskSurfaces(queryClient);
                }),
              );
            }}
          >
            {messages.completeLabel.replace(' «{name}»', '')}
          </button>
          <button
            type="button"
            onClick={() => {
              runAction(
                api.batchTasks({ action: 'delete', ids: [...selected] }).then(() => {
                  setSelected(new Set());
                  return refreshTaskSurfaces(queryClient);
                }),
              );
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
            runAction(
              api.createTask(
                {
                  title: messages.subtaskTitle,
                  project_id: menuTask.projectId,
                  parent_id: menuTask.id,
                } as unknown as CreateTaskBody,
                crypto.randomUUID(),
              ),
            );
          }}
          onPin={() => {
            const next = togglePin(pins, menuTask.id);
            setPins(next);
            localStorage.setItem(PIN_KEY, JSON.stringify(next));
          }}
          onMove={(projectId) => {
            runAction(
              api.moveTask(menuTask.id, projectId).then(() => refreshTaskSurfaces(queryClient)),
            );
          }}
          onTags={() => {
            openTask(menuTask.id);
          }}
          onFocus={() => {
            runAction(api.startFocus({ task_id: menuTask.id }).then(() => navigate('/focus')));
          }}
          onDuplicate={() => {
            runAction(
              api
                .duplicateTask(menuTask.id, crypto.randomUUID())
                .then(() => refreshTaskSurfaces(queryClient)),
            );
          }}
          onCopy={() => {
            runAction(
              navigator.clipboard.writeText(`${window.location.origin}/task/${menuTask.id}`),
            );
          }}
          onConvert={() => {
            patchTask(menuTask.id, { kind: 'note' });
          }}
          {...(showWhen
            ? {
                onSomeday: () => {
                  patchTask(menuTask.id, {
                    someday: !menuTask.isSomeday,
                    ...(menuTask.isSomeday ? {} : { start_date: null }),
                  } as Parameters<typeof api.patchTask>[1]);
                },
                onEvening: () => {
                  const today = calendarDay(new Date().toISOString(), timeZone);
                  const start = zonedWallTime(today, 0, 0, timeZone);
                  patchTask(menuTask.id, {
                    evening_only: menuTask.eveningOnly !== true,
                    ...(start === null ? {} : { start_date: start, is_all_day: true }),
                  } as Parameters<typeof api.patchTask>[1]);
                },
              }
            : {})}
          onWontDo={() => {
            runAction(api.cancelTask(menuTask.id).then(() => refreshTaskSurfaces(queryClient)));
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
