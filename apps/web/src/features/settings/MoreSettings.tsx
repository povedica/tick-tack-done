import { runAction } from '../../components/run-action';
import { ApiError, type Project } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { failureMessage } from '../../failure';
import { Button, Kbd } from '../../components/ui';
import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { SHORTCUT_ROWS } from '../../shell/shortcuts';

const GENERAL_KEYS = ['N', '?', 'Ctrl/Cmd+K', '/', 'Esc', '.', '['] as const;
const GO_KEYS = ['G T', 'G I', 'G C', 'G M', 'G S', 'G A', 'G B', 'G N', 'G R', 'G W'] as const;

export function AutomationSettings() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: ['automations'], queryFn: () => api.listAutomations() });
  const items = itemsOf(rows.data);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <section className="token-settings">
      <PageTitle title={messages.settingsAutomations} lede={messages.automationRecipe} />
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed.length === 0) {
              return;
            }
            setError(null);
            void api
              .createAutomation({
                name: trimmed,
                trigger: { event: 'task.completed@v1' },
                actions: [{ type: 'notify' }],
                enabled: true,
              })
              .then(() => {
                setName('');
                runAction(queryClient.invalidateQueries({ queryKey: ['automations'] }));
              })
              .catch((reason: unknown) => {
                setError(failureMessage(reason, messages.settingsFailed));
              });
          }}
        >
          <label className="token-label" htmlFor="automation-name">
            {messages.automationName}
          </label>
          <input
            id="automation-name"
            className="token-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <p className="token-meta">
            {messages.automationWhen} · {messages.automationNotify}
          </p>
          {error !== null ? <p role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" size="sm" disabled={name.trim().length === 0}>
            {messages.automationCreate}
          </Button>
        </form>
      </section>
      <section className="token-panel is-list" aria-label={messages.settingsAutomations}>
        {rows.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
        {rows.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.automationsEmpty}</p>
        ) : null}
        {items.map((row) => {
          const id = text(row.id);
          const enabled = row.enabled === true;
          return (
            <article className="token-row" key={id}>
              <div className="token-head">
                <div>
                  <h2>{text(row.name)}</h2>
                  <p className="token-meta">{triggerLabel(row.trigger, messages)}</p>
                </div>
                <span className={enabled ? 'token-pill' : 'token-pill is-revoked'}>
                  {enabled ? messages.automationActive : messages.automationPaused}
                </span>
              </div>
              <ul className="token-chips">
                {actionTypes(row.actions).map((type) => (
                  <li className="token-chip" key={type}>
                    {type === 'notify' ? messages.automationNotify : type}
                  </li>
                ))}
              </ul>
              <span className="token-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAction(
                      api.updateAutomation(id, { enabled: !enabled }).then(() => {
                        runAction(queryClient.invalidateQueries({ queryKey: ['automations'] }));
                      }),
                    );
                  }}
                >
                  {enabled ? messages.automationPause : messages.automationResume}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setConfirmId(id);
                  }}
                >
                  {messages.purge}
                </Button>
              </span>
              {confirmId === id ? (
                <div className="token-confirm">
                  <p>{messages.automationDeleteBody}</p>
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
                      onClick={() => {
                        runAction(
                          api.deleteAutomation(id).then(() => {
                            setConfirmId(null);
                            runAction(queryClient.invalidateQueries({ queryKey: ['automations'] }));
                          }),
                        );
                      }}
                    >
                      {messages.purge}
                    </Button>
                  </span>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </section>
  );
}

