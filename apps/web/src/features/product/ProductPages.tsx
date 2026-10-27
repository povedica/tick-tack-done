import { GoogleIntegrationCards } from '../settings/DriveCard';
import { TelegramCard } from '../settings/TelegramCard';
import { runAction } from '../../components/run-action';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { InboundEmailCard } from '../settings/InboundEmailCard';
import { GoogleCalendarsCard } from '../settings/GoogleCalendarsCard';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';

function itemsOf(value: unknown): readonly Record<string, unknown>[] {
  if (typeof value !== 'object' || value === null || !('items' in value)) {
    return [];
  }
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter(isRow) : [];
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export { DashboardPage } from '../dashboard/DashboardPage';

export { ReportsPage, ReviewPage } from './WeeklyPages';

export { FocusPage } from '../focus/FocusPage';

export function CalendarSettings() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const feeds = useQuery({ queryKey: ['calendar-feeds'], queryFn: () => api.listCalendarFeeds() });
  const google = useQuery({ queryKey: ['google'], queryFn: () => api.integrationStatus('google') });
  const lists = projects.data?.items ?? [];
  const [picked, setPicked] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const projectId = picked.length > 0 ? picked : (lists[0]?.id ?? '');
  const googleOn = flag(google.data, 'connected');
  const feedRows = itemsOf(feeds.data);
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsCalendar}</h1>
          <p className="lede">{messages.calendarLede}</p>
        </div>
      </header>
      <GoogleCalendarsCard />
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.feedCreate}</h2>
            <p>{messages.calendarFeedHint}</p>
          </div>
        </div>
        {projects.isPending ? <SkeletonRows /> : null}
        {projects.isError ? (
          <ErrorState
            title={messages.calendarLoadFailed}
            retryLabel={messages.retry}
            onRetry={() => {
              runAction(projects.refetch());
            }}
          />
        ) : null}
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (projectId.length === 0 || !projects.isSuccess) {
              return;
            }
            runAction(
              api.createCalendarFeed(projectId).then((body) => {
                setUrl(text(body.url));
                setCopied(false);
                runAction(queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] }));
              }),
            );
          }}
        >
          <label className="token-label" htmlFor="calendar-list">
            {messages.shareList}
          </label>
          <select
            id="calendar-list"
            className="token-name is-short"
            disabled={!projects.isSuccess}
            value={projectId}
            onChange={(event) => {
              setPicked(event.target.value);
            }}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={projectId.length === 0 || !projects.isSuccess}
          >
            {messages.feedCreate}
          </Button>
        </form>
        {url !== null && url.length > 0 ? (
          <div className="token-secret">
            <p>{messages.calendarFeedHint}</p>
            <code>{url}</code>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(
                  () => {
                    setCopied(true);
                  },
                  () => {
                    setCopied(false);
                  },
                );
              }}
            >
              {copied ? messages.copied : messages.feedCopyUrl}
            </Button>
          </div>
        ) : null}
      </section>
      <section className="token-panel is-list" aria-label={messages.feedList}>
        <div className="token-panel-head">
          <div>
            <h2>{messages.feedList}</h2>
            <p>{messages.calendarFeedHint}</p>
          </div>
        </div>
        {feeds.isPending ? <SkeletonRows /> : null}
        {feeds.isError ? (
          <ErrorState
            title={messages.calendarLoadFailed}
            retryLabel={messages.retry}
            onRetry={() => {
              runAction(feeds.refetch());
            }}
          />
        ) : null}
        {feeds.isSuccess && feedRows.length === 0 ? (
          <p className="token-empty">{messages.feedEmptyList}</p>
        ) : null}
        {feedRows.map((row) => {
          const id = text(row.id);
          const projectId = text(row.project_id);
          const list = lists.find((item) => item.id === projectId);
          const created = text(row.created_at);
          return (
            <article className="token-row" key={id}>
              <div className="token-head">
                <div>
                  <h2>{list?.name ?? projectId}</h2>
                  {created.length > 0 ? (
                    <p className="token-meta">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(created))}
                    </p>
                  ) : null}
                </div>
              </div>
              <span className="token-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    runAction(
                      api.rotateCalendarFeed(id).then((body) => {
                        setUrl(text(body.url));
                        setCopied(false);
                      }),
                    );
                  }}
                >
                  {messages.feedRotate}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setConfirmId(id);
                  }}
                >
                  {messages.revoke}
                </Button>
              </span>
              {confirmId === id ? (
                <div className="token-confirm">
                  <p>{messages.feedRevokeBody}</p>
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
                          api.revokeCalendarFeed(id).then(() => {
                            setConfirmId(null);
                            runAction(
                              queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] }),
                            );
                          }),
                        );
                      }}
                    >
                      {messages.revoke}
                    </Button>
                  </span>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
      <section className="token-panel" aria-labelledby="calendar-google-title">
        <div className="token-panel-head">
          <div>
            <h2 id="calendar-google-title">Google</h2>
            <p>{messages.calendarGoogleHint}</p>
          </div>
          {google.data !== undefined ? (
            <StatusPill
              on={googleOn}
              onLabel={messages.integrationConnected}
              offLabel={
                flag(google.data, 'configured') ? messages.integrationIdle : messages.integrationOff
              }
            />
          ) : null}
        </div>
        {google.isPending ? <SkeletonRows /> : null}
        {google.isError ? (
          <ErrorState
            title={messages.calendarLoadFailed}
            retryLabel={messages.retry}
            onRetry={() => {
              runAction(google.refetch());
            }}
          />
        ) : null}
        {text(google.data?.account).length > 0 ? (
          <p className="token-meta">{text(google.data?.account)}</p>
        ) : null}
        <Link className="ui-button is-sm" to="/settings/integrations">
          {messages.calendarOpenIntegrations}
        </Link>
      </section>
    </section>
  );
}

export function IntegrationSettings() {
  const messages = useMessages();
  return (
    <section className="token-settings integrations-page">
      <header className="page-header">
        <div>
          <h1>{messages.settingsIntegrations}</h1>
          <p className="lede">{messages.integrationsHint}</p>
        </div>
      </header>
      <div className="integration-list">
        <GoogleIntegrationCards />
        <TelegramCard />
        <InboundEmailCard />
      </div>
    </section>
  );
}

function StatusPill({
  on,
  onLabel,
  offLabel,
}: {
  readonly on: boolean;
  readonly onLabel: string;
  readonly offLabel: string;
}) {
  return (
    <span className={on ? 'token-pill' : 'token-pill is-revoked'}>{on ? onLabel : offLabel}</span>
  );
}

function flag(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && (value as Record<string, unknown>)[key] === true
  );
}

export function LocationWatch() {
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        runAction(api.reportLocation(position.coords.latitude, position.coords.longitude));
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    );
  }, []);
  return null;
}
