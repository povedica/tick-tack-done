import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button, EmptyState } from '../../components/ui';
import { InboundEmailCard } from '../settings/InboundEmailCard';
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

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function idCount(value: unknown, key: string): number {
  if (typeof value !== 'object' || value === null) {
    return 0;
  }
  const ids = (value as Record<string, unknown>)[key];
  return Array.isArray(ids) ? ids.length : 0;
}

function CountCard({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <article className="widget">
      <h3>{label}</h3>
      <p className="detail-title">{value}</p>
    </article>
  );
}

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

const WIDGET_LABEL = {
  completed_today: 'widgetCompletedToday',
  completed_week: 'widgetCompletedWeek',
  overdue: 'widgetOverdue',
  next_7_days: 'widgetNext7',
  flow: 'widgetCreated',
  habits: 'widgetHabit',
  load: 'widgetTrend',
  calendar: 'calendarTitle',
  integrations: 'settingsIntegrations',
  focus: 'navFocus',
} as const;

function widgetLabel(messages: ReturnType<typeof useMessages>, key: string): string {
  if (!Object.hasOwn(WIDGET_LABEL, key)) {
    return key;
  }
  return messages[WIDGET_LABEL[key as keyof typeof WIDGET_LABEL]];
}

function asText(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  return '0';
}

function widgetText(messages: ReturnType<typeof useMessages>, key: string, value: unknown): string {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const row = value as Record<string, unknown>;
  if (key === 'completed_week') {
    return `${asText(row.value)} · ${messages.widgetTrend} ${asText(row.trend)}`;
  }
  if (key === 'flow') {
    return `${messages.widgetCreated} ${asText(row.created)} · ${messages.widgetCompleted} ${asText(row.completed)} · ${messages.widgetNet} ${asText(row.net)}`;
  }
  if (key === 'habits') {
    return `${asText(row.percent)}%`;
  }
  if (key === 'focus') {
    const seconds = typeof row.seconds === 'number' ? row.seconds : 0;
    return clock(seconds);
  }
  if (key === 'calendar') {
    return asText(row.upcoming);
  }
  if (key === 'integrations') {
    return Object.entries(row)
      .map(([name, on]) => `${name}: ${on === true ? messages.online : messages.offline}`)
      .join(' · ');
  }
  return '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function DashboardPage() {
  const messages = useMessages();
  const data = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboardData() });
  const score = useQuery({ queryKey: ['achievements'], queryFn: () => api.achievements() });
  const widgets = isRow(data.data?.widgets) ? data.data.widgets : {};
  return (
    <section className="screen-page is-wide">
      <h1>{messages.dashboardTitle}</h1>
      <p>{messages.gardenImportHint}</p>
      <div className="widget-grid">
        {Object.entries(widgets).map(([key, value]) => (
          <article key={key} className="widget">
            <h3>{widgetLabel(messages, key)}</h3>
            <p>{widgetText(messages, key, value)}</p>
          </article>
        ))}
      </div>
      {score.data !== undefined ? (
        <p>
          {score.data.enabled === true ? messages.achievementsOn : messages.achievementsOff}
          {typeof score.data.score === 'number' ? ` · ${String(score.data.score)}` : ''}
        </p>
      ) : null}
      <Button
        onClick={() => {
          void api.setAchievements(score.data?.enabled !== true).then(() => {
            void score.refetch();
          });
        }}
      >
        {score.data?.enabled === true ? messages.achievementsOff : messages.achievementsOn}
      </Button>
    </section>
  );
}

export function ReportsPage() {
  const messages = useMessages();
  const { week } = useParams();
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ['weekly-reports'], queryFn: () => api.weeklyReports() });
  const rows = itemsOf(reports.data);
  const current = week === undefined ? rows[0] : rows.find((row) => text(row.week) === week);
  return (
    <section className="screen-page">
      <h1>{messages.reportsTitle}</h1>
      <Button
        variant="primary"
        onClick={() => {
          void api.buildWeeklyReport().then(() => {
            void queryClient.invalidateQueries({ queryKey: ['weekly-reports'] });
          });
        }}
      >
        {messages.reportBuild}
      </Button>
      {rows.length === 0 ? (
        <EmptyState title={messages.reportsTitle} body={messages.reportEmpty} />
      ) : null}
      <ul>
        {rows.map((row) => (
          <li key={text(row.week)}>
            <Link to={`/reports/weekly/${text(row.week)}`}>{text(row.week)}</Link>
          </li>
        ))}
      </ul>
      {current !== undefined ? (
        <p>{text((current.payload as { summary?: unknown } | undefined)?.summary)}</p>
      ) : null}
    </section>
  );
}

