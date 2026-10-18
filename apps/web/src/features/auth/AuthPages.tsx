import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { createApiClient } from '@reflexionia/sdk';
import { messagesFor } from '../../i18n';
import { setCsrfToken } from './session';

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
    <main className="today">
      <h1>{messages.loginTitle}</h1>
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
        {error !== null ? <p className="error">{error}</p> : null}
      </form>
      <Link to="/register">{messages.registerTitle}</Link>
    </main>
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
    <main className="today">
      <h1>{messages.registerTitle}</h1>
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
        {error !== null ? <p className="error">{error}</p> : null}
      </form>
    </main>
  );
}
