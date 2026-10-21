import { runAction } from '../../components/run-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useMessages } from '../../i18n';
import { collectProjects } from '../tasks/collect';
import { tickyApi, type TickyAuthority } from './api';

export function TickySettings() {
  const messages = useMessages();
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
      <summary>{messages.tickyPermsSummary}</summary>
      {authority.isError || projects.isError ? (
        <p role="alert">{messages.tickyPermsLoadFailed}</p>
      ) : null}
      {authority.data === undefined || projects.data === undefined ? (
        <p>{messages.tickyPermsLoading}</p>
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
  const messages = useMessages();
  const queryClient = useQueryClient();
  const [lists, setLists] = useState(authority.list_ids);
  const [scopes, setScopes] = useState(authority.action_scopes);
  const [autonomy, setAutonomy] = useState(authority.autonomy);
  const [inbox, setInbox] = useState(authority.inbox_list_id ?? '');
  const [start, setStart] = useState(authority.workday_start ?? '');
  const [end, setEnd] = useState(authority.workday_end ?? '');
  const [notice, setNotice] = useState('');
  const permissions: Readonly<Record<string, string>> = {
    'tasks:create': messages.tickyScopeCreate,
    'tasks:update': messages.tickyScopeUpdate,
    'calendar:read': messages.tickyScopeCalendar,
    'ticky:routines:read': messages.tickyScopeRoutinesRead,
    'ticky:routines:write': messages.tickyScopeRoutinesWrite,
  };
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
      setNotice(messages.tickyPermsSaved);
      runAction(queryClient.invalidateQueries({ queryKey: ['ticky'] }));
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
      <p>{messages.tickyPermsIntro}</p>
      <label>
        {messages.tickyAutonomy}{' '}
        <select
          value={autonomy}
          disabled={save.isPending}
          onChange={(event) => {
            setAutonomy(Number(event.target.value));
          }}
        >
          <option value={0}>{messages.tickyAutonomy0}</option>
          <option value={1}>{messages.tickyAutonomy1}</option>
          <option value={2}>{messages.tickyAutonomy2}</option>
        </select>
      </label>
      <fieldset disabled={save.isPending}>
        <legend>{messages.tickyAllowedLists}</legend>
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
        {messages.tickyInboxCapture}{' '}
        <select
          value={inbox}
          disabled={save.isPending}
          onChange={(event) => {
            setInbox(event.target.value);
          }}
        >
          <option value="">{messages.tickyInboxNone}</option>
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
        <legend>{messages.tickyExplicitPerms}</legend>
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
      <p>{messages.tickyCapacityHint}</p>
      <label>
        {messages.tickyWorkStart}{' '}
        <input
          type="time"
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
          }}
        />
      </label>
      <label>
        {messages.tickyWorkEnd}{' '}
        <input
          type="time"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
          }}
        />
      </label>
      <button type="submit" disabled={save.isPending}>
        {messages.tickySavePerms}
      </button>
      <div className="ticky-actions">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate({ paused: !authority.paused });
          }}
        >
          {authority.paused ? messages.tickyResume : messages.tickyPause}
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate({ revoked: !authority.revoked });
          }}
        >
          {authority.revoked ? messages.tickyRestoreAuth : messages.tickyRevoke}
        </button>
      </div>
      <p role="status">{notice}</p>
    </form>
  );
}