export function WebhookSettings() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: ['webhooks'], queryFn: () => api.listWebhooks() });
  const items = itemsOf(rows.data);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="token-settings">
      <PageTitle title={messages.settingsWebhooks} lede={messages.webhookRecipe} />
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!url.startsWith('https://')) {
              setError(messages.webhookHttps);
              return;
            }
            setError(null);
            void api
              .createWebhook({ url, events: ['task.completed@v1'] })
              .then((body) => {
                setUrl('');
                setSecret(text(body.secret));
                setCopied(false);
                runAction(queryClient.invalidateQueries({ queryKey: ['webhooks'] }));
              })
              .catch(() => {
                setError(messages.settingsFailed);
              });
          }}
        >
          <label className="token-label" htmlFor="webhook-url">
            {messages.webhookUrl}
          </label>
          <input
            id="webhook-url"
            className="token-name"
            value={url}
            inputMode="url"
            placeholder="https://"
            onChange={(event) => {
              setUrl(event.target.value);
            }}
          />
          {error !== null ? <p role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" size="sm" disabled={url.trim().length === 0}>
            {messages.webhookCreate}
          </Button>
        </form>
        {secret !== null && secret.length > 0 ? (
          <div className="token-secret">
            <p>{messages.webhookSecretOnce}</p>
            <code>{secret}</code>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(secret).then(
                  () => {
                    setCopied(true);
                  },
                  () => {
                    setCopied(false);
                  },
                );
              }}
            >
              {copied ? messages.copied : messages.webhookCopySecret}
            </Button>
          </div>
        ) : null}
      </section>
      <section className="token-panel is-list" aria-label={messages.settingsWebhooks}>
        {rows.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
        {rows.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.webhooksEmpty}</p>
        ) : null}
        {notice !== null ? <p role="status">{notice}</p> : null}
        {items.map((row) => {
          const id = text(row.id);
          const active = row.active === true;
          const events = stringsOf(row.events);
          return (
            <article className="token-row" key={id}>
              <div className="token-head">
                <p className="settings-url">{text(row.url)}</p>
                <span className={active ? 'token-pill' : 'token-pill is-revoked'}>
                  {active ? messages.webhookActive : messages.webhookIdle}
                </span>
              </div>
              {events.length > 0 ? (
                <ul className="token-chips">
                  {events.map((event) => (
                    <li className="token-chip" key={event}>
                      {event}
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className="token-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAction(
                      api.updateWebhook(id, { active: !active }).then(() => {
                        runAction(queryClient.invalidateQueries({ queryKey: ['webhooks'] }));
                      }),
                    );
                  }}
                >
                  {active ? messages.webhookPause : messages.webhookResume}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNotice(null);
                    void api.pingWebhook(id).then(
                      () => {
                        setNotice(messages.webhookTestOk);
                      },
                      (reason: unknown) => {
                        setError(failureMessage(reason, messages.settingsFailed));
                      },
                    );
                  }}
                >
                  {messages.webhookTest}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAction(
                      api.rotateWebhook(id).then((body) => {
                        setSecret(text(body.secret));
                        setCopied(false);
                      }),
                    );
                  }}
                >
                  {messages.webhookRotate}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setConfirmId(id);
                  }}
                >
                  {messages.purge}
                </Button>
              </span>
              {confirmId === id ? (
                <div className="token-confirm">
                  <p>{messages.webhookDeleteBody}</p>
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
                      onClick={() => {
                        runAction(
                          api.deleteWebhook(id).then(() => {
                            setConfirmId(null);
                            runAction(queryClient.invalidateQueries({ queryKey: ['webhooks'] }));
                          }),
                        );
                      }}
                    >
                      {messages.purge}
                    </Button>
                  </span>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </section>
  );
}

