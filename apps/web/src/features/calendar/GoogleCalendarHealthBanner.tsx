import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import './calendar-health.css';
import { syncCalendarsNow } from './sync-calendars';

type Health = 'ok' | 'error' | 'reconnect_required';

interface SyncView {
  readonly health: Health;
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
}

export function GoogleCalendarHealthBanner() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['calendar-sync-status'],
    queryFn: () => api.getCalendarSyncStatus(),
    staleTime: 30_000,
  });
  const view = readSync(status.data);
  if (view === null || view.health === 'ok') {
    return null;
  }
  if (view.health === 'reconnect_required') {
    return (
      <p className="calendar-health" role="status">
        <span>{messages.calendarReconnectBanner}</span>
        <Link to="/settings/integrations">{messages.googleReconnect}</Link>
      </p>
    );
  }
  const when =
    view.lastSyncedAt === null
      ? messages.calendarSyncNever
      : new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
          -Math.round((Date.now() - new Date(view.lastSyncedAt).getTime()) / 60000),
          'minute',
        );
  return (
    <p className="calendar-health" role="status">
      <span>{messages.calendarSyncErrorBanner.replace('{when}', when)}</span>
      <Button
        type="button"
        className="calendar-sync"
        onClick={() => {
          runAction(syncCalendarsNow(queryClient));
        }}
      >
        {messages.syncNow}
      </Button>
    </p>
  );
}

export function CalendarSyncButton() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['calendar-sync-status'],
    queryFn: () => api.getCalendarSyncStatus(),
    staleTime: 30_000,
  });
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'error'>('idle');
  const compact = useCompactCalendarBar();
  const when = syncWhen(latestSync(status.data), locale, messages.calendarSyncNever);
  const statusTitle =
    phase === 'error'
      ? messages.calendarSyncFailedQuiet
      : messages.lastSync.replace('{when}', when);
  const label = phase === 'syncing' ? messages.calendarSyncing : messages.syncNow;
  const title = compact ? messages.syncNow : statusTitle;
  return (
    <Button
      type="button"
      className="calendar-sync"
      aria-label={compact ? messages.syncNow : `${label}. ${statusTitle}`}
      title={title}
      loading={phase === 'syncing'}
      onClick={() => {
        setPhase('syncing');
        runAction(syncCalendarsNow(queryClient), {
          success: () => {
            setPhase('idle');
          },
          rollback: () => {
            setPhase('error');
          },
        });
      }}
    >
      <RefreshCw
        className={phase === 'syncing' ? 'is-spinning' : undefined}
        size={20}
        aria-hidden="true"
      />
      <span>{label}</span>
    </Button>
  );
}

function useCompactCalendarBar(): boolean {
  const query = '(max-width: 700px)';
  const [compact, setCompact] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia(query);
    const apply = (): void => {
      setCompact(media.matches);
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, []);
  return compact;
}

function latestSync(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const rows = (value as { subscriptions?: unknown }).subscriptions;
  if (!Array.isArray(rows)) {
    return null;
  }
  let latest: string | null = null;
  for (const item of rows) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const stamp = (item as { last_synced_at?: unknown }).last_synced_at;
    if (typeof stamp === 'string' && (latest === null || stamp > latest)) {
      latest = stamp;
    }
  }
  return latest;
}

function syncWhen(stamp: string | null, locale: string, never: string): string {
  if (stamp === null) {
    return never;
  }
  const minutes = Math.round((Date.now() - new Date(stamp).getTime()) / 60000);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-minutes, 'minute');
}

function readSync(value: unknown): SyncView | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const body = value as {
    google?: { status?: unknown };
    subscriptions?: unknown;
  };
  const rows = Array.isArray(body.subscriptions) ? body.subscriptions : [];
  let health: Health = 'ok';
  let lastSyncedAt: string | null = null;
  let lastError: string | null = null;
  if (body.google?.status === 'reauth_required' || body.google?.status === 'permission_required') {
    health = 'reconnect_required';
  }
  for (const item of rows) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as {
      health?: unknown;
      last_synced_at?: unknown;
      last_error?: unknown;
    };
    const rowHealth = healthOf(row.health);
    if (rank(rowHealth) > rank(health)) {
      health = rowHealth;
      lastError = typeof row.last_error === 'string' ? row.last_error : null;
      lastSyncedAt = typeof row.last_synced_at === 'string' ? row.last_synced_at : null;
    }
  }
  return { health, lastSyncedAt, lastError };
}

function healthOf(value: unknown): Health {
  if (value === 'reconnect_required' || value === 'error' || value === 'ok') {
    return value;
  }
  return 'ok';
}

function rank(health: Health): number {
  if (health === 'reconnect_required') {
    return 2;
  }
  if (health === 'error') {
    return 1;
  }
  return 0;
}
