import '../tokens.css';
import { runAction } from '../../../components/run-action';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@reflexionia/sdk';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Button, SkeletonRows } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { tokensApi } from '../api';
import { groupTokens, tokenExpired } from '../token-groups';
import { GROUPS, groupedScopes, isSensitiveScope, type Scope } from '../scopes';

function useTokenOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function ConnectedApps({
  data,
  loading,
  failed,
  retry,
}: {
  data: unknown;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const m = useMessages();
  const online = useTokenOnline();
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const activity = useInfiniteQuery({
    queryKey: ['oauth-activity', selected],
    enabled: selected !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => tokensApi.oauthGrantActivity(selected ?? '', pageParam),
    getNextPageParam: (page) =>
      typeof page.next_cursor === 'string' ? page.next_cursor : undefined,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => tokensApi.revokeOauthGrant(id),
    onSuccess: async () => {
      setConfirm(null);
      await cache.invalidateQueries({ queryKey: ['oauth-grants'] });
      await cache.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
  const items = (data as { items?: unknown } | undefined)?.items;
  const rows = Array.isArray(items)
    ? (items as {
        client_id: string;
        client_name: string;
        authorized_at: string;
        last_used_at: string | null;
        scopes: string[];
        renewals: number;
        active_refresh_families: number;
      }[])
    : [];
  return (
    <section className="token-panel">
      <h2>{m.tokenAppsTitle}</h2>
      {loading ? (
        <SkeletonRows />
      ) : failed ? (
        <p role="alert">
          {m.tokenFailed}
          <Button onClick={retry}>{m.retry}</Button>
        </p>
      ) : rows.length === 0 ? (
        <p>{m.tokenAppsEmpty}</p>
      ) : (
        rows.map((row) => (
          <article className="token-row" key={row.client_id}>
            <details>
              <summary>
                <strong>{row.client_name}</strong> · {m.tokenActive}
              </summary>
              <p>{m.tokenAppDeclaredName}</p>
              <p className="token-meta">
                {m.tokenCreatedOn} {new Date(row.authorized_at).toLocaleDateString()} ·{' '}
                {m.tokenLastUsed}{' '}
                {row.last_used_at ? new Date(row.last_used_at).toLocaleString() : m.tokenNeverUsed}
              </p>
              <p>
                {row.renewals} {m.tokenAppRenewals}
              </p>
              <ul className="token-scope-table">
                {groupedScopes(row.scopes, m).map((scope) => (
                  <li key={scope.resource}>
                    {scope.resource} · {scope.access}
                    {groupedScopes(row.scopes.filter(isSensitiveScope), m).some(
                      (sensitive) => sensitive.resource === scope.resource,
                    ) ? (
                      <span title={m.scopeSensitive}> ⚠</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Button
                aria-expanded={selected === row.client_id}
                onClick={() => {
                  setSelected(selected === row.client_id ? null : row.client_id);
                }}
              >
                {m.tokenActivity}
              </Button>
              {selected === row.client_id ? (
                activity.isPending ? (
                  <SkeletonRows />
                ) : activity.isError ? (
                  <p role="alert">
                    {m.tokenFailed}
                    <Button
                      onClick={() => {
                        runAction(activity.refetch());
                      }}
                    >
                      {m.retry}
                    </Button>
                  </p>
                ) : (
                  <>
                    <ul className="token-activity">
                      {activity.data.pages
                        .flatMap((page) =>
                          Array.isArray(page.items) ? (page.items as unknown[]) : [],
                        )
                        .map((value, index) => {
                          const entry = value as {
                            action: string;
                            entity_type: string;
                            changes?: unknown;
                            created_at?: string;
                          };
                          return (
                            <li key={index}>
                              <span>{activityLine(m, entry)}</span>
                              {entry.created_at ? (
                                <time>{new Date(entry.created_at).toLocaleString()}</time>
                              ) : null}
                            </li>
                          );
                        })}
                    </ul>
                    {activity.hasNextPage ? (
                      <Button
                        onClick={() => {
                          runAction(activity.fetchNextPage());
                        }}
                      >
                        {m.tokenLoadMore}
                      </Button>
                    ) : null}
                  </>
                )
              ) : null}
            </details>
            <Button
              variant="ghost"
              disabled={!online}
              title={!online ? m.offline : undefined}
              onClick={() => {
                setConfirm(row.client_id);
              }}
            >
              {m.tokenAppRevoke}
            </Button>
            {confirm === row.client_id ? (
              <div
                role="alertdialog"
                aria-label={m.tokenAppRevoke}
                className="token-confirm"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setConfirm(null);
                }}
              >
                <p>{fill(m.tokenRevokeBody, row.client_name)}</p>
                {revoke.isError ? <p role="alert">{m.tokenRevokeFailed}</p> : null}
                <Button
                  autoFocus
                  onClick={() => {
                    setConfirm(null);
                  }}
                >
                  {m.cancel}
                </Button>
                <Button
                  variant="danger"
                  disabled={!online}
                  loading={revoke.isPending}
                  onClick={() => {
                    revoke.mutate(row.client_id);
                  }}
                >
                  {m.tokenAppRevoke}
                </Button>
              </div>
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}

export function TokensPage() {
  const messages = useMessages();
  const online = useTokenOnline();
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
  const renewals = useQuery({
    queryKey: ['oauth-renewals'],
    queryFn: () => tokensApi.oauthRenewals(),
  });
  const renewalRows = (Array.isArray(renewals.data?.items) ? renewals.data.items : []) as {
    client_id: string;
    client_name: string;
    count: number;
  }[];
  const renewalCount = renewalRows.reduce((sum, row) => sum + row.count, 0);
  const grants = useQuery({ queryKey: ['oauth-grants'], queryFn: () => tokensApi.oauthGrants() });
  const [expiry, setExpiry] = useState<30 | 90 | 365 | null>(90);
  const [client, setClient] = useState('Cursor');
  const [composer, setComposer] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [confirmDismissSecret, setConfirmDismissSecret] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const activity = useInfiniteQuery({
    queryKey: ['token-activity', selected],
    enabled: selected !== null,
    initialPageParam: null as string | null,
    retry: false,
    queryFn: ({ pageParam }) => {
      if (selected === null) {
        throw new Error('token');
      }
      return tokensApi.tokenActivity(
        selected,
        pageParam === null ? undefined : { cursor: pageParam },
      );
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const activityItems = activity.data?.pages.flatMap((page) => page.items) ?? [];
  const create = useMutation({
    mutationFn: () => tokensApi.createToken({ name: name.trim(), scopes, expires_in_days: expiry }),
    onSuccess: async (created) => {
      setSecret(created.token);
      setSecretCopied(false);
      setSelected(created.id);
      setName('');
      setScopes([]);
      setComposer(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: (reason) => {
      if (reason instanceof ApiError && reason.code === 'token_name_taken') {
        setError(messages.tokenNameTaken);
        window.requestAnimationFrame(() => {
          nameRef.current?.focus();
        });
        return;
      }
      setError(messages.tokenFailed);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => tokensApi.revokeToken(id),
    onSuccess: async () => {
      setConfirmId(null);
      setRevokeError(null);
      await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: () => {
      setRevokeError(messages.tokenRevokeFailed);
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
      if (key === 'secret') {
        setSecretCopied(true);
      }
    } catch {
      setCopied(null);
    }
  }

  function dismissSecret() {
    if (!secretCopied && secret !== null && !confirmDismissSecret) {
      setConfirmDismissSecret(true);
      return;
    }
    setConfirmDismissSecret(false);
    setSecret(null);
    setSecretCopied(false);
  }

  return (
    <section
      className={
        inSettings
          ? 'token-settings token-management'
          : 'screen-page token-settings token-management'
      }
    >
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
              runAction(copyText('url', endpoint));
            }}
          >
            {copied === 'url' ? messages.copied : messages.mcpCopyUrl}
          </Button>
        </div>
        <div className="token-client-scroll">
          <div
            role="tablist"
            aria-label={messages.mcpClient}
            className="focus-modes token-client-tabs"
          >
            {['Cursor', 'Claude', 'ChatGPT', 'Otro'].map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={client === name}
                onClick={() => {
                  setClient(name);
                }}
              >
                {name === 'Otro' ? messages.mcpOtherClient : name}
              </button>
            ))}
          </div>
        </div>
        {client === 'ChatGPT' || client === 'Claude' ? (
          <ol>
            <li>{messages.mcpOAuthStep1}</li>
            <li>{messages.mcpOAuthStep2}</li>
            <li>{messages.mcpOAuthStep3}</li>
          </ol>
        ) : null}
        {client === 'Cursor' || client === 'Otro' ? (
          <div className="token-config">
            <pre className="token-snippet">{snippet}</pre>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                runAction(copyText('snippet', snippet));
              }}
            >
              {copied === 'snippet' ? messages.copied : messages.mcpCopyConfig}
            </Button>
          </div>
        ) : null}
      </section>

      <ConnectedApps
        data={grants.data}
        loading={grants.isPending}
        failed={grants.isError}
        retry={() => {
          runAction(grants.refetch());
        }}
      />
      {secret !== null ? (
        <div className="token-secret">
          <p className="sr-only" aria-live="polite">
            {messages.tokenCreatedOnce}
          </p>
          <p aria-hidden="true">{messages.tokenSecret}</p>
          <input
            className="token-secret-value"
            type="text"
            readOnly
            value={secret}
            aria-label={messages.tokenCopySecret}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              runAction(copyText('secret', secret));
            }}
          >
            {copied === 'secret' ? messages.copied : messages.tokenCopySecret}
          </Button>
          {confirmDismissSecret ? (
            <span className="token-confirm" role="alertdialog">
              <p>{messages.tokenSecret}</p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setConfirmDismissSecret(false);
                }}
              >
                {messages.cancel}
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={dismissSecret}>
                {messages.tokenDismissSecret}
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={dismissSecret}>
              {messages.tokenDismissSecret}
            </Button>
          )}
        </div>
      ) : null}

      <section className="token-panel" aria-labelledby="token-new-title">
        <div className="token-panel-head">
          <div>
            <h2 id="token-new-title">{messages.tokenManualGroup}</h2>
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
              if (!online || name.trim().length === 0 || scopes.length === 0 || create.isPending) {
                return;
              }
              create.mutate();
            }}
          >
            <Button
              type="button"
              onClick={() => {
                setComposer(false);
              }}
            >
              {messages.cancel}
            </Button>
            <p>{messages.tokenNewHint}</p>
            <label className="token-label" htmlFor="token-name">
              {messages.tokenName}
            </label>
            <input
              ref={nameRef}
              id="token-name"
              className="token-name"
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
            <fieldset className="token-expiry" role="radiogroup">
              <legend>{messages.tokenExpiresIn}</legend>
              {([30, 90, 365, null] as const).map((days) => (
                <label key={String(days)}>
                  <input
                    type="radio"
                    name="expiry"
                    checked={expiry === days}
                    onChange={() => {
                      setExpiry(days);
                    }}
                  />
                  {days === null
                    ? messages.tokenExpiresNever
                    : `${String(days)} ${messages.tokenExpiryDays}`}
                </label>
              ))}
            </fieldset>
            <div className="token-resources" role="group" aria-label={messages.tokenScopes}>
              {GROUPS.map((group) => (
                <details
                  key={group.name}
                  name="token-permissions"
                  open={window.innerWidth >= 1024}
                  className="token-resource"
                >
                  <summary>{messages[group.name]}</summary>
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
                          {isSensitiveScope(choice.id) ? (
                            <span
                              title={messages.scopeSensitive}
                              aria-label={messages.scopeSensitive}
                            >
                              {' '}
                              ⚠
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </span>
                </details>
              ))}
            </div>
            {error !== null ? <p role="alert">{error}</p> : null}
            <Button
              type="submit"
              variant="primary"
              disabled={!online || name.trim().length === 0 || scopes.length === 0}
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
                runAction(tokens.refetch());
              }}
            >
              {messages.retry}
            </Button>
          </p>
        ) : null}
        {tokens.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.tokenEmpty}</p>
        ) : null}
        {groupTokens(items.filter((token) => token.oauth_client_id === null)).map((group) => (
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
                  <details>
                    <summary>
                      {token.scopes.length} {messages.tokenScopesSummary} ·{' '}
                      {token.scopes.filter(isSensitiveScope).length} ⚠
                    </summary>
                    <ul className="token-scope-table" title={token.scopes.join(', ')}>
                      {groupedScopes(token.scopes, messages).map((row) => (
                        <li key={row.resource}>
                          <span>
                            {row.resource}
                            {groupedScopes(token.scopes.filter(isSensitiveScope), messages).some(
                              (sensitive) => sensitive.resource === row.resource,
                            ) ? (
                              <span title={messages.scopeSensitive}> ⚠</span>
                            ) : null}
                          </span>
                          <span>{row.access}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <p className="token-meta">
                    {messages.tokenCreatedOn} {when(token.created_at, locale)} ·{' '}
                    {token.expires_at
                      ? `${messages.tokenExpiresOn} ${when(token.expires_at, locale)}`
                      : messages.tokenExpiresNever}
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
                          if (!online) return;
                          setConfirmId(token.id);
                          setRevokeError(null);
                        }}
                      >
                        {messages.tokenRevoke}
                      </Button>
                    )}
                  </div>
                  {confirmId === token.id ? (
                    <div className="token-confirm">
                      <p>{fill(messages.tokenRevokeBody, token.client_name ?? token.name)}</p>
                      {revokeError !== null ? <p role="alert">{revokeError}</p> : null}
                      <span className="token-actions">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setConfirmId(null);
                            setRevokeError(null);
                          }}
                        >
                          {messages.cancel}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={!online}
                          loading={revoke.isPending}
                          onClick={() => {
                            setRevokeError(null);
                            revoke.mutate(token.id);
                          }}
                        >
                          {messages.tokenRevoke}
                        </Button>
                      </span>
                    </div>
                  ) : null}
                  {open ? (
                    <div
                      role="region"
                      aria-label={messages.tokenActivity}
                      aria-busy={activity.isFetching}
                    >
                      {activity.isPending ? <SkeletonRows /> : null}
                      {activity.isSuccess && activityItems.length === 0 ? (
                        <p className="token-meta">{messages.tokenActivityEmpty}</p>
                      ) : null}
                      <ul className="token-activity">
                        {activityItems.map((entry) => (
                          <li key={entry.id}>
                            <span>{activityLine(messages, entry)}</span>
                            <time dateTime={entry.created_at}>
                              {when(entry.created_at, locale)}
                            </time>
                          </li>
                        ))}
                      </ul>
                      {activity.isError ? (
                        <p role="alert">
                          {messages.tokenActivityFailed}
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              runAction(
                                activity.isFetchNextPageError
                                  ? activity.fetchNextPage()
                                  : activity.refetch(),
                              );
                            }}
                          >
                            {messages.retry}
                          </Button>
                        </p>
                      ) : null}
                      {activity.hasNextPage && !activity.isFetchNextPageError ? (
                        <Button
                          type="button"
                          size="sm"
                          loading={activity.isFetchingNextPage}
                          onClick={() => {
                            runAction(activity.fetchNextPage());
                          }}
                        >
                          {messages.tokenLoadMore}
                        </Button>
                      ) : null}
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
              runAction(tokens.fetchNextPage());
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
                runAction(revokedTokens.refetch());
              }}
            >
              {messages.retry}
            </Button>
          </p>
        ) : null}
        {revokedTokens.isPending ? <SkeletonRows /> : null}
        {revokedTotal > 0 || renewalCount > 0 ? (
          <details className="token-revoked">
            <summary>
              {messages.tokensRevokedFold} ({String(revokedTotal + renewalCount)})
            </summary>
            <ul className="token-revoked-list">
              {renewalRows.map((row) => (
                <li key={row.client_id} className="token-revoked-row">
                  {row.client_name} · {row.count} {messages.tokenAppRenewals}
                </li>
              ))}
              {revokedItems.map((token) => (
                <li key={token.id} className="token-revoked-row">
                  <div>
                    <strong>{token.client_name ?? token.name}</strong>
                    <span className="token-meta">
                      {token.revoked_reason === 'reuse'
                        ? messages.tokenRevokedReasonReuse
                        : messages.tokenRevokedReasonUser}{' '}
                      ·{' '}
                      {token.oauth_client_id === null
                        ? messages.tokenManualGroup
                        : `${messages.tokenAuthorization} · ${token.client_name ?? token.name}`}
                    </span>
                  </div>
                  {token.revoked_at !== null ? (
                    <time dateTime={token.revoked_at}>{when(token.revoked_at, locale)}</time>
                  ) : null}
                </li>
              ))}
            </ul>
            {revokedTokens.hasNextPage ? (
              <Button
                type="button"
                loading={revokedTokens.isFetchingNextPage}
                onClick={() => {
                  runAction(revokedTokens.fetchNextPage());
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

function activityLine(
  messages: Messages,
  entry: {
    readonly action: string;
    readonly entity_type: string;
    readonly changes?: unknown;
  },
): string {
  const changes =
    typeof entry.changes === 'object' && entry.changes !== null
      ? (entry.changes as Record<string, unknown>)
      : {};
  if (entry.entity_type === 'http_request') {
    const method = typeof changes.method === 'string' ? changes.method : 'GET';
    const path = typeof changes.path === 'string' ? changes.path : '';
    const outcome =
      changes.outcome === 'scope_missing'
        ? messages.tokenOutcomeDenied
        : changes.outcome === 'rate_limited'
          ? messages.tokenOutcomeLimited
          : messages.tokenOutcomeAllowed;
    return `${method} ${path} · ${outcome}`;
  }
  if (entry.entity_type === 'oauth_token') {
    if (changes.outcome === 'issued') return messages.tokenIssued;
    if (changes.outcome === 'refreshed') return messages.tokenRefreshed;
    if (changes.outcome === 'revoked') return messages.tokenRevokedEvent;
    if (changes.outcome === 'reused') return messages.tokenReuseDetected;
  }
  return `${actionLabel(messages, entry.action)} · ${entityLabel(messages, entry.entity_type)}`;
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
    case 'oauth_token':
      return messages.entityOauthToken;
    default:
      return entity;
  }
}
