import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { createApiClient } from '@reflexionia/sdk';
import { BrandMark } from '../../components/BrandMark';
import { messagesFor } from '../../i18n';
import { setCsrfToken } from './session';
import './auth.css';

const sessionApi = createApiClient({ baseUrl: '', credentials: 'include' });

export function LoginPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      const session = await sessionApi.login({ email, password });
      setCsrfToken(session.csrf_token);
      void navigate('/today');
    } catch {
      setError(messages.loginFailed);
    }
  }

  return (
    <AuthCard title={messages.loginTitle}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
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
      <Link to="/register">{messages.registerTitle}</Link>
    </AuthCard>
  );
}

export function RegisterPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    try {
      const session = await sessionApi.register({ email, password, display_name: name });
      setCsrfToken(session.csrf_token);
      void navigate('/today');
    } catch {
      setError(messages.registerFailed);
    }
  }

  return (
    <AuthCard title={messages.registerTitle}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
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
