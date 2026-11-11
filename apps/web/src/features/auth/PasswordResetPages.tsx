import { runAction } from '../../components/run-action';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError, createApiClient } from '@reflexionia/sdk';
import { messagesFor } from '../../i18n';
import { recaptchaToken } from './recaptcha';
import { AuthCard } from './AuthPages';
import './auth.css';

const sessionApi = createApiClient({ baseUrl: '', credentials: 'include' });

export function ForgotPasswordPage() {
  const messages = messagesFor(navigator.language);
  const location = useLocation();
  const seeded = emailFromState(location.state);
  const [email, setEmail] = useState(seeded);
  const [phase, setPhase] = useState<'form' | 'sent' | 'limited'>('form');
  const [sending, setSending] = useState(false);
  const [sends, setSends] = useState(0);
  const [wait, setWait] = useState(0);
  const [retryMinutes, setRetryMinutes] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setWait((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [wait]);

  async function submit(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPhase('form');
      return;
    }
    setFormError(null);
    setSending(true);
    try {
      const captchaToken = await recaptchaToken('password_reset');
      await sessionApi.requestPasswordReset({
        email,
        locale: messages === messagesFor('en') ? 'en' : 'es',
        ...(captchaToken === undefined ? {} : { captcha_token: captchaToken }),
      });
      setSends((count) => count + 1);
      setWait(60);
      setPhase('sent');
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const minutes = retryMinutesOf(error);
        setRetryMinutes(minutes);
        setPhase('limited');
      } else if (
        (error instanceof ApiError && error.code === 'captcha_failed') ||
        (error instanceof Error && error.message === 'recaptcha_unavailable')
      ) {
        setPhase('form');
        setFormError(messages.captchaFailed);
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setPhase('form');
      } else {
        setSends((count) => count + 1);
        setWait(60);
        setPhase('sent');
      }
    } finally {
      setSending(false);
    }
  }

  const title =
    phase === 'sent'
      ? messages.forgotSentTitle
      : phase === 'limited'
        ? messages.forgotTitle
        : messages.forgotTitle;

  return (
    <AuthCard title={title} titleRef={titleRef}>
      {phase === 'limited' ? (
        <p role="alert">{fill(messages.forgotRateLimited, { minutes: String(retryMinutes) })}</p>
      ) : null}
      {phase === 'sent' ? (
        <div aria-live="polite">
          <p>{fill(messages.forgotSentBody, { email })}</p>
          <p>{fill(messages.forgotSentHint, { minutes: '30' })}</p>
          {sends < 3 ? (
            <p>
              {messages.forgotSpamHint}{' '}
              {wait > 0 ? (
                <span>{fill(messages.forgotResendIn, { seconds: String(wait) })}</span>
              ) : (
                <button
                  type="button"
                  className="auth-reveal"
                  onClick={() => {
                    runAction(submit());
                  }}
                >
                  {messages.forgotResend}
                </button>
              )}
            </p>
          ) : (
            <p>{messages.forgotSpamHint}</p>
          )}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runAction(submit());
          }}
        >
          <p>{messages.forgotIntro}</p>
          {typeof navigator !== 'undefined' && !navigator.onLine ? (
            <p role="alert">{messages.offlineAction}</p>
          ) : null}
          {formError !== null ? <p role="alert">{formError}</p> : null}
          <label>
            {messages.email}
            <input
              type="email"
              value={email}
              autoComplete="email"
              inputMode="email"
              autoFocus={email.length === 0}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={sending || !navigator.onLine}>
            {sending ? messages.forgotSending : messages.forgotSubmit}
          </button>
        </form>
      )}
      <Link to="/login">{messages.backToLogin}</Link>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [token] = useState(consumeResetToken);
  const [phase, setPhase] = useState<'checking' | 'form' | 'done' | 'expired'>('checking');
  const [totpRequired, setTotpRequired] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const passwordsMatch = password.length >= 10 && password === repeat;
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.append(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    titleRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (token.length < 43) {
      setPhase('expired');
      return;
    }
    if (!navigator.onLine) {
      setOffline(true);
      setPhase('expired');
      return;
    }
    let live = true;
    void sessionApi
      .verifyPasswordReset({ token })
      .then((result) => {
        if (!live) {
          return;
        }
        setTotpRequired(result.totp_required);
        setPhase('form');
      })
      .catch(() => {
        if (live) {
          setPhase('expired');
        }
      });
    return () => {
      live = false;
    };
  }, [token]);

  async function submit(): Promise<void> {
    setError(null);
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    if (password.length < 10 || password !== repeat) {
      setError(password.length < 10 ? messages.resetMinLength : messages.resetMismatch);
      return;
    }
    try {
      await sessionApi.confirmPasswordReset({
        token,
        new_password: password,
        ...(totpRequired && !useRecovery ? { totp_code: code } : {}),
        ...(totpRequired && useRecovery ? { recovery_code: code } : {}),
      });
      setPhase('done');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'password_reused') {
        setError(messages.resetPasswordReused);
        return;
      }
      if (caught instanceof ApiError && caught.code === 'password_too_common') {
        setError(messages.resetPasswordTooCommon);
        return;
      }
      if (
        caught instanceof ApiError &&
        (caught.code === 'invalid_totp' || caught.code === 'totp_required')
      ) {
        setError(messages.resetInvalidTotp);
        return;
      }
      if (caught instanceof ApiError && caught.code === 'reset_token_invalid') {
        setPhase('expired');
        return;
      }
      setError(messages.resetInvalidTotp);
    }
  }

  const title =
    phase === 'done'
      ? messages.resetDoneTitle
      : phase === 'expired'
        ? messages.resetExpiredTitle
        : phase === 'checking'
          ? messages.resetChecking
          : messages.resetTitle;

  return (
    <AuthCard title={title} titleRef={titleRef}>
      {offline ? <p role="alert">{messages.offlineAction}</p> : null}
      {phase === 'checking' ? <p aria-live="polite">{messages.resetChecking}</p> : null}
      {phase === 'expired' ? (
        <>
          <p>{messages.resetExpiredBody}</p>
          <Link to="/forgot-password">{messages.resetRequestAgain}</Link>
          <Link to="/login">{messages.backToLogin}</Link>
        </>
      ) : null}
      {phase === 'done' ? (
        <>
          <p>{messages.resetDoneBody}</p>
          <button
            type="submit"
            onClick={() => {
              runAction(Promise.resolve(navigate('/login')));
            }}
          >
            {messages.loginTitle}
          </button>
        </>
      ) : null}
      {phase === 'form' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runAction(submit());
          }}
        >
          <PasswordField
            id="reset-new"
            label={messages.resetNewPassword}
            value={password}
            visible={visible}
            showLabel={messages.showPassword}
            hideLabel={messages.hidePassword}
            matched={passwordsMatch}
            onToggle={() => {
              setVisible((current) => !current);
            }}
            onChange={setPassword}
          />
          <PasswordField
            id="reset-repeat"
            label={messages.resetRepeatPassword}
            value={repeat}
            visible={visible}
            showLabel={messages.showPassword}
            hideLabel={messages.hidePassword}
            matched={passwordsMatch}
            onToggle={() => {
              setVisible((current) => !current);
            }}
            onChange={setRepeat}
          />
          <p className={passwordsMatch ? 'auth-help is-match' : 'auth-help'}>
            {passwordsMatch
              ? messages.resetMatch
              : repeat.length > 0 && password !== repeat
                ? messages.resetMismatch
                : messages.resetMinLength}
          </p>
          {totpRequired ? (
            <>
              <label>
                {useRecovery ? messages.resetRecoveryLabel : messages.resetTotpLabel}
                <input
                  value={code}
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
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
                }}
              >
                {useRecovery ? messages.resetUseTotp : messages.resetUseRecovery}
              </button>
            </>
          ) : null}
          {error !== null ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit">{messages.resetSubmit}</button>
          <p className="auth-help">{messages.resetSignOutNote}</p>
        </form>
      ) : null}
    </AuthCard>
  );
}

function PasswordField({
  id,
  label,
  value,
  visible,
  showLabel,
  hideLabel,
  matched,
  onToggle,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly visible: boolean;
  readonly showLabel: string;
  readonly hideLabel: string;
  readonly matched: boolean;
  readonly onToggle: () => void;
  readonly onChange: (value: string) => void;
}) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <span className={matched ? 'auth-password is-match' : 'auth-password'}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="new-password"
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <button
          type="button"
          className="auth-eye"
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          onClick={onToggle}
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function consumeResetToken(): string {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(raw).get('token') ?? '';
  if (window.location.hash.length > 0) {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }
  return token;
}

function emailFromState(state: unknown): string {
  if (
    typeof state === 'object' &&
    state !== null &&
    'email' in state &&
    typeof state.email === 'string'
  ) {
    return state.email;
  }
  return '';
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function retryMinutesOf(error: ApiError): number {
  const details = error.details;
  if (typeof details === 'object' && details !== null && 'retry_after' in details) {
    const seconds = Number(details.retry_after);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.max(1, Math.ceil(seconds / 60));
    }
  }
  return 1;
}