export function PluginSettings() {
  const messages = useMessages();
  const rows = useQuery({ queryKey: ['plugins'], queryFn: () => api.listPlugins() });
  const items = itemsOf(rows.data);
  return (
    <section className="token-settings">
      <PageTitle title={messages.settingsPlugins} lede={messages.pluginsHint} />
      <section className="token-panel is-list" aria-label={messages.settingsPlugins}>
        {rows.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
        {rows.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.pluginEmpty}</p>
        ) : null}
        {items.map((row) => {
          const manifest = manifestOf(row.manifest);
          const enabled = row.enabled === true;
          const title = manifest?.name ?? text(row.plugin_id);
          return (
            <article className="token-row" key={text(row.id)}>
              <div className="token-head">
                <div>
                  <h2>{title}</h2>
                  <p className="token-meta">
                    {[text(row.plugin_id), manifest?.version ?? '']
                      .filter((part) => part.length > 0)
                      .join(' · ')}
                  </p>
                </div>
                <span className={enabled ? 'token-pill' : 'token-pill is-revoked'}>
                  {enabled ? messages.pluginOn : messages.pluginOff}
                </span>
              </div>
              {manifest !== null && manifest.permissions.length > 0 ? (
                <ul className="token-chips">
                  {manifest.permissions.map((permission) => (
                    <li className="token-chip" key={permission}>
                      {permission}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </section>
    </section>
  );
}

export function SharingSettings() {
  const messages = useMessages();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const lists = projects.data?.items ?? [];
  const [picked, setPicked] = useState('');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'read' | 'comment' | 'write'>('read');
  const [error, setError] = useState<string | null>(null);
  const projectId = picked.length > 0 ? picked : (lists[0]?.id ?? '');
  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.listMembers(projectId),
    enabled: projectId.length > 0,
  });
  const people = itemsOf(members.data);
  return (
    <section className="token-settings">
      <PageTitle title={messages.settingsSharing} lede={messages.sharingHint} />
      <section className="token-panel">
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (projectId.length === 0 || email.trim().length === 0) {
              return;
            }
            setError(null);
            void api
              .addMember(projectId, email.trim(), permission)
              .then(() => {
                setEmail('');
                runAction(members.refetch());
              })
              .catch((reason: unknown) => {
                setError(
                  reason instanceof ApiError && reason.code === 'user_not_found'
                    ? messages.shareMissing
                    : messages.settingsFailed,
                );
              });
          }}
        >
          <label className="token-label" htmlFor="share-list">
            {messages.shareList}
          </label>
          <select
            id="share-list"
            className="token-name"
            value={projectId}
            onChange={(event) => {
              setPicked(event.target.value);
              setError(null);
            }}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {listLabel(list)}
              </option>
            ))}
          </select>
          <label className="token-label" htmlFor="share-email">
            {messages.shareEmail}
          </label>
          <input
            id="share-email"
            className="token-name"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <label className="token-label" htmlFor="share-permission">
            {messages.sharePermission}
          </label>
          <select
            id="share-permission"
            className="token-name"
            value={permission}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'read' || next === 'comment' || next === 'write') {
                setPermission(next);
              }
            }}
          >
            <option value="read">{messages.scopeRead}</option>
            <option value="comment">{messages.shareComment}</option>
            <option value="write">{messages.scopeWrite}</option>
          </select>
          {error !== null ? <p role="alert">{error}</p> : null}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={projectId.length === 0 || email.trim().length === 0}
          >
            {messages.shareAdd}
          </Button>
        </form>
      </section>
      <section className="token-panel is-list" aria-label={messages.settingsSharing}>
        {members.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
        {members.isSuccess && people.length === 0 ? (
          <p className="token-empty">{messages.shareEmpty}</p>
        ) : null}
        {people.map((row) => (
          <article className="token-row" key={text(row.id)}>
            <div className="token-head">
              <div>
                <h2>{text(row.display_name) || text(row.email)}</h2>
                {text(row.display_name).length > 0 ? (
                  <p className="token-meta">{text(row.email)}</p>
                ) : null}
              </div>
              <span className="token-chip">{permissionLabel(text(row.permission), messages)}</span>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

export function DataSettings() {
  const messages = useMessages();
  const locale = useAppLocale();
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.listBackups() });
  const items = itemsOf(backups.data);
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  return (
    <section className="token-settings">
      <PageTitle title={messages.settingsData} lede={messages.dataHint} />
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.exportJson}</h2>
            <p>{messages.exportEmpty}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={busy}
          onClick={() => {
            setBusy(true);
            setExportError(null);
            void api
              .exportJson()
              .then((body) => {
                const blob = new Blob([JSON.stringify(body, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'tick-tack-done.json';
                link.click();
                URL.revokeObjectURL(url);
                setExported(true);
              })
              .catch(() => {
                setExportError(messages.settingsFailed);
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {messages.exportJson}
        </Button>
        {exported ? <p role="status">{messages.exportStarted}</p> : null}
        {exportError !== null ? <p role="alert">{exportError}</p> : null}
      </section>
      <section className="token-panel is-list" aria-label={messages.settingsData}>
        <div className="token-row">
          <div className="token-head">
            <div>
              <h2>{messages.backupTitle}</h2>
              <p className="token-meta">{messages.backupEmpty}</p>
            </div>
            {backups.isFetched ? (
              <span
                className={
                  flag(backups.data, 'remote_configured') ? 'token-pill' : 'token-pill is-revoked'
                }
              >
                {flag(backups.data, 'remote_configured')
                  ? messages.backupRemoteOn
                  : messages.backupRemoteOff}
              </span>
            ) : null}
          </div>
        </div>
        {backups.isError ? <p role="alert">{messages.settingsFailed}</p> : null}
        {backups.isSuccess && items.length === 0 ? (
          <p className="token-empty">{messages.backupNone}</p>
        ) : null}
        {items.map((row) => {
          const stamp = text(row.stamp);
          const parts = [
            formatBytes(numberOf(row.bytes)),
            flag(row, 'has_database') ? messages.backupDatabase : '',
            flag(row, 'has_attachments') ? messages.backupFiles : '',
          ].filter((part) => part.length > 0);
          return (
            <article className="token-row" key={stamp}>
              <div className="token-head">
                <div>
                  <h2>{formatStamp(stamp, locale)}</h2>
                  <p className="token-meta">{parts.join(' · ')}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setBackupError(null);
                    void api
                      .restoreBackup(stamp)
                      .then((body) => {
                        setVerified(flag(body, 'verified') ? stamp : null);
                        if (!flag(body, 'verified')) {
                          setBackupError(messages.settingsFailed);
                        }
                      })
                      .catch(() => {
                        setBackupError(messages.settingsFailed);
                      });
                  }}
                >
                  {messages.backupRestore}
                </Button>
              </div>
              {verified === stamp ? (
                <p role="status">
                  {messages.backupVerified} {messages.backupKept}
                </p>
              ) : null}
            </article>
          );
        })}
        {backupError !== null ? <p role="alert">{backupError}</p> : null}
      </section>
    </section>
  );
}

export function ShortcutSettings() {
  const messages = useMessages();
  const known = new Map(SHORTCUT_ROWS.map((row) => [row[0], row[1]]));
  const groups = [
    { title: messages.shortcutGroupGeneral, keys: GENERAL_KEYS },
    { title: messages.shortcutGroupGo, keys: GO_KEYS },
  ];
  return (
    <section className="token-settings">
      <PageTitle title={messages.settingsShortcuts} lede={messages.shortcutsHint} />
      {groups.map((group) => (
        <section
          className="token-panel"
          key={group.title}
          aria-labelledby={`shortcuts-${group.title}`}
        >
          <div className="token-panel-head">
            <h2 id={`shortcuts-${group.title}`}>{group.title}</h2>
          </div>
          <div className="token-resources">
            {group.keys.map((keys) => {
              const label = known.get(keys);
              if (label === undefined) {
                return null;
              }
              return (
                <div className="token-resource" key={keys}>
                  <span>{messages[label]}</span>
                  <Kbd>{keys}</Kbd>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function PageTitle({ title, lede }: { readonly title: string; readonly lede: string }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </div>
    </header>
  );
}

function triggerLabel(trigger: unknown, messages: Messages): string {
  if (typeof trigger !== 'object' || trigger === null || !('event' in trigger)) {
    return messages.automationWhen;
  }
  const event = (trigger as { event?: unknown }).event;
  return event === 'task.completed@v1' || typeof event !== 'string'
    ? messages.automationWhen
    : event;
}

function actionTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || !('type' in item)) {
      return [];
    }
    const type = (item as { type?: unknown }).type;
    return typeof type === 'string' ? [type] : [];
  });
}

function manifestOf(value: unknown): {
  readonly name: string;
  readonly version: string;
  readonly permissions: readonly string[];
} | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  const version = typeof body.version === 'string' ? body.version : '';
  const permissions = stringsOf(body.permissions);
  if (name.length === 0 && version.length === 0 && permissions.length === 0) {
    return null;
  }
  return { name, version, permissions };
}

function permissionLabel(permission: string, messages: Messages): string {
  if (permission === 'read') {
    return messages.scopeRead;
  }
  if (permission === 'comment') {
    return messages.shareComment;
  }
  if (permission === 'write') {
    return messages.scopeWrite;
  }
  return permission;
}

function listLabel(list: Project): string {
  return list.name;
}

function formatStamp(stamp: string, locale: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (match === null) {
    return stamp;
  }
  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${String(Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function itemsOf(value: unknown): readonly Record<string, unknown>[] {
  if (typeof value !== 'object' || value === null || !('items' in value)) {
    return [];
  }
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items)
    ? items.filter(
        (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
      )
    : [];
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function flag(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && (value as Record<string, unknown>)[key] === true
  );
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
