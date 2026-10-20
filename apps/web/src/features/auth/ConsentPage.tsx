import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError, createApiClient } from '@reflexionia/sdk';
import { messagesFor, type Messages } from '../../i18n';
import { readCsrfToken } from './session';

const consentApi = createApiClient({
  baseUrl: '',
  credentials: 'include',
  csrfToken: readCsrfToken,
});

const SCOPE_LABEL: Record<string, keyof Messages> = {
  'tasks:read': 'scopeTasksRead',
  'tasks:write': 'scopeTasksWrite',
  'lists:read': 'scopeListsRead',
  'lists:write': 'scopeListsWrite',
  'tags:read': 'scopeTagsRead',
  'tags:write': 'scopeTagsWrite',
  'filters:read': 'scopeFiltersRead',
  'filters:write': 'scopeFiltersWrite',
  'habits:read': 'scopeHabitsRead',
  'habits:write': 'scopeHabitsWrite',
  'focus:read': 'scopeFocusRead',
  'focus:write': 'scopeFocusWrite',
  'notes:read': 'scopeNotesRead',
  'notes:write': 'scopeNotesWrite',
  'calendar:read': 'scopeCalendarRead',
  'calendar:write': 'scopeCalendarWrite',
  'reminders:write': 'scopeRemindersWrite',
  'webhooks:manage': 'scopeWebhooksManage',
  'automations:manage': 'scopeAutomationsManage',
  'profile:read': 'scopeProfileRead',
  'profile:write': 'scopeProfileWrite',
  'backup:read': 'scopeBackupRead',
};

export function ConsentPage() {
  const messages = messagesFor(navigator.language);
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState(params.get('redirect_uri') ?? '');
  const [offered, setOffered] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);

  useEffect(() => {
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
        setClientName(view.client_name);
        setRedirectUri(view.redirect_uri);
        setOffered([...view.scopes]);
        setChosen([...view.scopes]);
      })
      .catch(() => {
        setError(messages.consentFailed);
      });
  }, [messages.consentFailed, params]);

  async function decide(allow: boolean): Promise<void> {
    setError(null);
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
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : messages.consentFailed);
    }
  }

  return (
    <main className="today">
      <h1>{messages.consentTitle}</h1>
      <p>{messages.consentHint}</p>
      {clientName !== null ? (
        <p>
          {messages.consentClient}: {clientName}
        </p>
      ) : null}
      <p>
        {messages.consentRedirect}: {redirectUri}
      </p>
      <fieldset>
        <legend>{messages.consentHint}</legend>
        {offered.map((scope) => {
          const labelKey = SCOPE_LABEL[scope];
          return (
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
              {labelKey === undefined ? scope : messages[labelKey]}
            </label>
          );
        })}
      </fieldset>
      <button
        type="button"
        disabled={chosen.length === 0}
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
