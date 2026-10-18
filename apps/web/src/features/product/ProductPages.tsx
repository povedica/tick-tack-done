import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button, EmptyState } from '../../components/ui';
import { useMessages } from '../../i18n';

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
    refetchInterval: 15_000,
  });
  const open = itemsOf(sessions.data).find((row) => row.ended_at === null);
  const remaining = typeof open?.remaining_seconds === 'number' ? open.remaining_seconds : 0;
  useEffect(() => {
    if (open === undefined || remaining > 0) {
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(messages.focusDone);
    }
    document.title = messages.focusDone;
  }, [messages.focusDone, open, remaining]);
  useEffect(() => {
    if (open === undefined) {
      return;
    }
    const previous = document.title;
    document.title = clock(remaining);
    return () => {
      document.title = previous;
    };
  }, [open, remaining]);
  return (
    <section className="screen-page">
      <h1>{messages.focusTitle}</h1>
      <p>{messages.focusHint}</p>
      <p className="detail-title">{open === undefined ? '—' : clock(remaining)}</p>
      <div className="page-toolbar">
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
        {typeof open?.id === 'string' ? (
          <Button
            onClick={() => {
              void api.finishFocus(open.id as string).then(() => {
                void queryClient.invalidateQueries({ queryKey: ['focus-sessions'] });
              });
            }}
          >
            {messages.focusPause}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function DataSettings() {
  const messages = useMessages();
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.listBackups() });
  const [exported, setExported] = useState(false);
  return (
    <section>
      <h1>{messages.settingsData}</h1>
      <p>{messages.backupEmpty}</p>
      <Button
        onClick={() => {
          void api.exportJson().then((body) => {
            const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tick-tack-done.json';
            link.click();
            URL.revokeObjectURL(url);
            setExported(true);
          });
        }}
      >
        {messages.exportJson}
      </Button>
      {exported ? <p role="status">{messages.saved}</p> : null}
      <ul>
        {itemsOf(backups.data).map((row) => (
          <li key={text(row.stamp)}>{text(row.stamp)}</li>
        ))}
      </ul>
    </section>
  );
}

export function CalendarSettings() {
  const messages = useMessages();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const [url, setUrl] = useState<string | null>(null);
  const first = projects.data?.items[0];
  return (
    <section>
      <h1>{messages.settingsCalendar}</h1>
      <Button
        disabled={first === undefined}
        onClick={() => {
          if (first === undefined) {
            return;
          }
          void api.createCalendarFeed(first.id).then((body) => {
            setUrl(text(body.url));
          });
        }}
      >
        {messages.feedCreate}
      </Button>
      {url !== null ? <p>{url}</p> : null}
    </section>
  );
}

export function IntegrationSettings() {
  const messages = useMessages();
  const telegram = useQuery({
    queryKey: ['telegram'],
    queryFn: () => api.integrationStatus('telegram'),
  });
  const drive = useQuery({ queryKey: ['drive'], queryFn: () => api.integrationStatus('drive') });
  const google = useQuery({ queryKey: ['google'], queryFn: () => api.integrationStatus('google') });
  const account = text(google.data?.account);
  return (
    <section>
      <h1>{messages.settingsIntegrations}</h1>
      <p>Telegram: {telegram.data?.configured === true ? messages.online : messages.offline}</p>
      <p>Drive: {drive.data?.configured === true ? messages.online : messages.offline}</p>
      <p>Google: {google.data?.connected === true ? account : messages.offline}</p>
      <Button
        disabled={google.data?.configured !== true || google.data.connected === true}
        onClick={() => {
          void api.googleConnect().then((body) => {
            const url = text(body.url);
            if (url.startsWith('https://accounts.google.com/')) {
              window.location.assign(url);
            }
          });
        }}
      >
        {messages.googleConnect}
      </Button>
    </section>
  );
}

export function AutomationSettings() {
  const messages = useMessages();
  const rows = useQuery({ queryKey: ['automations'], queryFn: () => api.listAutomations() });
  const items = itemsOf(rows.data);
  return (
    <section>
      <h1>{messages.settingsAutomations}</h1>
      {items.length === 0 ? (
        <EmptyState title={messages.settingsAutomations} body={messages.automationsEmpty} />
      ) : null}
      <ul>
        {items.map((row) => (
          <li key={text(row.id)}>{text(row.name)}</li>
        ))}
      </ul>
    </section>
  );
}

export function WebhookSettings() {
  const messages = useMessages();
  const rows = useQuery({ queryKey: ['webhooks'], queryFn: () => api.listWebhooks() });
  const items = itemsOf(rows.data);
  return (
    <section>
      <h1>{messages.settingsWebhooks}</h1>
      {items.length === 0 ? (
        <EmptyState title={messages.settingsWebhooks} body={messages.webhooksEmpty} />
      ) : null}
      <ul>
        {items.map((row) => (
          <li key={text(row.id)}>{text(row.url)}</li>
        ))}
      </ul>
    </section>
  );
}

export function PluginSettings() {
  const messages = useMessages();
  const rows = useQuery({ queryKey: ['plugins'], queryFn: () => api.listPlugins() });
  const items = itemsOf(rows.data);
  return (
    <section>
      <h1>{messages.settingsPlugins}</h1>
      <p>{messages.pluginEmpty}</p>
      <ul>
        {items.map((row) => (
          <li key={text(row.id)}>{text(row.plugin_id)}</li>
        ))}
      </ul>
    </section>
  );
}

export function SharingSettings() {
  const messages = useMessages();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const first = projects.data?.items[0];
  const members = useQuery({
    queryKey: ['members', first?.id],
    queryFn: () => api.listMembers(first?.id ?? ''),
    enabled: first !== undefined,
  });
  const [email, setEmail] = useState('');
  return (
    <section>
      <h1>{messages.settingsSharing}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (first === undefined || email.length === 0) {
            return;
          }
          void api.addMember(first.id, email, 'write').then(() => {
            setEmail('');
            void members.refetch();
          });
        }}
      >
        <input
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          type="email"
        />
        <Button type="submit">{messages.shareAdd}</Button>
      </form>
      <ul>
        {itemsOf(members.data).map((row) => (
          <li key={text(row.id)}>
            {text(row.email)} · {text(row.permission)}
          </li>
        ))}
      </ul>
    </section>
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