export function ReviewPage() {
  const messages = useMessages();
  const daily = useQuery({ queryKey: ['review-daily'], queryFn: () => api.reviewDaily() });
  const weekly = useQuery({ queryKey: ['review-weekly'], queryFn: () => api.reviewWeekly() });
  return (
    <section className="screen-page">
      <h1>{messages.reviewTitle}</h1>
      <p>{messages.reviewLead}</p>
      <ul className="widget-grid">
        <CountCard label={messages.reviewProposed} value={idCount(daily.data, 'task_ids')} />
        <CountCard label={messages.reviewOverdue} value={idCount(weekly.data, 'overdue_ids')} />
        <CountCard label={messages.reviewUndated} value={idCount(weekly.data, 'undated_ids')} />
        <CountCard label={messages.reviewStale} value={idCount(weekly.data, 'stale_list_ids')} />
        <CountCard label={messages.reviewHabits} value={idCount(weekly.data, 'habits_at_risk')} />
      </ul>
    </section>
  );
}

export function FocusPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['focus-sessions'],
    queryFn: () => api.listFocusSessions(),
  });
  const settings = useQuery({
    queryKey: ['focus-settings'],
    queryFn: () => api.getFocusSettings(),
  });
  const stats = useQuery({ queryKey: ['focus-stats'], queryFn: () => api.focusStats() });
  const rows = itemsOf(sessions.data);
  const live = rows.find((row) => row.ended_at === null && numberOf(row.remaining_seconds) > 0);
  const taskId = typeof live?.task_id === 'string' ? live.task_id : '';
  const focused = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.taskDetail(taskId),
    enabled: taskId.length > 0,
  });
  const started = typeof live?.started_at === 'string' ? live.started_at : null;
  const planned =
    typeof live?.planned_minutes === 'number'
      ? live.planned_minutes
      : typeof settings.data?.pomodoroMinutes === 'number'
        ? settings.data.pomodoroMinutes
        : 25;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (started === null) {
      return;
    }
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [started]);
  const remaining =
    started === null
      ? planned * 60
      : Math.max(0, planned * 60 - Math.floor((now - Date.parse(started)) / 1000));
  useEffect(() => {
    if (started === null || remaining > 0) {
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(messages.focusDone);
    }
    document.title = messages.focusDone;
  }, [messages.focusDone, remaining, started]);
  const pomodoros = numberOf(stats.data?.completed_pomodoros);
  const minutes = Math.round(numberOf(stats.data?.focus_seconds) / 60);
  const streak = numberOf(stats.data?.streak_days);
  return (
    <section className="screen-page">
      <h1>{messages.focusTitle}</h1>
      <p>{messages.focusHint}</p>
      <p className="ui-muted">
        {messages.streakLabel} {String(streak)} · {messages.focusPomodoros} {String(pomodoros)} ·{' '}
        {messages.focusMinutes} {String(minutes)}
      </p>
      {focused.data !== undefined ? (
        <p>
          <Link to={`/list/${focused.data.project_id}?task=${focused.data.id}`}>{focused.data.title}</Link>
        </p>
      ) : null}
      <p className="detail-title">{clock(remaining)}</p>
      {started === null ? (
        <div className="page-toolbar">
          {[15, 25, 50].map((minutes) => (
            <Button
              key={minutes}
              onClick={() => {
                void api.updateFocusSettings({ pomodoro_minutes: minutes }).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['focus-settings'] });
                });
              }}
            >
              {String(minutes)}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="page-toolbar">
        {typeof live?.id === 'string' ? (
          <>
            <Button
              variant="primary"
              onClick={() => {
                void api.finishFocus(live.id as string).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['focus-sessions'] });
                  void queryClient.invalidateQueries({ queryKey: ['focus-stats'] });
                });
              }}
            >
              {messages.focusFinish}
            </Button>
            <Button
              onClick={() => {
                void api.abortFocus(live.id as string).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['focus-sessions'] });
                  void queryClient.invalidateQueries({ queryKey: ['focus-stats'] });
                });
              }}
            >
              {messages.cancel}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              void api.startFocus().then(() => {
                void queryClient.invalidateQueries({ queryKey: ['focus-sessions'] });
              });
            }}
          >
            {messages.focusStart}
          </Button>
        )}
      </div>
    </section>
  );
}

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
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.feedCreate}</h2>
            <p>{messages.calendarFeedHint}</p>
          </div>
        </div>
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (projectId.length === 0) {
              return;
            }
            void api.createCalendarFeed(projectId).then((body) => {
              setUrl(text(body.url));
              setCopied(false);
              void queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] });
            });
          }}
        >
          <label className="token-label" htmlFor="calendar-list">
            {messages.shareList}
          </label>
          <select
            id="calendar-list"
            className="token-name is-short"
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
          <Button type="submit" variant="primary" size="sm" disabled={projectId.length === 0}>
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
              {copied ? messages.copied : messages.webhookCopySecret}
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
                    void api.rotateCalendarFeed(id).then((body) => {
                      setUrl(text(body.url));
                      setCopied(false);
                    });
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
                        void api.revokeCalendarFeed(id).then(() => {
                          setConfirmId(null);
                          void queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] });
                        });
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
          {google.isFetched ? (
            <StatusPill
              on={googleOn}
              onLabel={messages.integrationConnected}
              offLabel={
                flag(google.data, 'configured') ? messages.integrationIdle : messages.integrationOff
              }
            />
          ) : null}
        </div>
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
  const [params] = useSearchParams();
  const googleFlag = params.get('google');
  const telegram = useQuery({
    queryKey: ['telegram'],
    queryFn: () => api.integrationStatus('telegram'),
  });
  const drive = useQuery({ queryKey: ['drive'], queryFn: () => api.integrationStatus('drive') });
  const google = useQuery({ queryKey: ['google'], queryFn: () => api.integrationStatus('google') });
  const googleOn = flag(google.data, 'connected');
  const googleReady = flag(google.data, 'configured');
  const account = text(google.data?.account);
  function connectGoogle(): void {
    void api.googleConnect().then((body) => {
      const url = text(body.url);
      if (url.startsWith('https://accounts.google.com/')) {
        window.location.assign(url);
      }
    });
  }
  const voice = flag(telegram.data, 'voice');
  const photo = flag(telegram.data, 'photo');
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsIntegrations}</h1>
          <p className="lede">{messages.integrationsHint}</p>
        </div>
      </header>
      {googleFlag === 'connected' ? (
        <p className="token-meta" role="status">
          {messages.googleConnectedNote}
        </p>
      ) : null}
      {googleFlag === 'error' ? <p role="alert">{messages.googleErrorNote}</p> : null}

      <section className="token-panel" aria-labelledby="google-title">
        <div className="token-panel-head">
          <div>
            <h2 id="google-title">Google</h2>
            <p>{messages.googleHint}</p>
          </div>
          {google.isFetched ? (
            <StatusPill
              on={googleOn}
              onLabel={messages.integrationConnected}
              offLabel={googleReady ? messages.integrationIdle : messages.integrationOff}
            />
          ) : null}
        </div>
        {account.length > 0 ? <p className="token-meta">{account}</p> : null}
        {googleReady && !googleOn ? (
          <Button type="button" variant="primary" size="sm" onClick={connectGoogle}>
            {messages.googleConnect}
          </Button>
        ) : null}
        {googleOn ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void api.disconnectGoogle().then(() => {
                void google.refetch();
                void drive.refetch();
              });
            }}
          >
            {messages.googleDisconnect}
          </Button>
        ) : null}
      </section>

      <section className="token-panel" aria-labelledby="drive-title">
        <div className="token-panel-head">
          <div>
            <h2 id="drive-title">Drive</h2>
            <p>{messages.driveNeedsGoogle}</p>
          </div>
          {drive.isFetched ? (
            <StatusPill
              on={flag(drive.data, 'connected')}
              onLabel={messages.integrationConnected}
              offLabel={
                flag(drive.data, 'configured') ? messages.integrationIdle : messages.integrationSoon
              }
            />
          ) : null}
        </div>
        {flag(drive.data, 'configured') && !flag(drive.data, 'connected') ? (
          <Button type="button" variant="primary" size="sm" onClick={connectGoogle}>
            {messages.googleConnect}
          </Button>
        ) : null}
        {flag(drive.data, 'connected') ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void api.disconnectGoogle().then(() => {
                void google.refetch();
                void drive.refetch();
              });
            }}
          >
            {messages.googleDisconnect}
          </Button>
        ) : null}
      </section>

      <section className="token-panel" aria-labelledby="telegram-title">
        <div className="token-panel-head">
          <div>
            <h2 id="telegram-title">Telegram</h2>
            <p>{flag(telegram.data, 'linked') ? messages.telegramHint : messages.telegramSoon}</p>
          </div>
          {telegram.isFetched ? (
            <StatusPill
              on={flag(telegram.data, 'linked')}
              onLabel={messages.integrationConnected}
              offLabel={
                flag(telegram.data, 'configured')
                  ? messages.integrationIdle
                  : messages.integrationSoon
              }
            />
          ) : null}
        </div>
        {voice || photo ? (
          <ul className="token-chips">
            {voice ? <li className="token-chip">{messages.telegramVoice}</li> : null}
            {photo ? <li className="token-chip">{messages.telegramPhoto}</li> : null}
          </ul>
        ) : null}
        {flag(telegram.data, 'linked') ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void api.disconnectTelegram().then(() => {
                void telegram.refetch();
              });
            }}
          >
            {messages.googleDisconnect}
          </Button>
        ) : (
          <Button type="button" size="sm" disabled>
            {messages.integrationSoon}
          </Button>
        )}
      </section>

      <InboundEmailCard />
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
        void api.reportLocation(position.coords.latitude, position.coords.longitude);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    );
  }, []);
  return null;
}
