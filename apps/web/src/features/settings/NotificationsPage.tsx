import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_CHANNELS,
  notificationDefault,
  type NotificationChannel,
  type NotificationKind,
} from '@reflexionia/domain';
import { api } from '../../api';
import { ApiError } from '@reflexionia/sdk';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { runAction } from '../../components/run-action';
import { LegacyNotificationSettings } from './LegacyNotificationSettings';
import './notifications.css';
function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function permission() {
  return typeof Notification === 'undefined' ? 'missing' : Notification.permission;
}
export function NotificationsPage() {
  const m = useMessages();
  const locale = useAppLocale();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api.getNotificationSettings(),
    refetchInterval: 4000,
  });
  const history = useInfiniteQuery({
    queryKey: ['notification-deliveries'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.notificationDeliveries(pageParam),
    getNextPageParam: (page) =>
      typeof page.next_cursor === 'string' ? page.next_cursor : undefined,
  });
  const [push, setPush] = useState(permission);
  const [status, setStatus] = useState<Partial<Record<NotificationChannel, string>>>({});
  const [error, setError] = useState('');
  const [quiet, setQuiet] = useState<{
    start: string;
    end: string;
    days: number[];
    allow_high: boolean;
  } | null>(null);
  const telegram = object(object(query.data?.channels).telegram);
  const email = object(object(query.data?.channels).email);
  const activatePush = async () => {
    try {
      const next = await Notification.requestPermission();
      setPush(next);
      if (next !== 'granted') return;
      const key = text(object(object(query.data?.channels).push).public_key);
      if (!key) throw new Error(m.notificationUnavailable);
      const registration = await navigator.serviceWorker.ready;
      const padding = '='.repeat((4 - (key.length % 4)) % 4);
      const bytes = Uint8Array.from(
        atob((key + padding).replace(/-/g, '+').replace(/_/g, '/')),
        (char) => char.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
        throw new Error(m.notificationUnavailable);
      await api.registerPushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : m.notificationFailed);
    }
  };
  const savedQuiet = object(query.data?.quiet_hours);
  const quietValue = quiet ?? {
    start: text(savedQuiet.start),
    end: text(savedQuiet.end),
    days: Array.isArray(savedQuiet.days)
      ? savedQuiet.days.filter((day): day is number => typeof day === 'number')
      : [0, 1, 2, 3, 4, 5, 6],
    allow_high: savedQuiet.allow_high === true,
  };
  const labels: Record<NotificationKind, string> = {
    task: m.notificationTask,
    focus_end: m.notificationFocus,
    daily_digest: m.notificationDaily,
    shutdown_digest: m.notificationShutdown,
    overdue: m.notificationOverdue,
    due_soon: m.notificationDueSoon,
    habit: m.notificationHabit,
    countdown: m.notificationCountdown,
  };
  const channels: Record<NotificationChannel, string> = {
    push: m.notificationPush,
    email: m.notificationEmail,
    telegram: m.notificationTelegram,
  };
  const kindLabels: Partial<Record<string, string>> = labels;
  const channelLabels: Partial<Record<string, string>> = channels;
  const enabled = (kind: NotificationKind, channel: NotificationChannel) =>
    list(query.data?.preferences).find((pref) => pref.kind === kind && pref.channel === channel)
      ?.enabled ?? notificationDefault(kind, channel, telegram.linked === true);
  const save = async (body: Parameters<typeof api.updateNotificationSettings>[0]) => {
    try {
      setError('');
      const saved = await api.updateNotificationSettings(body);
      cache.setQueryData(['notification-settings'], saved);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : m.saveFailed);
    }
  };
  const test = async (channel: NotificationChannel) => {
    try {
      await api.testNotification(channel);
      setStatus((old) => ({ ...old, [channel]: m.notificationSent }));
      runAction(history.refetch());
    } catch (caught) {
      setStatus((old) => ({
        ...old,
        [channel]:
          caught instanceof ApiError ? `${caught.code}: ${caught.message}` : m.notificationFailed,
      }));
    }
  };
  const states: Record<string, string> = {
    scheduled: m.notificationScheduled,
    fired: m.notificationFired,
    failed: m.notificationFailed,
    skipped: m.notificationSkipped,
    disconnected: m.notificationDisconnected,
  };
  const reasons: Record<string, string> = {
    quiet_hours: m.notificationQuietReason,
    disabled_by_user: m.notificationDisabledReason,
    not_linked: m.notificationNotLinked,
    blocked: m.notificationBlocked,
    channel_unavailable: m.notificationUnavailable,
  };
  if (query.isPending) return <SkeletonRows />;
  if (query.isError)
    return (
      <ErrorState
        title={m.loadFailed}
        retryLabel={m.retry}
        onRetry={() => {
          runAction(query.refetch());
        }}
      />
    );
  return (
    <section className="notifications-page token-settings">
      <h1>{m.settingsNotifications}</h1>
      <div className="notification-matrix-wrap">
        <table className="notification-matrix" aria-label={m.notificationMatrix}>
          <thead>
            <tr>
              <th scope="col">{m.notificationMatrix}</th>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <th scope="col" key={channel}>
                  <span>{channels[channel]}</span>
                  <small
                    className="notification-channel-state"
                    title={channel === 'email' ? text(email.address) : undefined}
                  >
                    {channel === 'push'
                      ? push === 'granted'
                        ? m.notificationPushGranted
                        : push === 'denied'
                          ? m.notificationPushDenied
                          : push === 'default'
                            ? m.notificationPushDefault
                            : m.notificationPushMissing
                      : channel === 'email'
                        ? text(email.address)
                        : telegram.status === 'blocked'
                          ? m.notificationBlocked
                          : telegram.linked === true
                            ? `@${text(telegram.username)}`
                            : m.notificationNotLinked}
                  </small>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={channel === 'telegram' && telegram.linked !== true}
                    title={
                      channel === 'telegram' && telegram.linked !== true
                        ? m.notificationNotLinked
                        : undefined
                    }
                    onClick={() => {
                      runAction(test(channel));
                    }}
                  >
                    {m.notificationTest}
                  </Button>
                  {status[channel] ? <small role="status">{status[channel]}</small> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_KINDS.map((kind) => (
              <tr key={kind}>
                <th scope="row">{labels[kind]}</th>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <td key={channel}>
                    <button
                      className="notification-switch"
                      type="button"
                      role="switch"
                      aria-label={`${labels[kind]} · ${channels[channel]}`}
                      aria-checked={enabled(kind, channel) === true}
                      disabled={channel === 'telegram' && telegram.linked !== true}
                      title={
                        channel === 'telegram' && telegram.linked !== true
                          ? m.notificationNotLinked
                          : undefined
                      }
                      onClick={() => {
                        runAction(
                          save({
                            preferences: [
                              { kind, channel, enabled: enabled(kind, channel) !== true },
                            ],
                          }),
                        );
                      }}
                    >
                      <span aria-hidden="true" />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {telegram.status === 'blocked' ? <p role="alert">{m.notificationBlockedHelp}</p> : null}
      {push !== 'missing' && push !== 'denied' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            runAction(activatePush());
          }}
        >
          {m.notificationEnablePush}
        </Button>
      ) : null}
      {push === 'denied' ? (
        <details className="notification-guides">
          <summary>{m.notificationGuides}</summary>
          {[
            m.notificationChromeGuide,
            m.notificationEdgeGuide,
            m.notificationFirefoxGuide,
            m.notificationSafariGuide,
            m.notificationIosGuide,
          ].map((guide) => (
            <p key={guide}>{guide}</p>
          ))}
        </details>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setPush(permission());
          runAction(query.refetch());
        }}
      >
        {m.notificationRecheck}
      </Button>
      <form
        className="notification-quiet"
        onSubmit={(event) => {
          event.preventDefault();
          runAction(
            save({
              quiet_hours: {
                ...quietValue,
                start: quietValue.start || null,
                end: quietValue.end || null,
              },
            }),
          );
        }}
      >
        <h2>{m.notificationQuiet}</h2>
        <div className="notification-quiet-times">
          <label>
            {m.notificationQuietStart}
            <input
              type="time"
              value={quietValue.start}
              onChange={(event) => {
                setQuiet({ ...quietValue, start: event.target.value });
              }}
            />
          </label>
          <label>
            {m.notificationQuietEnd}
            <input
              type="time"
              value={quietValue.end}
              onChange={(event) => {
                setQuiet({ ...quietValue, end: event.target.value });
              }}
            />
          </label>
        </div>
        <div className="notification-weekdays">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <button
              type="button"
              key={day}
              aria-pressed={quietValue.days.includes(day)}
              onClick={() => {
                setQuiet({
                  ...quietValue,
                  days: quietValue.days.includes(day)
                    ? quietValue.days.filter((value) => value !== day)
                    : [...quietValue.days, day],
                });
              }}
            >
              {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
                new Date(Date.UTC(2026, 9, 18 + day)),
              )}
            </button>
          ))}
        </div>
        <label className="notification-allow-high">
          <input
            type="checkbox"
            checked={quietValue.allow_high}
            onChange={(event) => {
              setQuiet({ ...quietValue, allow_high: event.target.checked });
            }}
          />
          {m.notificationAllowHigh}
        </label>
        <Button type="submit" size="sm">
          {m.saveChanges}
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <section className="notification-history">
        <h2>{m.notificationHistory}</h2>
        {history.data?.pages
          .flatMap((page) => list(page.items))
          .map((row) => (
            <article key={text(row.id)}>
              <time>
                {new Date(text(row.created_at)).toLocaleString(locale, {
                  timeZone:
                    text(query.data.time_zone) || Intl.DateTimeFormat().resolvedOptions().timeZone,
                })}
              </time>
              <span>
                {kindLabels[text(row.kind)] ?? text(row.kind)} ·{' '}
                {channelLabels[text(row.channel)] ?? text(row.channel)}
              </span>
              <span>
                {states[text(row.status)] ?? text(row.status)}
                {row.reason ? ` · ${reasons[text(row.reason)] ?? text(row.reason)}` : ''}
              </span>
            </article>
          ))}
        {history.isError ? <p role="alert">{m.loadFailed}</p> : null}
        {history.hasNextPage ? (
          <Button
            size="sm"
            disabled={history.isFetchingNextPage}
            onClick={() => {
              runAction(history.fetchNextPage());
            }}
          >
            {m.notificationMore}
          </Button>
        ) : null}
      </section>
      <details>
        <summary>{m.notificationAdvanced}</summary>
        <LegacyNotificationSettings />
      </details>
    </section>
  );
}
