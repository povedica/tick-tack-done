import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck, Unlink } from 'lucide-react';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { googleAuthorizationUrl } from '../product/GoogleAccessActions';
import { runAction } from '../../components/run-action';
import { useWtEMessages } from './i18n-wt-e';
import {
  InfoTip,
  ServiceActions,
  ServiceMark,
  StatusChip,
  type ServiceAction,
} from './integration-ui';
import './settings-wt-e.css';

const MANAGE_HREF = 'https://myaccount.google.com/permissions';
type Service = 'calendar' | 'drive';

function permissionParts(value: string) {
  const index = value.indexOf(' · ');
  if (index === -1) return { title: value, detail: '' };
  return { title: value.slice(0, index), detail: value.slice(index + 3) };
}

function labeledAction(template: string, service: string) {
  const full = template.replace('{service}', service);
  return { full, word: full.split(' ')[0] ?? full };
}

export function GoogleIntegrationCards() {
  const m = useMessages();
  const copy = useWtEMessages();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'revoke' | 'change' | null>(null);
  const [removeEvents, setRemoveEvents] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const google = useQuery({
    queryKey: ['google'],
    queryFn: () => api.integrationStatus('google'),
    refetchOnWindowFocus: 'always',
  });
  useEffect(() => {
    const flag = params.get('google') ?? params.get('drive');
    if (!flag) return;
    setNotice(
      flag === 'connected'
        ? m.googlePermissionsChecked
        : flag === 'denied'
          ? m.googleDeniedNote
          : m.googleErrorNote,
    );
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('drive');
    setParams(next, { replace: true });
  }, [params, setParams, m.googlePermissionsChecked, m.googleDeniedNote, m.googleErrorNote]);
  useEffect(() => {
    if (mode) dialog.current?.showModal();
  }, [mode]);
  const revoke = useMutation({
    mutationFn: async () => {
      await api.disconnectGoogle({ removeImportedEvents: removeEvents });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['google'] }),
        cache.invalidateQueries({ queryKey: ['drive'] }),
        cache.invalidateQueries({ queryKey: ['calendar-events'] }),
        cache.invalidateQueries({ queryKey: ['calendar-subscriptions'] }),
      ]);
      if (mode === 'change') {
        window.location.assign(googleAuthorizationUrl((await api.googleConnect('all')).url));
      } else {
        setNotice(m.googleDisconnectedNotice);
        setMode(null);
      }
    },
    onError: () => {
      setNotice(m.googleDisconnectFailed);
    },
  });
  const open = (next: 'revoke' | 'change') => {
    revoke.reset();
    setRemoveEvents(false);
    setMode(next);
  };
  const connected = google.data?.has_connection === true;
  const reauth = google.data?.status === 'reauth_required';
  const chip = reauth ? copy.reconnect : connected ? copy.connected : m.googleDisconnectedStatus;
  const actions: ServiceAction[] = [
    ...(connected
      ? [
          {
            id: 'change',
            label: m.googleChangePermissions,
            icon: ShieldCheck,
            link: true,
            onSelect: () => {
              open('change');
            },
          } satisfies ServiceAction,
        ]
      : []),
    {
      id: 'manage',
      label: m.googleManagePermissions,
      detail: m.googleManageDetail,
      icon: ExternalLink,
      href: MANAGE_HREF,
      menu: false,
    },
    ...(connected
      ? [
          {
            id: 'disconnect',
            label: copy.disconnectGoogle,
            icon: Unlink,
            tone: 'danger' as const,
            onSelect: () => {
              open('revoke');
            },
          } satisfies ServiceAction,
        ]
      : []),
  ];
  const sheetHeader = (
    <div className="integration-sheet-intro">
      <ServiceMark name="google" />
      <div>
        <strong>{copy.googleTitle}</strong>
        <p>{m.googleSharedFoot}</p>
      </div>
    </div>
  );
  return (
    <>
      <article className="integration-row" aria-labelledby="google-integration-title">
        <div className="integration-head">
          <div className="integration-id">
            <ServiceMark name="google" />
            <div className="integration-copy">
              <div className="integration-name">
                <h2 id="google-integration-title">{copy.googleTitle}</h2>
                <StatusChip on={connected && !reauth}>{chip}</StatusChip>
              </div>
              {typeof google.data?.account === 'string' ? (
                <p className="integration-meta">{google.data.account}</p>
              ) : null}
            </div>
          </div>
          <ServiceActions actions={actions} label={copy.googleTitle} sheetHeader={sheetHeader} />
        </div>
        <div className="integration-services">
          <GoogleServiceCard service="calendar" />
          <GoogleServiceCard service="drive" />
        </div>
        <p className="integration-foot integration-follow">
          {m.googleSharedFoot}{' '}
          <a href={MANAGE_HREF} target="_blank" rel="noopener noreferrer">
            {m.googleManagePermissions} ↗
          </a>
        </p>
        {notice ? (
          <p className="integration-follow" role="status">
            {notice === m.googleDisconnectedNotice ? (
              <>
                {copy.disconnected}{' '}
                <a href={MANAGE_HREF} target="_blank" rel="noopener noreferrer">
                  myaccount.google.com/permissions
                </a>
              </>
            ) : (
              notice
            )}
          </p>
        ) : null}
      </article>
      {mode ? (
        <dialog
          ref={dialog}
          className="ui-modal google-disconnect-dialog"
          role="alertdialog"
          aria-label={mode === 'change' ? m.googleChangePermissions : copy.disconnect}
          onCancel={(event) => {
            event.preventDefault();
            if (!revoke.isPending) setMode(null);
          }}
        >
          <p>{copy.calendarEffect}</p>
          <p>{copy.driveEffect}</p>
          <p>{copy.revokeEffect}</p>
          {mode === 'change' ? <p>{m.googleReconfigureHelp}</p> : null}
          <label className="google-remove-events">
            <input
              type="checkbox"
              checked={removeEvents}
              onChange={(event) => {
                setRemoveEvents(event.target.checked);
              }}
            />
            {m.googleDisconnectRemoveEvents}
          </label>
          {revoke.isError ? <p role="alert">{m.googleDisconnectFailed}</p> : null}
          <div className="token-actions">
            <Button
              size="sm"
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => {
                setMode(null);
              }}
            >
              {m.cancel}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={revoke.isPending}
              onClick={() => {
                revoke.mutate();
              }}
            >
              {mode === 'change' ? m.googleRevokeContinue : copy.disconnect}
            </Button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

function GoogleServiceCard({ service }: { readonly service: Service }) {
  const m = useMessages();
  const copy = useWtEMessages();
  const cache = useQueryClient();
  const calendar = service === 'calendar';
  const name = calendar ? 'Google Calendar' : 'Google Drive';
  const parts = permissionParts(calendar ? copy.calendarPermission : copy.drivePermission);
  const query = useQuery({
    queryKey: [calendar ? 'google' : 'drive'],
    queryFn: () => api.integrationStatus(calendar ? 'google' : 'drive'),
    refetchOnWindowFocus: 'always',
    refetchInterval: 30000,
  });
  const authorized = query.data?.authorized === true;
  const enabled = query.data?.enabled === true;
  const status = typeof query.data?.status === 'string' ? query.data.status : 'disconnected';
  const connect = useMutation({
    mutationFn: async () => googleAuthorizationUrl((await api.googleConnect(service)).url),
    onSuccess: (url) => {
      window.location.assign(url);
    },
  });
  const toggle = useMutation({
    mutationFn: () => api.setGoogleService(service, !enabled),
    onSuccess: () => {
      runAction(cache.invalidateQueries({ queryKey: [calendar ? 'google' : 'drive'] }));
      runAction(cache.invalidateQueries({ queryKey: ['calendar-events'] }));
    },
  });
  const labels: Record<string, string> = {
    connected: m.googleAuthorizedActive,
    disabled: m.googleAuthorizedDisabled,
    permission_required: m.googlePermissionRequired,
    permissions_unknown: m.googlePermissionsUnknown,
    reauth_required: m.googleAuthorizationExpired,
    disconnected: m.googleDisconnectedStatus,
  };
  const active = authorized && (status === 'connected' || status === 'disabled');
  const action = labeledAction(
    status === 'reauth_required' ? m.googleReconnectService : m.googleAuthorizeService,
    name,
  );
  let note: string | null = null;
  if (!query.isPending && !active) note = labels[status] ?? m.googlePermissionsUnknown;
  else if (status === 'disabled') note = m.googleDisabledHelp;
  let control: ReactNode = null;
  if (active) {
    control = (
      <button
        type="button"
        className="notification-switch"
        role="switch"
        aria-label={`${name} · ${parts.detail}`}
        aria-checked={enabled}
        disabled={toggle.isPending}
        onClick={() => {
          toggle.mutate();
        }}
      >
        <span />
      </button>
    );
  } else if (!query.isPending) {
    control = (
      <Button
        size="sm"
        aria-label={action.full}
        disabled={query.data?.configured !== true || connect.isPending}
        onClick={() => {
          connect.mutate();
        }}
      >
        {action.word}
      </Button>
    );
  }
  return (
    <>
      <div className="integration-switch" role="group" aria-label={name}>
        <span className="integration-switch-label">
          <strong>{parts.title}</strong>
          {parts.detail ? <span className="integration-detail">{parts.detail}</span> : null}
          <InfoTip
            label={m.dataTreatment.replace('{service}', name)}
            text={calendar ? m.googleDataNotice : m.driveDataNotice}
          />
          {note ? <small className="integration-note">{note}</small> : null}
        </span>
        {control}
      </div>
      {query.isError || connect.isError || toggle.isError ? (
        <p className="integration-follow" role="alert">
          {m.settingsFailed}
        </p>
      ) : null}
    </>
  );
}
