import { Fragment, useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { playFocusSound } from './sounds';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { focusElapsedSeconds } from '@reflexionia/domain';
import { api } from '../../api';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { runAction } from '../../components/run-action';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { taskQueryHref } from '../../shell/use-open-task';
import { formatClock } from '../../shell/useActiveFocus';
import './focus.css';

const numeric = (value: unknown) => (typeof value === 'number' ? value : 0);
const string = (value: unknown) => (typeof value === 'string' ? value : '');
function rows(value: unknown): Record<string, unknown>[] {
  const items = (value as { items?: unknown } | undefined)?.items;
  return Array.isArray(items)
    ? items.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
    : [];
}

export function FocusPage() {
  const m = useMessages();
  const locale = useAppLocale();
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const zone = account.data?.time_zone ?? 'Europe/Madrid';
  const dayOf = (value: unknown) =>
    new Date(string(value)).toLocaleDateString(locale, { timeZone: zone });
  const timeOf = (value: unknown) =>
    new Date(string(value)).toLocaleTimeString(locale, {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
    });
  const location = useLocation();
  const cache = useQueryClient();
  const sessions = useInfiniteQuery({
    queryKey: ['focus-record'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.listFocusSessions(undefined, pageParam),
    getNextPageParam: (page) =>
      typeof page.next_cursor === 'string' ? page.next_cursor : undefined,
    refetchInterval: 1000,
  });
  const settings = useQuery({
    queryKey: ['focus-settings'],
    queryFn: () => api.getFocusSettings(),
    refetchInterval: 4000,
  });
  const stats = useQuery({ queryKey: ['focus-stats'], queryFn: () => api.focusStats() });
  const tasks = useQuery({ queryKey: ['focus-tasks'], queryFn: () => api.listTasks({}) });
  const [mode, setMode] = useState<'focus' | 'stopwatch'>('focus');
  const [editingDuration, setEditingDuration] = useState(false);
  const [preset, setPreset] = useState<number | null>(null);
  const [task, setTask] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const record = sessions.data?.pages.flatMap(rows) ?? [];
  const live = record.find(
    (row) =>
      row.ended_at === null &&
      (row.type === 'stopwatch' || row.paused_at != null || numeric(row.remaining_seconds) > 0),
  );
  const paused = typeof live?.paused_at === 'string';
  const stopwatch = live ? live.type === 'stopwatch' : mode === 'stopwatch';
  const planned = live
    ? numeric(live.planned_minutes)
    : (preset ?? (numeric(settings.data?.pomodoroMinutes) || 25));
  const elapsed = live
    ? focusElapsedSeconds({
        startedAt: string(live.started_at),
        now: new Date(now).toISOString(),
        pausedAt: paused ? string(live.paused_at) : null,
        pausedSeconds: numeric(live.paused_seconds),
      })
    : 0;
  const remaining = Math.max(0, planned * 60 - elapsed);
  const progress = !live || stopwatch ? 0 : Math.min(1, elapsed / (planned * 60));
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  const act = (operation: () => Promise<unknown>) => {
    setBusy(true);
    runAction(
      operation().finally(() => {
        setBusy(false);
        for (const key of [
          'focus-record',
          'focus-sessions',
          'focus-stats',
          'focus-settings',
          'stats',
        ])
          runAction(cache.invalidateQueries({ queryKey: [key] }));
      }),
    );
  };
  const start = (type = mode) => {
    act(() =>
      api.startFocus({
        type,
        ...(type === 'focus' ? { planned_minutes: planned } : {}),
        ...(task ? { task_id: task } : {}),
      }),
    );
  };
  const finish = () => {
    act(async () => {
      const result = await api.finishFocus(string(live?.id));
      playFocusSound(
        typeof settings.data?.alarmSound === 'string' ? settings.data.alarmSound : 'bell',
        typeof settings.data?.volume === 'number' ? settings.data.volume : 70,
      );
      const phase = result.next as { type?: string } | null;
      setNext(result.auto_started === true ? null : (phase?.type ?? null));
    });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (event.key.toLowerCase() === 'f' && !live) {
        event.preventDefault();
        setMode(mode === 'focus' ? 'stopwatch' : 'focus');
      }
      if (event.key === ' ' && !busy && !target?.closest('button, a, summary')) {
        event.preventDefault();
        if (!live) start();
        else
          act(() => (paused ? api.resumeFocus(string(live.id)) : api.pauseFocus(string(live.id))));
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  }, [live, mode, paused, planned, task, busy]);
  const timerLabel = stopwatch
    ? m.focusModeStopwatch
    : live?.type === 'short_break' || live?.type === 'long_break'
      ? m.focusStartBreak
      : m.focusTitle;
  const todayPomo = numeric(stats.data?.today_pomodoros);
  const cards = [
    [m.focusTodayPomo, todayPomo],
    [m.focusTodayFocus, `${String(Math.round(numeric(stats.data?.today_focus_seconds) / 60))} min`],
    [m.focusTotalPomo, numeric(stats.data?.completed_pomodoros)],
    [m.focusTotalDuration, `${String(Math.round(numeric(stats.data?.focus_seconds) / 60))} min`],
  ];
  if (sessions.isPending || settings.isPending) return <SkeletonRows />;
  if (sessions.isError || settings.isError)
    return (
      <ErrorState
        title={m.loadFailed}
        retryLabel={m.retry}
        onRetry={() => {
          runAction(sessions.refetch());
          runAction(settings.refetch());
        }}
      />
    );
  return (
    <section className="focus-page" tabIndex={-1}>
      <div className="focus-main">
        <header className="focus-header">
          <h1>{m.focusTitle}</h1>
          <div role="tablist" aria-label={m.focusTitle} className="focus-modes">
            {(['focus', 'stopwatch'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={(live?.type ?? mode) === value}
                disabled={!!live}
                onClick={() => {
                  setMode(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    setMode(value === 'focus' ? 'stopwatch' : 'focus');
                    (
                      event.currentTarget.parentElement?.querySelector(
                        `[aria-selected="false"]`,
                      ) as HTMLElement | null
                    )?.focus();
                  }
                }}
              >
                {value === 'focus' ? m.focusModePomo : m.focusModeStopwatch}
              </button>
            ))}
          </div>
          <Link
            className="focus-settings-link"
            to="/settings/focus"
            aria-label={m.focusSettingsTitle}
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
          {live ? (
            <Button
              variant="ghost"
              onClick={() => {
                setConfirm(true);
              }}
            >
              {m.cancel}
            </Button>
          ) : null}
        </header>
        <div className="focus-stage">
          <select
            aria-label={m.focusNoTask}
            value={string(live?.task_id) || task}
            disabled={!!live}
            onChange={(event) => {
              setTask(event.target.value);
            }}
          >
            <option value="">{m.focusNoTask}</option>
            {(tasks.data?.items ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
          <div className="focus-timer">
            <svg className="focus-timer-ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="54" />
              <circle
                cx="60"
                cy="60"
                r="54"
                style={{
                  strokeDasharray: String(2 * Math.PI * 54),
                  strokeDashoffset: String(2 * Math.PI * 54 * (1 - progress)),
                }}
              />
            </svg>
            <div className="focus-clock-wrap">
              <p className="focus-timer-clock" role="timer" aria-live="off">
                {!live && !stopwatch ? (
                  <button
                    className="focus-clock-edit"
                    type="button"
                    aria-label={m.focusEditDuration}
                    onClick={() => {
                      setEditingDuration((value) => !value);
                    }}
                  >
                    {formatClock(remaining)}
                  </button>
                ) : (
                  formatClock(stopwatch ? elapsed : remaining)
                )}
              </p>
              <small>{timerLabel}</small>
            </div>
          </div>
          {!live && !stopwatch && editingDuration ? (
            <div className="focus-quick-duration">
              <div className="focus-presets">
                {[15, 25, 45, 60].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={planned === value}
                    onClick={() => {
                      setPreset(value);
                      act(() =>
                        api.updateFocusSettings({ pomodoro_minutes: value }).then((saved) => {
                          cache.setQueryData(['focus-settings'], saved);
                          setPreset(null);
                        }),
                      );
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <label>
                {m.focusPomoDuration}
                <input
                  type="number"
                  min={5}
                  max={180}
                  step={5}
                  value={planned}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setPreset(value);
                    if (event.target.validity.valid)
                      act(() => api.updateFocusSettings({ pomodoro_minutes: value }));
                  }}
                />
              </label>
            </div>
          ) : null}
          <p className="focus-cycle-progress">
            {m.focusCycleProgress
              .replace(
                '{cycle}',
                String(
                  (numeric(stats.data?.completed_pomodoros) %
                    (numeric(settings.data.cyclesBeforeLongBreak) || 4)) +
                    1,
                ),
              )
              .replace('{total}', String(numeric(settings.data.cyclesBeforeLongBreak) || 4))
              .replace(
                '{remaining}',
                String(
                  (numeric(settings.data.cyclesBeforeLongBreak) || 4) -
                    (numeric(stats.data?.completed_pomodoros) %
                      (numeric(settings.data.cyclesBeforeLongBreak) || 4)),
                ),
              )}
          </p>
          <p className="focus-goal-progress">
            {m.focusGoalProgress
              .replace('{done}', String(todayPomo))
              .replace('{goal}', String(numeric(settings.data.dailyGoal) || 8))}
          </p>
          <div
            role="progressbar"
            aria-label={m.focusTitle}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="sr-only"
          />
          <div className="focus-actions">
            {live ? (
              <>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    act(() =>
                      paused ? api.resumeFocus(string(live.id)) : api.pauseFocus(string(live.id)),
                    );
                  }}
                >
                  {paused ? m.focusResume : m.focusPause}
                </Button>
                <Button disabled={busy} onClick={finish}>
                  {m.focusFinish}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  start();
                }}
              >
                {m.focusStart}
              </Button>
            )}
          </div>
          {confirm && live ? (
            <div role="alertdialog" aria-label={m.focusAbortConfirm}>
              <p>{m.focusAbortConfirm}</p>
              <Button
                autoFocus
                onClick={() => {
                  setConfirm(false);
                }}
              >
                {m.cancel}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setConfirm(false);
                  act(() => api.abortFocus(string(live.id)));
                }}
              >
                {m.confirm}
              </Button>
            </div>
          ) : null}
          {!live && next && next !== 'focus' ? (
            <div>
              <Button
                disabled={busy}
                onClick={() => {
                  act(() =>
                    api.startFocus({ type: next }).then(() => {
                      setNext(null);
                    }),
                  );
                }}
              >
                {m.focusStartBreak}
              </Button>
              <Button
                onClick={() => {
                  setNext(null);
                }}
              >
                {m.focusSkipBreak}
              </Button>
            </div>
          ) : null}
          <span className="sr-only" aria-live="polite">
            {live ? (paused ? m.focusPause : m.focusStart) : ''}
          </span>
        </div>
      </div>
      <aside className="focus-panel">
        <details open>
          <summary>{m.focusOverview}</summary>
          {stats.isPending ? (
            <SkeletonRows />
          ) : stats.isError ? (
            <ErrorState
              title={m.loadFailed}
              retryLabel={m.retry}
              onRetry={() => {
                runAction(stats.refetch());
              }}
            />
          ) : (
            <div className="focus-overview">
              {cards.map(([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
        </details>
        <details className="focus-record" open={window.matchMedia('(min-width: 1024px)').matches}>
          <summary>{m.focusRecord}</summary>
          {record.filter(
            (row) => row.ended_at !== null && (row.type === 'focus' || row.type === 'stopwatch'),
          ).length === 0 ? (
            <p className="ui-muted">{m.focusRecordEmpty}</p>
          ) : (
            record
              .filter(
                (row) =>
                  row.ended_at !== null && (row.type === 'focus' || row.type === 'stopwatch'),
              )
              .map((row, index, completedRows) => {
                const taskRow = row.task as { title?: string } | null;
                return (
                  <Fragment key={string(row.id)}>
                    {index === 0 ||
                    dayOf(completedRows[index - 1]?.started_at) !== dayOf(row.started_at) ? (
                      <h3 className="focus-record-day">{dayOf(row.started_at)}</h3>
                    ) : null}
                    <article className={row.completed ? '' : 'focus-aborted'}>
                      <time>
                        {timeOf(row.started_at)} – {timeOf(row.ended_at)}
                      </time>
                      <div>
                        {row.task_id ? (
                          <Link
                            to={taskQueryHref(
                              location.pathname,
                              location.search,
                              string(row.task_id),
                            )}
                          >
                            {taskRow?.title ?? m.focusNoTask}
                          </Link>
                        ) : (
                          m.focusNoTask
                        )}
                        <span>{Math.round(numeric(row.actual_seconds) / 60)} min</span>
                      </div>
                    </article>
                  </Fragment>
                );
              })
          )}
        </details>
        {sessions.hasNextPage ? (
          <Button
            disabled={sessions.isFetchingNextPage}
            onClick={() => {
              runAction(sessions.fetchNextPage());
            }}
          >
            {m.tokenLoadMore}
          </Button>
        ) : null}
      </aside>
    </section>
  );
}
