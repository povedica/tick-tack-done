import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { googleAuthorizationUrl } from '../product/GoogleAccessActions';
import { runAction } from '../../components/run-action';
import { useWtEMessages } from './i18n-wt-e';
import './settings-wt-e.css';
type Service = 'calendar' | 'drive';
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
  return (
    <>
      <section className="token-panel" aria-label={copy.googleTitle}>
        <div className="token-panel-head">
          <h2>{copy.googleTitle}</h2>
          <span role="status">
            {google.data?.status === 'reauth_required'
              ? copy.reconnect
              : google.data?.has_connection === true
                ? copy.connected
                : m.googleDisconnectedStatus}
          </span>
        </div>
        {typeof google.data?.account === 'string' ? (
          <p className="token-meta">{google.data.account}</p>
        ) : null}
        <div className="wt-e-google-services">
          <GoogleServiceCard service="calendar" />
          <GoogleServiceCard service="drive" />
        </div>
        <p className="token-meta">{m.googleSharedNotice}</p>
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.googleManagePermissions}
        </a>
        {google.data?.has_connection === true ? (
          <div className="token-actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                open('change');
              }}
            >
              {m.googleChangePermissions}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                open('revoke');
              }}
            >
              {copy.disconnect}
            </Button>
          </div>
        ) : null}
        {notice ? (
          <p role="status">
            {notice === m.googleDisconnectedNotice ? (
              <>
                {copy.disconnected}{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  myaccount.google.com/permissions
                </a>
              </>
            ) : (
              notice
            )}
          </p>
        ) : null}
      </section>
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
  return (
    <div className="wt-e-google-service" role="group" aria-label={name}>
      <div className="token-panel-head">
        <strong>{name}</strong>
        <span className="token-meta" role="status">
          {query.isPending
            ? m.googlePermissionsUnknown
            : (labels[status] ?? m.googlePermissionsUnknown)}
        </span>
      </div>
      <p className="token-meta">{calendar ? copy.calendarPermission : copy.drivePermission}</p>
      <p className="token-meta">{calendar ? m.googleDataNotice : m.driveDataNotice}</p>
      <div className="token-actions">
        {authorized && (status === 'connected' || status === 'disabled') ? (
          <input
            type="checkbox"
            role="switch"
            aria-label={name}
            checked={enabled}
            disabled={toggle.isPending}
            onChange={() => {
              toggle.mutate();
            }}
          />
        ) : (
          <Button
            size="sm"
            disabled={query.data?.configured !== true || connect.isPending}
            onClick={() => {
              connect.mutate();
            }}
          >
            {(status === 'reauth_required'
              ? m.googleReconnectService
              : m.googleAuthorizeService
            ).replace('{service}', name)}
          </Button>
        )}
      </div>
      {status === 'disabled' ? <p className="token-meta">{m.googleDisabledHelp}</p> : null}
      {query.isError || connect.isError || toggle.isError ? (
        <p role="alert">{m.settingsFailed}</p>
      ) : null}
    </div>
  );
}
