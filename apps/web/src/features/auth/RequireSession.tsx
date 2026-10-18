import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router';
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
  const status = useSyncExternalStore(subscribeSession, sessionStatus, sessionStatus);
  if (status === 'unknown') {
    return <p className="ui-muted">{messages.sessionChecking}</p>;
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
