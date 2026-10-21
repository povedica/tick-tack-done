import type { CreateTokenBody } from '@reflexionia/sdk';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Button, SkeletonRows } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { tokensApi } from '../api';
import { groupTokens, tokenExpired } from '../token-groups';

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
    name: 'tokenGroupStats',
    choices: [{ id: 'stats:read', label: 'scopeRead' }],
  },
  {
    name: 'tokenGroupBackup',
    choices: [{ id: 'backup:read', label: 'scopeRead' }],
  },
];

export function TokensPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const inSettings = useLocation().pathname.startsWith('/settings');
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const tokens = useInfiniteQuery({
    queryKey: ['tokens', 'active'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      tokensApi.listTokens({
        status: 'active',
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const revokedTokens = useInfiniteQuery({
    queryKey: ['tokens', 'revoked'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      tokensApi.listTokens({
        status: 'revoked',
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const [client, setClient] = useState('Cursor');
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
  const items = tokens.data?.pages.flatMap((page) => page.items) ?? [];
  const revokedItems = revokedTokens.data?.pages.flatMap((page) => page.items) ?? [];
  const revokedTotal = revokedTokens.data?.pages[0]?.total ?? 0;
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
        <label className="token-kicker">
          {messages.mcpClient}
          <select
            value={client}
            onChange={(event) => {
              setClient(event.target.value);
            }}
          >
            {['Cursor', 'ChatGPT', 'Claude'].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {client !== 'Cursor' ? <p>{messages.mcpOAuthHelp}</p> : null}
        {client === 'Cursor' ? (
          <>
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
          </>
        ) : null}
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
            <p>{messages.tokenNewHint}</p>
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
        {tokens.isError ? (
          <p role="alert">
            {messages.tokenFailed}
            <Button
              type="button"
              onClick={() => {
                void tokens.refetch();
              }}
            >
              {messages.retry}
            </Button>
          </p>
        ) : null}
        {tokens.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.tokenEmpty}</p>
        ) : null}
        {groupTokens(items).map((group) => (
          <section key={group.id} className="token-group">
            <h2 className="token-group-title">{group.name ?? messages.tokenManualGroup}</h2>
            {group.items.map((token) => {
              const revoked = token.revoked_at !== null;
              const expired = tokenExpired(token, now);
              const open = selected === token.id;
              return (
                <article key={token.id} className={revoked ? 'token-row is-revoked' : 'token-row'}>
                  <div className="token-head">
                    <div>
                      <h3>
                        {token.oauth_client_id === null ? token.name : messages.tokenAuthorization}
                      </h3>
                      <code className="token-prefix">{token.token_prefix}</code>
                    </div>
                    <span className={revoked || expired ? 'token-pill is-revoked' : 'token-pill'}>
                      {revoked
                        ? messages.tokenRevoked
                        : expired
                          ? messages.tokenExpired
                          : messages.tokenActive}
                    </span>
                  </div>
                  <ul className="token-scope-table" title={token.scopes.join(', ')}>
                    {groupedScopes(token.scopes, messages).map((row) => (
                      <li key={row.resource}>
                        <span>{row.resource}</span>
                        <span>{row.access}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="token-meta">
                    {messages.tokenCreatedOn} {when(token.created_at, locale)}
                    {' · '}
                    {token.last_used_at === null
                      ? messages.tokenNeverUsed
                      : `${messages.tokenLastUsed} ${whenRelative(token.last_used_at, locale, messages)}`}
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
                        variant="danger"
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
                            <time dateTime={entry.created_at}>
                              {when(entry.created_at, locale)}
                            </time>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
        {tokens.hasNextPage ? (
          <Button
            type="button"
            loading={tokens.isFetchingNextPage}
            onClick={() => {
              void tokens.fetchNextPage();
            }}
          >
            {messages.tokenLoadMore}
          </Button>
        ) : null}
        {revokedTokens.isError ? (
          <p role="alert">
            {messages.tokenFailed}
            <Button
              type="button"
              onClick={() => {
                void revokedTokens.refetch();
              }}
            >
              {messages.retry}
            </Button>
          </p>
        ) : null}
        {revokedTokens.isPending ? <SkeletonRows /> : null}
        {revokedTotal > 0 ? (
          <details className="token-revoked">
            <summary>
              {messages.tokensRevokedFold} ({String(revokedTotal)})
            </summary>
            <ul>
              {revokedItems.map((token) => (
                <li key={token.id}>
                  {token.client_name ?? token.name}
                  {token.revoked_at !== null ? (
                    <time dateTime={token.revoked_at}> · {when(token.revoked_at, locale)}</time>
                  ) : null}
                </li>
              ))}
            </ul>
            {revokedTokens.hasNextPage ? (
              <Button
                type="button"
                loading={revokedTokens.isFetchingNextPage}
                onClick={() => {
                  void revokedTokens.fetchNextPage();
                }}
              >
                {messages.tokenLoadMore}
              </Button>
            ) : null}
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
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function whenRelative(iso: string, locale: string, messages: Messages): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(date);
  startThat.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((startToday.getTime() - startThat.getTime()) / 86_400_000);
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
  if (dayDelta === 0) {
    return `${messages.navToday.toLocaleLowerCase()}, ${clock}`;
  }
  if (dayDelta === 1) {
    return `${messages.yesterdayLabel}, ${clock}`;
  }
  return when(iso, locale);
}

/** TOK-1: one line per resource instead of a chip wall. */
function groupedScopes(
  scopes: readonly string[],
  messages: Messages,
): readonly { readonly resource: string; readonly access: string }[] {
  const unique = [...new Set(scopes)];
  const byResource = new Map<string, { read: boolean; write: boolean; other: string[] }>();
  for (const scope of unique) {
    const parts = scope.split(':');
    const verb = parts.pop() ?? '';
    const resource = parts.join(':');
    const row = byResource.get(resource) ?? { read: false, write: false, other: [] };
    if (verb === 'read') {
      row.read = true;
    } else if (verb === 'write' || verb === 'manage') {
      row.write = true;
    } else if (verb.length > 0) {
      row.other.push(scopeAction(messages, verb));
    } else {
      row.other.push(scopeAction(messages, verb));
    }
    byResource.set(resource, row);
  }
  return [...byResource.entries()].map(([resource, access]) => {
    const parts: string[] = [];
    if (access.read && access.write) {
      parts.push(messages.tokenAccessReadWrite);
    } else if (access.read) {
      parts.push(messages.tokenAccessRead);
    } else if (access.write) {
      parts.push(messages.tokenAccessWrite);
    }
    parts.push(...access.other);
    return {
      resource: resourceLabel(messages, resource),
      access: parts.join(' · ') || messages.tokenAccessRead,
    };
  });
}

function resourceLabel(messages: Messages, resource: string): string {
  switch (resource) {
    case 'countdowns':
      return messages.navCountdowns;
    case 'stats':
      return messages.navStatistics;
    case 'notifications:self':
      return messages.scopeNotifications;
    case 'ticky:proposals':
      return messages.scopeTickyProposals;
    case 'ticky:routines':
      return messages.scopeTickyRoutines;
    case 'tasks':
      return messages.tokenGroupTasks;
    case 'lists':
      return messages.tokenGroupLists;
    case 'tags':
      return messages.tokenGroupTags;
    case 'filters':
      return messages.tokenGroupFilters;
    case 'habits':
      return messages.tokenGroupHabits;
    case 'focus':
      return messages.tokenGroupFocus;
    case 'notes':
      return messages.tokenGroupNotes;
    case 'calendar':
      return messages.tokenGroupCalendar;
    case 'reminders':
      return messages.tokenGroupReminders;
    case 'webhooks':
      return messages.tokenGroupWebhooks;
    case 'automations':
      return messages.tokenGroupAutomations;
    case 'profile':
      return messages.tokenGroupProfile;
    case 'backup':
      return messages.tokenGroupBackup;
    default:
      return resource;
  }
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

function scopeAction(messages: Messages, verb: string): string {
  switch (verb) {
    case 'create':
      return messages.scopeCreateAction;
    case 'update':
      return messages.scopeUpdateAction;
    case 'complete':
      return messages.scopeCompleteAction;
    case 'trash':
      return messages.scopeTrashAction;
    case 'start':
      return messages.scopeStartAction;
    case 'stop':
      return messages.scopeStopAction;
    default:
      return verb;
  }
}
