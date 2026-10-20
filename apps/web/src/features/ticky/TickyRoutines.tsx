import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { tickyApi, type TickyRoutine, type TickyRoutineDraft } from './api';

const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

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

function nextRun(value: string | null): string {
  if (value === null) return 'Sin próxima preparación';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horario pendiente de recalcular';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function issueText(issue: TickyRoutine['schedule_issue']): string | null {
  if (issue === 'ambiguous_local_time') return 'La hora coincide dos veces por el cambio horario.';
  if (issue === 'nonexistent_local_time') return 'La hora no existe por el cambio horario.';
  return null;
}

export function TickyRoutines() {
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
    setNotice('Rutina guardada en modo shadow. No se enviarán avisos.');
    void queryClient.invalidateQueries({ queryKey: ['ticky', 'routines'] });
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
        error.message.includes('409') || error.message.includes('cambió')
          ? 'La rutina cambió en otra sesión; hemos actualizado la lista. Revisa y vuelve a guardar.'
          : error.message,
      );
      void queryClient.invalidateQueries({ queryKey: ['ticky', 'routines'] });
    },
  });
  const pause = useMutation({
    mutationFn: tickyApi.pauseRoutine,
    onSuccess: () => {
      setNotice('Rutina pausada.');
      void queryClient.invalidateQueries({ queryKey: ['ticky', 'routines'] });
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
      <h2 id="ticky-routines-title">Rutinas</h2>
      <p>
        Las rutinas funcionan en modo shadow: preparan contenido interno y no envían notificaciones.
        La hora se interpreta en la zona elegida.
      </p>
      {routines.isPending || authority.isPending ? <p>Cargando rutinas…</p> : null}
      {routines.isError || authority.isError ? (
        <p role="alert">No se pudieron consultar las rutinas ni se ha cambiado su estado.</p>
      ) : null}
      {routines.data?.items.length === 0 ? <p>Aún no hay rutinas.</p> : null}
      <ul className="ticky-routine-list">
        {routines.data?.items.map((routine) => {
          const issue = issueText(routine.schedule_issue);
          return (
            <li key={routine.id} className="ticky-routine">
              <div>
                <strong>
                  {routine.kind === 'daily_plan' ? 'Plan diario' : 'Revisión semanal'}
                  {routine.kind === 'weekly_review' && routine.weekday !== null
                    ? ` · ${weekdays[routine.weekday] ?? ''}`
                    : ''}
                </strong>
                <p>
                  {hourValue(routine.local_hour)} · {routine.timezone} · ventana{' '}
                  {routine.window_minutes} min
                </p>
                <p>{routine.enabled ? nextRun(routine.next_at) : 'Pausada'}</p>
                {issue === null ? null : <p role="alert">{issue} Edita la hora para continuar.</p>}
                {routine.shadow ? <small>Modo shadow · sin avisos</small> : null}
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
                    Editar
                  </button>
                  {routine.enabled ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        pause.mutate(routine.id);
                      }}
                    >
                      Pausar
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
          <h3>{editing === null ? 'Crear rutina' : 'Editar rutina'}</h3>
          <label>
            Tipo{' '}
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
              <option value="daily_plan">Plan diario</option>
              <option value="weekly_review">Revisión semanal</option>
            </select>
          </label>
          {draft.kind === 'weekly_review' ? (
            <label>
              Día{' '}
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
            Hora local{' '}
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
            Zona horaria IANA{' '}
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
            Ventana para preparar (minutos){' '}
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
            Permitir preparación automática en modo shadow
          </label>
          <div className="ticky-actions">
            <button type="submit" disabled={saving || draft.timezone.trim().length === 0}>
              Guardar
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
                Cancelar edición
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
