import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSyncExternalStore } from 'react';
import { api, sessionMode } from '../../api';
import { useMessages } from '../../i18n';
import {
  markSession,
  rejectSession,
  sessionCheckGeneration,
  sessionStatus,
  subscribeSession,
} from './session';

export function SessionBootstrap() {
  useEffect(() => {
    if (!sessionMode) {
      return;
    }
    const check = sessionCheckGeneration();
    void api.currentSession().then(
      (session) => {
        markSession('authenticated', session.csrf_token);
      },
      () => {
        rejectSession(check);
      },
    );
  }, []);
  return null;
}

export function RequireSession() {
  const messages = useMessages();
  const location = useLocation();
  const status = useSyncExternalStore(subscribeSession, sessionStatus, sessionStatus);
  if (status === 'unknown') {
    return <p className="ui-muted">{messages.sessionChecking}</p>;
  }
  if (status === 'anonymous') {
    if (location.pathname === '/oauth/consent') {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      return <Navigate to={`/login?next=${next}`} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
