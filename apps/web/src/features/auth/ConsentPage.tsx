import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { createApiClient } from '@reflexionia/sdk';
import { Button, SkeletonRows } from '../../components/ui';
import { useMessages } from '../../i18n';
import { defaultConsentScopes, isSensitiveScope, scopeLabel } from '../tokens/scopes';
import { readCsrfToken } from './session';

const consentApi = createApiClient({
  baseUrl: '',
  credentials: 'include',
  csrfToken: readCsrfToken,
});

export function ConsentPage() {
  const messages = useMessages();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState(params.get('redirect_uri') ?? '');
  const [offered, setOffered] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<'allow' | 'deny' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const resource = params.get('resource');
    void consentApi
      .oauthConsentDetails({
        client_id: params.get('client_id') ?? '',
        redirect_uri: params.get('redirect_uri') ?? '',
        scope: params.get('scope') ?? '',
        state: params.get('state') ?? '',
        code_challenge: params.get('code_challenge') ?? '',
        code_challenge_method: params.get('code_challenge_method') ?? 'S256',
        ...(resource === null || resource.length === 0 ? {} : { resource }),
      })
      .then((view) => {
        if (cancelled) return;
        setClientName(view.client_name);
        setRedirectUri(view.redirect_uri);
        setOffered([...view.scopes]);
        setChosen(defaultConsentScopes(view.scopes));
      })
      .catch(() => {
        if (!cancelled) setError(messages.consentFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messages.consentFailed, params, attempt]);

  async function decide(allow: boolean): Promise<void> {
    if (sending !== null || loading) return;
    setError(null);
    setSending(allow ? 'allow' : 'deny');
    const resource = params.get('resource');
    try {
      const response = await consentApi.oauthConsent({
        client_id: params.get('client_id') ?? '',
        redirect_uri: params.get('redirect_uri') ?? '',
        scope: chosen.join(' '),
        requested_scope: params.get('scope') ?? '',
        state: params.get('state') ?? '',
        code_challenge: params.get('code_challenge') ?? '',
        code_challenge_method: params.get('code_challenge_method') ?? 'S256',
        allow,
        ...(resource === null || resource.length === 0 ? {} : { resource }),
      });
      window.location.assign(response.redirect_to);
    } catch {
      setError(messages.consentFailed);
      setSending(null);
    }
  }

  return (
    <section className="screen-page oauth-consent" aria-busy={loading || sending !== null}>
      <h1>{messages.consentTitle}</h1>
      <p className="ui-muted">{messages.consentHint}</p>
      {loading ? (
        <SkeletonRows />
      ) : (
        <>
          {clientName !== null ? (
            <p>
              {messages.consentClient}: <strong>{clientName}</strong>
            </p>
          ) : null}
          <p className="consent-redirect">
            {messages.consentRedirect}: {redirectUri}
          </p>
          <fieldset className="consent-scopes" disabled={sending !== null}>
            <legend>{messages.tokenScopes}</legend>
            {offered.map((scope) => (
              <label key={scope}>
                <input
                  type="checkbox"
                  checked={chosen.includes(scope)}
                  onChange={(event) => {
                    setChosen((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((item) => item !== scope),
                    );
                  }}
                />
                <span>
                  {scopeLabel(scope, messages)}
                  {isSensitiveScope(scope) ? (
                    <span className="consent-sensitive"> ⚠ {messages.scopeSensitive}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="token-actions">
        <Button
          type="button"
          variant="primary"
          disabled={loading || sending !== null || chosen.length === 0}
          loading={sending === 'allow'}
          onClick={() => {
            void decide(true);
          }}
        >
          {messages.consentAllow}
        </Button>
        <Button
          type="button"
          disabled={loading || sending !== null}
          loading={sending === 'deny'}
          onClick={() => {
            void decide(false);
          }}
        >
          {messages.consentDeny}
        </Button>
      </div>
      {error !== null ? (
        <p role="alert">
          {error}{' '}
          <Button
            type="button"
            disabled={loading || sending !== null}
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            {messages.retry}
          </Button>
        </p>
      ) : null}
    </section>
  );
}
