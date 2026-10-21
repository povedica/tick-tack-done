import { runAction } from '../../components/run-action';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { createApiClient } from '@reflexionia/sdk';
import { sessionMode } from '../../api';
import { BrandMark } from '../../components/BrandMark';
import { messagesFor } from '../../i18n';
import { markSession, sessionStatus, subscribeSession } from './session';
import './auth.css';

const sessionApi = createApiClient({ baseUrl: '', credentials: 'include' });

export function LoginPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeOauthNext(params.get('next'));
  const status = useSyncExternalStore(subscribeSession, sessionStatus, sessionStatus);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const registrationOpen = useRegistrationOpen();

  async function submit(): Promise<void> {
    setError(null);
    try {
      const session = await sessionApi.login({ email, password });
      markSession('authenticated', session.csrf_token);
      followOauthNext(next, () => {
        runAction(Promise.resolve(navigate('/today')));
      });
    } catch {
      setError(messages.loginFailed);
    }
  }

  if (sessionMode && status === 'authenticated') {
    if (next?.startsWith('/oauth/authorize') === true) {
      window.location.assign(next);
      return <p className="ui-muted">{messages.sessionChecking}</p>;
    }
    return <Navigate to={next ?? '/today'} replace />;
  }

  return (
    <AuthCard title={messages.loginTitle}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runAction(submit());
        }}
      >
        <label>
          {messages.email}
          <input
            type="email"
            value={email}
            autoComplete="username"
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label>
          {messages.password}
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <button type="submit">{messages.loginTitle}</button>
        {error !== null ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {registrationOpen ? <Link to="/register">{messages.registerTitle}</Link> : null}
    </AuthCard>
  );
}

export function RegisterPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const status = useSyncExternalStore(subscribeSession, sessionStatus, sessionStatus);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const registrationOpen = useRegistrationOpen();

  async function submit(): Promise<void> {
    setError(null);
    try {
      const session = await sessionApi.register({ email, password, display_name: name });
      markSession('authenticated', session.csrf_token);
      runAction(Promise.resolve(navigate('/today')));
    } catch {
      setError(messages.registerFailed);
    }
  }

  if (sessionMode && status === 'authenticated') {
    return <Navigate to="/today" replace />;
  }

  if (registrationOpen !== true) {
    return (
      <AuthCard title={messages.registerTitle}>
        {registrationOpen === false ? (
          <>
            <p>{messages.registerDev}</p>
            <Link to="/login">{messages.loginTitle}</Link>
          </>
        ) : null}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={messages.registerTitle}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runAction(submit());
        }}
      >
        <label>
          {messages.displayName}
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label>
          {messages.email}
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label>
          {messages.password}
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <button type="submit">{messages.registerTitle}</button>
        {error !== null ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <Link to="/login">{messages.loginTitle}</Link>
    </AuthCard>
  );
}

function useRegistrationOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void sessionApi
      .registrationOpen()
      .then((value) => {
        if (live) {
          setOpen(value);
        }
      })
      .catch(() => {
        if (live) {
          setOpen(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  return open;
}

function AuthCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <header className="auth-brand">
          <BrandMark size={64} />
          <h1>{title}</h1>
        </header>
        {children}
      </section>
    </main>
  );
}

function safeOauthNext(value: string | null): string | null {
  if (
    value === null ||
    !value.startsWith('/oauth/') ||
    value.includes('\\') ||
    value.includes('://')
  ) {
    return null;
  }
  const path = value.split('?')[0];
  if (path !== '/oauth/authorize' && path !== '/oauth/consent') {
    return null;
  }
  return value;
}

function followOauthNext(next: string | null, otherwise: () => void): void {
  if (next === null) {
    otherwise();
    return;
  }
  if (next.startsWith('/oauth/authorize')) {
    window.location.assign(next);
    return;
  }
  window.location.assign(next);
}
