import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { collectProjects } from '../tasks/collect';
import { tickyApi, type TickyAuthority } from './api';

const permissions: Readonly<Record<string, string>> = {
  'tasks:create': 'Crear tareas tras mi aprobación',
  'tasks:update': 'Editar tareas tras mi aprobación',
  'calendar:read': 'Usar la ocupación de mi calendario',
  'ticky:routines:read': 'Consultar rutinas',
  'ticky:routines:write': 'Preparar y editar rutinas sin avisos',
};

export function TickySettings() {
  const [open, setOpen] = useState(false);
  const authority = useQuery({
    queryKey: ['ticky', 'authority'],
    queryFn: tickyApi.authority,
    enabled: open,
  });
  const projects = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: collectProjects,
    enabled: open,
  });
  return (
    <details
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>Permisos y preferencias</summary>
      {authority.isError || projects.isError ? (
        <p role="alert">No se han podido recuperar los permisos. No se han cambiado.</p>
      ) : null}
      {authority.data === undefined || projects.data === undefined ? (
        <p>Cargando permisos…</p>
      ) : (
        <SettingsForm
          authority={authority.data}
          projects={projects.data.items.filter((project) =>
            authority.data.owned_list_ids?.includes(project.id),
          )}
        />
      )}
    </details>
  );
}

function SettingsForm({
  authority,
  projects,
}: {
  readonly authority: TickyAuthority;
  readonly projects: readonly { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [lists, setLists] = useState(authority.list_ids);
  const [scopes, setScopes] = useState(authority.action_scopes);
  const [autonomy, setAutonomy] = useState(authority.autonomy);
  const [inbox, setInbox] = useState(authority.inbox_list_id ?? '');
  const [start, setStart] = useState(authority.workday_start ?? '');
  const [end, setEnd] = useState(authority.workday_end ?? '');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setLists(authority.list_ids);
    setScopes(authority.action_scopes);
    setAutonomy(authority.autonomy);
    setInbox(authority.inbox_list_id ?? '');
    setStart(authority.workday_start ?? '');
    setEnd(authority.workday_end ?? '');
  }, [authority.version]);
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => tickyApi.updateAuthority(patch),
    onSuccess: () => {
      setNotice('Permisos guardados.');
      void queryClient.invalidateQueries({ queryKey: ['ticky'] });
    },
    onError: (error: Error) => {
      setNotice(error.message);
    },
  });
  return (
    <form
      className="ticky-settings"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          list_ids: lists,
          autonomy,
          inbox_list_id: inbox || null,
          action_scopes: scopes,
          workday_start: start || null,
          workday_end: end || null,
        });
      }}
    >
      <p>Elige hasta diez listas propias. Los cambios de tareas siempre necesitan tu aprobación.</p>
      <label>
        Nivel de ayuda{' '}
        <select
          value={autonomy}
          disabled={save.isPending}
          onChange={(event) => {
            setAutonomy(Number(event.target.value));
          }}
        >
          <option value={0}>A0 · Desactivado</option>
          <option value={1}>A1 · Consultar</option>
          <option value={2}>A2 · Preparar propuestas</option>
        </select>
      </label>
      <fieldset disabled={save.isPending}>
        <legend>Listas permitidas</legend>
        {projects.map((project) => (
          <label key={project.id}>
            <input
              type="checkbox"
              checked={lists.includes(project.id)}
              disabled={lists.length >= 10 && !lists.includes(project.id)}
              onChange={(event) => {
                setLists((ids) =>
                  event.target.checked
                    ? [...ids, project.id]
                    : ids.filter((id) => id !== project.id),
                );
                if (!event.target.checked && inbox === project.id) setInbox('');
              }}
            />
            {project.name}
          </label>
        ))}
      </fieldset>
      <label>
        Bandeja para capturas{' '}
        <select
          value={inbox}
          disabled={save.isPending}
          onChange={(event) => {
            setInbox(event.target.value);
          }}
        >
          <option value="">Sin bandeja de captura</option>
          {projects
            .filter((project) => lists.includes(project.id))
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
      </label>
      <fieldset disabled={save.isPending}>
        <legend>Permisos explícitos</legend>
        {Object.entries(permissions)
          .filter(([scope]) => authority.fine_scopes.includes(scope))
          .map(([scope, label]) => (
            <label key={scope}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(event) => {
                  setScopes((ids) =>
                    event.target.checked ? [...ids, scope] : ids.filter((id) => id !== scope),
                  );
                }}
              />
              {label}
            </label>
          ))}
      </fieldset>
      <p>Sin una jornada y un calendario vigentes, la capacidad queda desconocida.</p>
      <label>
        Inicio de jornada{' '}
        <input
          type="time"
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
          }}
        />
      </label>
      <label>
        Fin de jornada{' '}
        <input
          type="time"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
          }}
        />
      </label>
      <button type="submit" disabled={save.isPending}>
        Guardar permisos
      </button>
      <div className="ticky-actions">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate({ paused: !authority.paused });
          }}
        >
          {authority.paused ? 'Reactivar Ticky' : 'Pausar Ticky'}
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate({ revoked: !authority.revoked });
          }}
        >
          {authority.revoked ? 'Restablecer autorización' : 'Revocar autorización'}
        </button>
      </div>
      <p role="status">{notice}</p>
    </form>
  );
}
