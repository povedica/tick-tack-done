import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { runAction } from '../../components/run-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { tickyApi, TickyApiError, type TickyRoutine, type TickyRoutineDraft } from './api';

function emptyDraft(): TickyRoutineDraft {
  return {
    kind: 'daily_plan',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
    local_hour: '09:00',
    enabled: false,
    window_minutes: 15,
  };
}

function hourValue(value: string): string {
  return value.slice(0, 5);
}

function nextRun(value: string | null, messages: Messages, locale: string): string {
  if (value === null) return messages.tickyNoNextRun;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return messages.tickySchedulePending;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function issueText(issue: TickyRoutine['schedule_issue'], messages: Messages): string | null {
  if (issue === 'ambiguous_local_time') return messages.tickyAmbiguousTime;
  if (issue === 'nonexistent_local_time') return messages.tickyNonexistentTime;
  return null;
}

export function TickyRoutines() {
  const messages = useMessages();
  const locale = useAppLocale();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 5 + i)),
    ),
  );
  const queryClient = useQueryClient();
  const routines = useQuery({ queryKey: ['ticky', 'routines'], queryFn: tickyApi.routines });
  const authority = useQuery({ queryKey: ['ticky', 'authority'], queryFn: tickyApi.authority });
  const [draft, setDraft] = useState<TickyRoutineDraft>(emptyDraft);
  const [editing, setEditing] = useState<TickyRoutine | null>(null);
  const [notice, setNotice] = useState('');
  const canWrite = authority.data?.action_scopes.includes('ticky:routines:write') === true;
  const finish = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setNotice(messages.tickyRoutineSaved);
    runAction(queryClient.invalidateQueries({ queryKey: ['ticky', 'routines'] }));
  };
  const create = useMutation({
    mutationFn: tickyApi.createRoutine,
    onSuccess: finish,
    onError: (error: Error) => {
      setNotice(error.message);
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      routine,
    }: {
      readonly id: string;
      readonly routine: TickyRoutineDraft & { expected_version: number };
    }) => tickyApi.updateRoutine(id, routine),
    onSuccess: finish,
    onError: (error: Error) => {
      setNotice(
        error instanceof TickyApiError && error.status === 409
          ? messages.tickyRoutineConflict
          : error.message,
      );
      runAction(queryClient.invalidateQueries({ queryKey: ['ticky', 'routines'] }));
    },
  });
  const pause = useMutation({
    mutationFn: tickyApi.pauseRoutine,
    onSuccess: () => {
      setNotice(messages.tickyRoutinePaused);
      runAction(queryClient.invalidateQueries({ queryKey: ['ticky', 'routines'] }));
    },
    onError: (error: Error) => {
      setNotice(error.message);
    },
  });
  const saving = create.isPending || update.isPending || pause.isPending;

  function editRoutine(routine: TickyRoutine) {
    setEditing(routine);
    setDraft({
      kind: routine.kind,
      timezone: routine.timezone,
      local_hour: hourValue(routine.local_hour),
      ...(routine.weekday === null ? {} : { weekday: routine.weekday }),
      enabled: routine.enabled,
      window_minutes: routine.window_minutes,
    });
    setNotice('');
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const body: TickyRoutineDraft = {
      kind: draft.kind,
      timezone: draft.timezone.trim(),
      local_hour: draft.local_hour,
      enabled: draft.enabled,
      window_minutes: draft.window_minutes,
      ...(draft.kind === 'weekly_review' ? { weekday: draft.weekday ?? 0 } : {}),
    };
    if (editing === null) create.mutate(body);
    else update.mutate({ id: editing.id, routine: { ...body, expected_version: editing.version } });
  }

  return (
    <section className="ticky-routines" aria-labelledby="ticky-routines-title">
      <h2 id="ticky-routines-title">{messages.tickyRoutines}</h2>
      <p>{messages.tickyRoutinesHint}</p>
      {routines.isPending || authority.isPending ? <p>{messages.tickyRoutinesLoading}</p> : null}
      {routines.isError || authority.isError ? (
        <p role="alert">{messages.tickyRoutinesFailed}</p>
      ) : null}
      {routines.data?.items.length === 0 ? <p>{messages.tickyRoutinesEmpty}</p> : null}
      <ul className="ticky-routine-list">
        {routines.data?.items.map((routine) => {
          const issue = issueText(routine.schedule_issue, messages);
          return (
            <li key={routine.id} className="ticky-routine">
              <div>
                <strong>
                  {routine.kind === 'daily_plan'
                    ? messages.tickyDailyPlan
                    : messages.tickyWeeklyReview}
                  {routine.kind === 'weekly_review' && routine.weekday !== null
                    ? ` · ${weekdays[routine.weekday] ?? ''}`
                    : ''}
                </strong>
                <p>
                  {hourValue(routine.local_hour)} · {routine.timezone} · {messages.tickyWindow}{' '}
                  {messages.tickyMinutes.replace('{name}', String(routine.window_minutes))}
                </p>
                <p>
                  {routine.enabled
                    ? nextRun(routine.next_at, messages, locale)
                    : messages.tickyPaused}
                </p>
                {issue === null ? null : (
                  <p role="alert">
                    {issue} {messages.tickyEditTime}
                  </p>
                )}
                {routine.shadow ? <small>{messages.tickyShadowMode}</small> : null}
              </div>
              {canWrite ? (
                <div className="ticky-actions">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      editRoutine(routine);
                    }}
                  >
                    {messages.tickyEdit}
                  </button>
                  {routine.enabled ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        pause.mutate(routine.id);
                      }}
                    >
                      {messages.tickyPauseRoutine}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <form className="ticky-routine-form" onSubmit={submit}>
          <h3>{editing === null ? messages.tickyCreateRoutine : messages.tickyEditRoutine}</h3>
          <label>
            {messages.tickyType}{' '}
            <select
              value={draft.kind}
              disabled={saving}
              onChange={(event) => {
                setDraft((value) => ({
                  ...value,
                  kind: event.target.value as TickyRoutineDraft['kind'],
                }));
              }}
            >
              <option value="daily_plan">{messages.tickyDailyPlan}</option>
              <option value="weekly_review">{messages.tickyWeeklyReview}</option>
            </select>
          </label>
          {draft.kind === 'weekly_review' ? (
            <label>
              {messages.tickyDay}{' '}
              <select
                value={draft.weekday ?? 0}
                disabled={saving}
                onChange={(event) => {
                  setDraft((value) => ({ ...value, weekday: Number(event.target.value) }));
                }}
              >
                {weekdays.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            {messages.tickyLocalTime}{' '}
            <input
              type="time"
              required
              value={draft.local_hour}
              disabled={saving}
              onChange={(event) => {
                setDraft((value) => ({ ...value, local_hour: event.target.value }));
              }}
            />
          </label>
          <label>
            {messages.tickyTimeZone}{' '}
            <input
              type="text"
              required
              maxLength={64}
              value={draft.timezone}
              disabled={saving}
              onChange={(event) => {
                setDraft((value) => ({ ...value, timezone: event.target.value }));
              }}
            />
          </label>
          <label>
            {messages.tickyPrepareWindow}{' '}
            <input
              type="number"
              required
              min={1}
              max={1440}
              value={draft.window_minutes}
              disabled={saving}
              onChange={(event) => {
                setDraft((value) => ({ ...value, window_minutes: Number(event.target.value) }));
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={saving}
              onChange={(event) => {
                setDraft((value) => ({ ...value, enabled: event.target.checked }));
              }}
            />
            {messages.tickyAutoPrepare}
          </label>
          <div className="ticky-actions">
            <button type="submit" disabled={saving || draft.timezone.trim().length === 0}>
              {messages.tickySave}
            </button>
            {editing !== null ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setDraft(emptyDraft());
                  setNotice('');
                }}
              >
                {messages.tickyCancelEdit}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
