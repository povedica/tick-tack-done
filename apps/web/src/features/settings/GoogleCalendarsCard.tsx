import { ApiError } from '@reflexionia/sdk';
import { runAction } from '../../components/run-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { dotStyle } from '../calendar/ExternalEvent';

const PALETTE = ['#4772FA', '#7C4DFF', '#00C853', '#FF6D00', '#E53935', '#00897B'];

interface RemoteCalendar {
  readonly id: string;
  readonly summary: string;
  readonly background_color: string | null;
  readonly subscription: { id: string; color: string | null; visible: boolean } | null;
}

interface LocalSubscription {
  readonly id: string;
  readonly provider: string | null;
  readonly calendar_id: string | null;
  readonly summary: string | null;
  readonly color: string | null;
  readonly visible: boolean;
  readonly last_synced_at: string | null;
  readonly last_error: string | null;
  readonly event_count: number;
}

export function GoogleCalendarsCard() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const google = useQuery({ queryKey: ['google'], queryFn: () => api.integrationStatus('google') });
  const connected = flag(google.data, 'connected');
  const remote = useQuery({
    queryKey: ['google-calendars'],
    queryFn: () => api.listGoogleCalendars(),
    enabled: connected,
  });
  const local = useQuery({
    queryKey: ['calendar-subscriptions'],
    queryFn: () => api.listCalendarSubscriptions(),
    enabled: connected,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingOn, setPendingOn] = useState<Readonly<Record<string, true>>>({});
  const calendars = Array.isArray(remote.data) ? remote.data.filter(isRemote) : [];
  const subscriptions = itemsOf(local.data).filter(isLocal);
  const refresh = (): void => {
    runAction(queryClient.invalidateQueries({ queryKey: ['google-calendars'] }));
    runAction(queryClient.invalidateQueries({ queryKey: ['calendar-subscriptions'] }));
    runAction(queryClient.invalidateQueries({ queryKey: ['calendar-events'] }));
  };
  const sync = useMutation({
    mutationFn: (id: string) => api.refreshCalendarSubscription(id),
    onSuccess: refresh,
  });
  if (google.data === undefined) {
    return (
      <section className="token-panel" aria-label={messages.googleCalendars}>
        <h2>{messages.googleCalendars}</h2>
        {google.isPending ? (
          <SkeletonRows />
        ) : (
          <ErrorState
            title={messages.calendarLoadFailed}
            retryLabel={messages.retry}
            onRetry={() => {
              runAction(google.refetch());
            }}
          />
        )}
      </section>
    );
  }
  if (!connected) {
    return (
      <section className="token-panel">
        <h2>{messages.googleCalendars}</h2>
        <p>
          {messages.googleConnectHint}{' '}
          <Link to="/settings/integrations">{messages.settingsIntegrations}</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="token-panel" aria-label={messages.googleCalendars}>
      <div className="token-panel-head">
        <div>
          <h2>{messages.googleCalendars}</h2>
          {offline ? <p className="ui-danger">{messages.offline}</p> : null}
          {remote.error instanceof ApiError && remote.error.code === 'google_reconnect_required' ? (
            <p role="alert">
              {messages.googleReconnectHint}{' '}
              <Link to="/settings/integrations">{messages.googleReconnect}</Link>
            </p>
          ) : null}
          {remote.isError ? (
            <p className="ui-danger">
              {messages.syncError}{' '}
              <Link to="/settings/integrations">{messages.googleScopeMissing}</Link>
            </p>
          ) : null}
        </div>
      </div>
      {remote.isPending || local.isPending ? <SkeletonRows /> : null}
      {local.isError ? (
        <ErrorState
          title={messages.calendarLoadFailed}
          retryLabel={messages.retry}
          onRetry={() => {
            runAction(local.refetch());
          }}
        />
      ) : null}
      {remote.error instanceof ApiError && remote.error.code === 'google_reconnect_required' ? (
        <p role="alert">
          {messages.googleReconnectHint}{' '}
          <Link to="/settings/integrations">{messages.googleReconnect}</Link>
        </p>
      ) : null}
      {remote.isError ? (
        <ErrorState
          title={messages.calendarLoadFailed}
          retryLabel={messages.retry}
          onRetry={() => {
            runAction(remote.refetch());
          }}
        />
      ) : null}
      {remote.isSuccess &&
      local.isSuccess &&
      calendars.length === 0 &&
      subscriptions.length === 0 ? (
        <p className="token-empty">{messages.externalEmptyTitle}</p>
      ) : null}
      {calendars.map((calendar) => {
        const subscription =
          calendar.subscription === null
            ? (subscriptions.find((row) => row.calendar_id === calendar.id) ?? null)
            : (subscriptions.find((row) => row.id === calendar.subscription?.id) ?? null);
        const active = subscription !== null || pendingOn[calendar.id] === true;
        const color = subscription?.color ?? calendar.background_color ?? PALETTE[0];
        return (
          <article className="token-row" key={calendar.id}>
            <div className="token-head">
              <label>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => {
                    if (!navigator.onLine) {
                      setOffline(true);
                      return;
                    }
                    setOffline(false);
                    if (!active) {
                      setPendingOn((current) => ({ ...current, [calendar.id]: true }));
                      setBusy(calendar.id);
                      void api
                        .createCalendarSubscription({
                          provider: 'google',
                          calendar_id: calendar.id,
                          color,
                        })
                        .then(() => {
                          refresh();
                        })
                        .catch(() => {
                          setPendingOn((current) =>
                            Object.fromEntries(
                              Object.entries(current).filter(([key]) => key !== calendar.id),
                            ),
                          );
                        })
                        .finally(() => {
                          setBusy(null);
                        });
                      return;
                    }
                    if (subscription !== null) {
                      setConfirmId(subscription.id);
                    }
                  }}
                />
                <span className="cal-dot" style={dotStyle(color)} />
                {subscription === null ? (
                  calendar.summary
                ) : (
                  <input
                    aria-label={calendar.summary}
                    defaultValue={subscription.summary ?? calendar.summary}
                    onBlur={(event) => {
                      const summary = event.target.value.trim();
                      if (summary.length === 0 || summary === subscription.summary) {
                        return;
                      }
                      runAction(
                        api.updateCalendarSubscription(subscription.id, { summary }).then(refresh),
                      );
                    }}
                  />
                )}
              </label>
              {subscription !== null ? (
                <p className="token-meta">
                  {messages.lastSync.replace(
                    '{when}',
                    relative(subscription.last_synced_at, locale, messages),
                  )}
                  {' · '}
                  {subscription.event_count}
                </p>
              ) : null}
              {subscription?.last_error !== null && subscription?.last_error !== undefined ? (
                <p className="ui-danger">{messages.syncError}</p>
              ) : null}
            </div>
            {subscription !== null ? (
              <span className="token-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={subscription.visible}
                    onChange={() => {
                      runAction(
                        api
                          .updateCalendarSubscription(subscription.id, {
                            visible: !subscription.visible,
                          })
                          .then(refresh),
                      );
                    }}
                  />
                  {messages.showOnCalendar}
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={sync.isPending && busy === subscription.id}
                  onClick={() => {
                    if (!navigator.onLine) {
                      setOffline(true);
                      return;
                    }
                    setBusy(subscription.id);
                    sync.mutate(subscription.id, {
                      onSettled: () => {
                        setBusy(null);
                      },
                    });
                  }}
                >
                  {busy === subscription.id ? messages.saving : messages.syncNow}
                </Button>
                {PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className="cal-dot"
                    style={dotStyle(swatch)}
                    aria-label={swatch}
                    onClick={() => {
                      runAction(
                        api
                          .updateCalendarSubscription(subscription.id, { color: swatch })
                          .then(refresh),
                      );
                    }}
                  />
                ))}
              </span>
            ) : null}
            {confirmId !== null && subscription?.id === confirmId ? (
              <div className="token-confirm">
                <p>
                  {messages.googleHideConfirm.replace('{count}', String(subscription.event_count))}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    runAction(
                      api.deleteCalendarSubscription(subscription.id).then(() => {
                        setConfirmId(null);
                        refresh();
                      }),
                    );
                  }}
                >
                  {messages.remove}
                </Button>
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
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function relative(iso: string | null, locale: string, messages: Messages): string {
  if (iso === null || iso.length === 0) {
    return messages.syncError;
  }
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-minutes, 'minute');
}

function flag(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && (value as Record<string, unknown>)[key] === true
  );
}

function itemsOf(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null || !('items' in value)) {
    return [];
  }
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

function isRemote(value: unknown): value is RemoteCalendar {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; summary?: unknown };
  return typeof row.id === 'string' && typeof row.summary === 'string';
}

function isLocal(value: unknown): value is LocalSubscription {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown };
  return typeof row.id === 'string';
}
