import type { CreateTokenBody } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMessages, type Messages } from '../../../i18n';
import { tokensApi } from '../api';

type Scope = CreateTokenBody['scopes'][number];

function actionLabel(messages: Messages, action: string): string {
  switch (action) {
    case 'created':
      return messages.actionCreated;
    case 'updated':
      return messages.actionUpdated;
    case 'completed':
      return messages.actionCompleted;
    case 'deleted':
      return messages.actionDeleted;
    case 'assigned':
      return messages.actionAssigned;
    case 'commented':
      return messages.actionCommented;
    case 'accessed':
      return messages.actionAccessed;
    default:
      return action;
  }
}

function entityLabel(messages: Messages, entity: string): string {
  switch (entity) {
    case 'task':
      return messages.entityTask;
    case 'http_request':
      return messages.entityRequest;
    case 'personal_access_token':
      return messages.entityToken;
    default:
      return entity;
  }
}

const SCOPES: readonly { id: Scope; label: keyof Messages }[] = [
  { id: 'tasks:read', label: 'scopeTasksRead' },
  { id: 'tasks:write', label: 'scopeTasksWrite' },
  { id: 'lists:read', label: 'scopeListsRead' },
  { id: 'lists:write', label: 'scopeListsWrite' },
  { id: 'tags:read', label: 'scopeTagsRead' },
  { id: 'tags:write', label: 'scopeTagsWrite' },
  { id: 'filters:read', label: 'scopeFiltersRead' },
  { id: 'filters:write', label: 'scopeFiltersWrite' },
  { id: 'habits:read', label: 'scopeHabitsRead' },
  { id: 'habits:write', label: 'scopeHabitsWrite' },
  { id: 'focus:read', label: 'scopeFocusRead' },
  { id: 'focus:write', label: 'scopeFocusWrite' },
  { id: 'notes:read', label: 'scopeNotesRead' },
  { id: 'notes:write', label: 'scopeNotesWrite' },
  { id: 'calendar:read', label: 'scopeCalendarRead' },
  { id: 'calendar:write', label: 'scopeCalendarWrite' },
  { id: 'reminders:write', label: 'scopeRemindersWrite' },
  { id: 'webhooks:manage', label: 'scopeWebhooksManage' },
  { id: 'automations:manage', label: 'scopeAutomationsManage' },
  { id: 'profile:read', label: 'scopeProfileRead' },
  { id: 'profile:write', label: 'scopeProfileWrite' },
  { id: 'backup:read', label: 'scopeBackupRead' },
];

export function TokensPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => tokensApi.listTokens() });
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activity = useQuery({
    queryKey: ['token-activity', selected],
    enabled: selected !== null,
    queryFn: () => {
      if (selected === null) {
        throw new Error('token');
      }
      return tokensApi.tokenActivity(selected);
    },
  });
  const create = useMutation({
    mutationFn: () => tokensApi.createToken({ name: name.trim(), scopes }),
    onSuccess: async (created) => {
      setSecret(created.token);
      setSelected(created.id);
      setName('');
      setScopes([]);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: () => {
      setError(messages.tokenFailed);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => tokensApi.revokeToken(id),
    onSuccess: async () => {
      setSecret(null);
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: () => {
      setError(messages.tokenFailed);
    },
  });
  const items = tokens.data?.items ?? [];

  return (
    <main className="screen-page">
      <h1>{messages.tokensTitle}</h1>
      <p>{messages.tokensHint}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length === 0 || scopes.length === 0 || create.isPending) {
            return;
          }
          create.mutate();
        }}
      >
        <label>
          {messages.tokenName}
          <input
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <fieldset className="scope-list">
          <legend>{messages.tokenScopes}</legend>
          {SCOPES.map((scope) => (
            <label key={scope.id}>
              <input
                type="checkbox"
                checked={scopes.includes(scope.id)}
                onChange={() => {
                  setScopes((current) =>
                    current.includes(scope.id)
                      ? current.filter((item) => item !== scope.id)
                      : [...current, scope.id],
                  );
                }}
              />
              {messages[scope.label]}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={name.trim().length === 0 || scopes.length === 0 || create.isPending}
        >
          {create.isPending ? messages.tokenSaving : messages.tokenCreate}
        </button>
      </form>
      {error !== null ? <p role="alert">{error}</p> : null}
      {secret !== null ? (
        <p className="token-secret" role="status">
          {messages.tokenSecret}
          <br />
          <code>{secret}</code>
        </p>
      ) : null}
      {tokens.isSuccess && items.length === 0 ? <p>{messages.tokenEmpty}</p> : null}
      <ul className="token-list">
        {items.map((token) => (
          <li key={token.id}>
            <button
              type="button"
              onClick={() => {
                setSelected(token.id);
                setSecret(null);
              }}
            >
              {token.name}
            </button>
            <span>
              {token.token_prefix} ·{' '}
              {token.revoked_at !== null
                ? messages.tokenRevoked
                : token.last_used_at === null
                  ? messages.tokenNeverUsed
                  : `${messages.tokenLastUsed}: ${new Date(token.last_used_at).toLocaleString()}`}
            </span>
            {token.revoked_at === null ? (
              <button
                type="button"
                onClick={() => {
                  revoke.mutate(token.id);
                }}
              >
                {messages.tokenRevoke}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {selected !== null ? (
        <section>
          <h2>{messages.tokenActivity}</h2>
          {activity.isSuccess && activity.data.items.length === 0 ? (
            <p>{messages.tokenActivityEmpty}</p>
          ) : null}
          <ul>
            {(activity.data?.items ?? []).map((entry) => (
              <li key={entry.id}>
                {actionLabel(messages, entry.action)} · {entityLabel(messages, entry.entity_type)} ·{' '}
                {new Date(entry.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
