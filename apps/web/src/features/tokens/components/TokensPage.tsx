import type { CreateTokenBody } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { Button, SkeletonRows } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { tokensApi } from '../api';

type Scope = CreateTokenBody['scopes'][number];

interface ScopeChoice {
  readonly id: Scope;
  readonly label: keyof Messages;
}

interface ScopeGroup {
  readonly name: keyof Messages;
  readonly choices: readonly ScopeChoice[];
}

const GROUPS: readonly ScopeGroup[] = [
  {
    name: 'tokenGroupTasks',
    choices: [
      { id: 'tasks:read', label: 'scopeRead' },
      { id: 'tasks:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupLists',
    choices: [
      { id: 'lists:read', label: 'scopeRead' },
      { id: 'lists:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupTags',
    choices: [
      { id: 'tags:read', label: 'scopeRead' },
      { id: 'tags:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupFilters',
    choices: [
      { id: 'filters:read', label: 'scopeRead' },
      { id: 'filters:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupHabits',
    choices: [
      { id: 'habits:read', label: 'scopeRead' },
      { id: 'habits:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupFocus',
    choices: [
      { id: 'focus:read', label: 'scopeRead' },
      { id: 'focus:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupNotes',
    choices: [
      { id: 'notes:read', label: 'scopeRead' },
      { id: 'notes:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupCalendar',
    choices: [
      { id: 'calendar:read', label: 'scopeRead' },
      { id: 'calendar:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupReminders',
    choices: [{ id: 'reminders:write', label: 'scopeWrite' }],
  },
  {
    name: 'tokenGroupWebhooks',
    choices: [{ id: 'webhooks:manage', label: 'scopeManage' }],
  },
  {
    name: 'tokenGroupAutomations',
    choices: [{ id: 'automations:manage', label: 'scopeManage' }],
  },
  {
    name: 'tokenGroupProfile',
    choices: [
      { id: 'profile:read', label: 'scopeRead' },
      { id: 'profile:write', label: 'scopeWrite' },
    ],
  },
  {
    name: 'tokenGroupBackup',
    choices: [{ id: 'backup:read', label: 'scopeRead' }],
  },
];

const SCOPE_LABEL: Record<string, keyof Messages> = {
  'tasks:read': 'scopeTasksRead',
  'tasks:write': 'scopeTasksWrite',
  'lists:read': 'scopeListsRead',
  'lists:write': 'scopeListsWrite',
  'tags:read': 'scopeTagsRead',
  'tags:write': 'scopeTagsWrite',
  'filters:read': 'scopeFiltersRead',
  'filters:write': 'scopeFiltersWrite',
  'habits:read': 'scopeHabitsRead',
  'habits:write': 'scopeHabitsWrite',
  'focus:read': 'scopeFocusRead',
  'focus:write': 'scopeFocusWrite',
  'notes:read': 'scopeNotesRead',
  'notes:write': 'scopeNotesWrite',
  'calendar:read': 'scopeCalendarRead',
  'calendar:write': 'scopeCalendarWrite',
  'reminders:write': 'scopeRemindersWrite',
  'webhooks:manage': 'scopeWebhooksManage',
  'automations:manage': 'scopeAutomationsManage',
  'profile:read': 'scopeProfileRead',
  'profile:write': 'scopeProfileWrite',
  'backup:read': 'scopeBackupRead',
};

export function TokensPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const inSettings = useLocation().pathname.startsWith('/settings');
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => tokensApi.listTokens() });
  const [composer, setComposer] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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
      setComposer(false);
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
      setConfirmId(null);
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: () => {
      setError(messages.tokenFailed);
    },
  });
  const items = tokens.data?.items ?? [];
  const endpoint = `${window.location.origin}/api/v1/mcp`;
  const snippet = mcpSnippet(endpoint);

  function rememberCopy(key: string) {
    setCopied(key);
    window.setTimeout(() => {
      setCopied((current) => (current === key ? null : current));
    }, 2000);
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      rememberCopy(key);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className={inSettings ? 'token-settings' : 'screen-page token-settings'}>
      <header className="page-header">
        <div>
          <h1>{inSettings ? messages.settingsTokens : messages.tokensTitle}</h1>
          <p className="lede">{messages.tokensHint}</p>
        </div>
      </header>

      <section className="token-panel" aria-labelledby="mcp-title">
        <div className="token-panel-head">
          <div>
            <h2 id="mcp-title">{messages.mcpTitle}</h2>
            <p>{messages.mcpHint}</p>
          </div>
        </div>
        <div className="token-url">
          <code>{endpoint}</code>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void copyText('url', endpoint);
            }}
          >
            {copied === 'url' ? messages.copied : messages.mcpCopyUrl}
          </Button>
        </div>
        <p className="token-kicker">{messages.mcpCursor}</p>
        <pre className="token-snippet">{snippet}</pre>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void copyText('snippet', snippet);
          }}
        >
          {copied === 'snippet' ? messages.copied : messages.mcpCopyConfig}
        </Button>
      </section>

      {secret !== null ? (
        <div className="token-secret" role="status">
          <p>{messages.tokenSecret}</p>
          <code>{secret}</code>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void copyText('secret', secret);
            }}
          >
            {copied === 'secret' ? messages.copied : messages.tokenCopySecret}
          </Button>
        </div>
      ) : null}

      <section className="token-panel" aria-labelledby="token-new-title">
        <div className="token-panel-head">
          <div>
            <h2 id="token-new-title">{messages.tokenNew}</h2>
            <p>{messages.tokenNewHint}</p>
          </div>
          <Button
            type="button"
            variant={composer ? 'ghost' : 'primary'}
            aria-expanded={composer}
            onClick={() => {
              setComposer((current) => !current);
              setError(null);
            }}
          >
            {composer ? messages.cancel : messages.tokenNew}
          </Button>
        </div>
        {composer ? (
          <form
            className="token-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim().length === 0 || scopes.length === 0 || create.isPending) {
                return;
              }
              create.mutate();
            }}
          >
            <label className="token-label" htmlFor="token-name">
              {messages.tokenName}
            </label>
            <input
              id="token-name"
              className="token-name"
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <div className="token-resources" role="group" aria-label={messages.tokenScopes}>
              {GROUPS.map((group) => (
                <div key={group.name} className="token-resource">
                  <span>{messages[group.name]}</span>
                  <span className="token-choices">
                    {group.choices.map((choice) => {
                      const on = scopes.includes(choice.id);
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          className={on ? 'token-scope is-on' : 'token-scope'}
                          aria-pressed={on}
                          onClick={() => {
                            setScopes((current) =>
                              current.includes(choice.id)
                                ? current.filter((item) => item !== choice.id)
                                : [...current, choice.id],
                            );
                          }}
                        >
                          {messages[choice.label]}
                        </button>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>
            {error !== null ? <p role="alert">{error}</p> : null}
            <Button
              type="submit"
              variant="primary"
              disabled={name.trim().length === 0 || scopes.length === 0}
              loading={create.isPending}
            >
              {create.isPending ? messages.tokenSaving : messages.tokenCreate}
            </Button>
          </form>
        ) : null}
      </section>

      <section className="token-panel is-list" aria-label={messages.tokensTitle}>
        {tokens.isPending ? <SkeletonRows /> : null}
        {tokens.isError ? <p role="alert">{messages.tokenFailed}</p> : null}
        {tokens.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.tokenEmpty}</p>
        ) : null}
        {items
          .filter((token) => token.revoked_at === null)
          .map((token) => {
            const revoked = token.revoked_at !== null;
            const open = selected === token.id;
            return (
              <article key={token.id} className={revoked ? 'token-row is-revoked' : 'token-row'}>
                <div className="token-head">
                  <div>
                    <h2>{token.client_name ?? token.name}</h2>
                    <code className="token-prefix">{token.token_prefix}</code>
                  </div>
                  <span className={revoked ? 'token-pill is-revoked' : 'token-pill'}>
                    {revoked ? messages.tokenRevoked : messages.tokenActive}
                  </span>
                </div>
                <ul className="token-chips">
                  {token.scopes.map((scope) => (
                    <li key={scope} className="token-chip">
                      {scopeLabel(messages, scope)}
                    </li>
                  ))}
                </ul>
                <p className="token-meta">
                  {messages.tokenCreatedOn} {when(token.created_at, locale)}
                  {' · '}
                  {token.last_used_at === null
                    ? messages.tokenNeverUsed
                    : `${messages.tokenLastUsed} ${when(token.last_used_at, locale)}`}
                </p>
                <div className="token-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-expanded={open}
                    onClick={() => {
                      setSelected(open ? null : token.id);
                      setSecret(null);
                    }}
                  >
                    {open ? messages.tokenHideActivity : messages.tokenActivity}
                  </Button>
                  {revoked ? null : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setConfirmId(token.id);
                      }}
                    >
                      {messages.tokenRevoke}
                    </Button>
                  )}
                </div>
                {confirmId === token.id ? (
                  <div className="token-confirm">
                    <p>{fill(messages.tokenRevokeBody, token.name)}</p>
                    <span className="token-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setConfirmId(null);
                        }}
                      >
                        {messages.cancel}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        loading={revoke.isPending}
                        onClick={() => {
                          revoke.mutate(token.id);
                        }}
                      >
                        {messages.tokenRevoke}
                      </Button>
                    </span>
                  </div>
                ) : null}
                {open ? (
                  <div>
                    {activity.isSuccess && activity.data.items.length === 0 ? (
                      <p className="token-meta">{messages.tokenActivityEmpty}</p>
                    ) : null}
                    <ul className="token-activity">
                      {(activity.data?.items ?? []).map((entry) => (
                        <li key={entry.id}>
                          <span>
                            {actionLabel(messages, entry.action)} ·{' '}
                            {entityLabel(messages, entry.entity_type)}
                          </span>
                          <time dateTime={entry.created_at}>{when(entry.created_at, locale)}</time>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        {items.some((token) => token.revoked_at !== null) ? (
          <details className="token-revoked">
            <summary>
              {messages.tokensRevokedFold} (
              {String(items.filter((token) => token.revoked_at !== null).length)})
            </summary>
            <ul>
              {items
                .filter((token) => token.revoked_at !== null)
                .map((token) => (
                  <li key={token.id}>
                    {token.name}
                    {token.revoked_at !== null ? (
                      <time dateTime={token.revoked_at}> · {when(token.revoked_at, locale)}</time>
                    ) : null}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </section>
    </section>
  );
}

function mcpSnippet(url: string): string {
  return `{
  "mcpServers": {
    "tick-tack-done": {
      "url": ${JSON.stringify(url)},
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}`;
}

function when(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

function scopeLabel(messages: Messages, scope: string): string {
  const key = SCOPE_LABEL[scope];
  return key === undefined ? scope : messages[key];
}

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
