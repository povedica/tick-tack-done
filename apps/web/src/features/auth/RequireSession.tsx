import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSyncExternalStore } from 'react';
import { api, sessionMode } from '../../api';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { isUnauthorized } from './session-expiry';
import {
  clearSessionUnreachable,
  markSession,
  markSessionUnreachable,
  rejectSession,
  sessionCheckGeneration,
  sessionStatus,
  sessionUnreachable,
  subscribeSession,
} from './session';

export function SessionBootstrap() {
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!sessionMode) {
      return;
    }
    const check = sessionCheckGeneration();
    clearSessionUnreachable();
    void api.currentSession().then(
      (session) => {
        markSession('authenticated', session.csrf_token);
      },
      (error: unknown) => {
        if (isUnauthorized(error)) {
          rejectSession(check);
          return;
        }
        // TTD-AUD-29: network/5xx must not log the user out.
        markSessionUnreachable();
      },
    );
  }, [retry]);

  // Expose retry bump for RequireSession via custom event when the button fires.
  useEffect(() => {
    function onRetry(): void {
      setRetry((value) => value + 1);
    }
    window.addEventListener('ttd-session-retry', onRetry);
    return () => {
      window.removeEventListener('ttd-session-retry', onRetry);
    };
  }, []);

  return null;
}

export function RequireSession() {
  const messages = useMessages();
  const location = useLocation();
  const status = useSyncExternalStore(subscribeSession, sessionStatus, sessionStatus);
  const unreachable = useSyncExternalStore(
    subscribeSession,
    sessionUnreachable,
    sessionUnreachable,
  );
  if (status === 'unknown' && unreachable) {
    return (
      <div className="session-retry" role="alert">
        <p>{messages.sessionNetworkError}</p>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            window.dispatchEvent(new Event('ttd-session-retry'));
          }}
        >
          {messages.retry}
        </Button>
      </div>
    );
  }
  if (status === 'unknown') {
    return (
      <div className="session-boot" role="status" aria-live="polite">
        <strong className="session-boot-brand">{messages.appName}</strong>
        <p>{messages.sessionChecking}</p>
      </div>
    );
  }
  if (status === 'anonymous') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
