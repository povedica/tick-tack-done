import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { createApiClient } from '@reflexionia/sdk';
import { messagesFor } from '../../i18n';
import { readCsrfToken } from './session';

const consentApi = createApiClient({
  baseUrl: '',
  credentials: 'include',
  csrfToken: readCsrfToken,
});

export function ConsentPage() {
  const messages = messagesFor(navigator.language);
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  async function decide(allow: boolean): Promise<void> {
    setError(null);
    try {
      const response = await consentApi.oauthConsent({
        client_id: params.get('client_id') ?? '',
        redirect_uri: params.get('redirect_uri') ?? '',
        scope: params.get('scope') ?? '',
        state: params.get('state') ?? '',
        code_challenge: params.get('code_challenge') ?? '',
        code_challenge_method: params.get('code_challenge_method') ?? 'S256',
        allow,
      });
      window.location.assign(response.redirect_to);
    } catch {
      setError(messages.consentFailed);
    }
  }

  return (
    <main className="today">
      <h1>{messages.consentTitle}</h1>
      <p>{messages.consentHint}</p>
      <p>{params.get('scope')}</p>
      <button
        type="button"
        onClick={() => {
          void decide(true);
        }}
      >
        {messages.consentAllow}
      </button>
      <button
        type="button"
        onClick={() => {
          void decide(false);
        }}
      >
        {messages.consentDeny}
      </button>
      {error !== null ? <p className="error">{error}</p> : null}
    </main>
  );
}
