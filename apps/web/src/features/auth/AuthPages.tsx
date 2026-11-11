import { runAction } from '../../components/run-action';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, createApiClient } from '@reflexionia/sdk';
import { sessionMode } from '../../api';
import { BrandMark } from '../../components/BrandMark';
import { messagesFor, useMessages } from '../../i18n';
import { recaptchaToken } from './recaptcha';
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
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const registrationOpen = useRegistrationOpen();

  async function submit(): Promise<void> {
    setError(null);
    try {
      const captchaToken = await recaptchaToken('login');
      const session = await sessionApi.login({
        email,
        password,
        ...(captchaToken === undefined ? {} : { captcha_token: captchaToken }),
        ...(step === 'totp' && !useRecovery ? { totp_code: code } : {}),
        ...(step === 'totp' && useRecovery ? { recovery_code: code } : {}),
      });
      markSession('authenticated', session.csrf_token);
      setFailures(0);
      followOauthNext(next, () => {
        runAction(Promise.resolve(navigate('/today')));
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'totp_required') {
        setStep('totp');
        return;
      }
      if (caught instanceof ApiError && caught.code === 'invalid_totp') {
        setStep('totp');
        setError(messages.resetInvalidTotp);
        return;
      }
      if (caught instanceof ApiError && caught.code === 'captcha_failed') {
        setError(messages.captchaFailed);
        return;
      }
      if (caught instanceof Error && caught.message === 'recaptcha_unavailable') {
        setError(messages.captchaFailed);
        return;
      }
      setFailures((count) => count + 1);
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
        {step === 'password' ? (
          <>
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
            <Link className="auth-forgot" to="/forgot-password" state={{ email }}>
              {messages.forgotLink}
            </Link>
          </>
        ) : (
          <>
            <p>{messages.loginSecondFactor}</p>
            <label>
              {useRecovery ? messages.resetRecoveryLabel : messages.resetTotpLabel}
              <input
                value={code}
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                maxLength={useRecovery ? 20 : 6}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="auth-reveal"
              onClick={() => {
                setUseRecovery((current) => !current);
                setCode('');
                setError(null);
              }}
            >
              {useRecovery ? messages.resetUseTotp : messages.resetUseRecovery}
            </button>
            <button
              type="button"
              className="auth-reveal"
              onClick={() => {
                setStep('password');
                setCode('');
                setError(null);
              }}
            >
              {messages.loginChangeCredentials}
            </button>
          </>
        )}
        <button type="submit">{messages.loginTitle}</button>
        {error !== null ? (
          <p className="error" role="alert">
            {error}
            {failures >= 2 ? (
              <>
                {' '}
                <Link to="/forgot-password" state={{ email }}>
                  {messages.forgotLink}
                </Link>
              </>
            ) : null}
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

export function AuthCard({
  title,
  children,
  titleRef,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly titleRef?: { current: HTMLHeadingElement | null };
}) {
  const m = useMessages();
  useEffect(() => {
    document.documentElement.dataset.recaptchaBadge = 'on';
    return () => {
      delete document.documentElement.dataset.recaptchaBadge;
    };
  }, []);
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <header className="auth-brand">
          <BrandMark size={64} />
          <h1 tabIndex={-1} ref={titleRef}>
            {title}
          </h1>
        </header>
        {children}
        <nav>
          <Link to="/privacy">{m.privacyTitle}</Link> · <Link to="/terms">{m.termsTitle}</Link>
        </nav>
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
