import { ApiError } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { Button, Modal } from '../../components/ui';
import { useMessages } from '../../i18n';

type Expiry = 'never' | 'day' | 'week' | 'month' | 'date';

export function PublicLinkSettings({ projectId }: { readonly projectId: string }) {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const link = useQuery({
    queryKey: ['public-link', projectId],
    queryFn: () => api.getPublicLink(projectId),
  });
  const [url, setUrl] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<Expiry>('never');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState(true);
  const [confirm, setConfirm] = useState<'create' | 'regenerate' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const active = link.data?.active === true;

  async function refresh(): Promise<void> {
    await link.refetch();
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
  }

  async function publish(): Promise<void> {
    setError(null);
    try {
      const created = await api.createPublicLink(projectId, {
        includeNotes: notes,
        expiresAt: expiryValue(expiry, date),
      });
      setUrl(typeof created.url === 'string' ? created.url : null);
      setConfirm(null);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : messages.settingsFailed);
    }
  }

  return (
    <section className="token-panel" aria-label={messages.publicLinkTitle}>
      <h2>{messages.publicLinkTitle}</h2>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={messages.publicLinkSwitch}
        onClick={() => {
          setConfirm(active ? 'revoke' : 'create');
        }}
      >
        {active ? messages.publicLinkActiveHint : messages.publicLinkOff}
      </button>
      {url !== null ? (
        <p>
          <input readOnly value={url} aria-label={messages.publicLinkTitle} />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => {
                  setCopied(true);
                })
                .catch(() => undefined);
            }}
          >
            {messages.publicLinkCopy}
          </Button>
          {copied ? <span role="status">{messages.publicLinkCopied}</span> : null}
        </p>
      ) : null}
      {active ? (
        <p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConfirm('regenerate');
            }}
          >
            {messages.publicLinkRegenerate}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConfirm('revoke');
            }}
          >
            {messages.publicLinkDisable}
          </Button>
        </p>
      ) : null}
      <label>
        {messages.publicLinkExpiry}
        <select
          value={expiry}
          onChange={(event) => {
            const next = event.target.value;
            if (
              next === 'never' ||
              next === 'day' ||
              next === 'week' ||
              next === 'month' ||
              next === 'date'
            ) {
              setExpiry(next);
            }
          }}
        >
          <option value="never">{messages.publicLinkNever}</option>
          <option value="day">{messages.publicLinkDay}</option>
          <option value="week">{messages.publicLinkWeek}</option>
          <option value="month">{messages.publicLinkMonth}</option>
          <option value="date">{messages.publicLinkDate}</option>
        </select>
      </label>
      {expiry === 'date' ? (
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={notes}
          onChange={(event) => {
            setNotes(event.target.checked);
            if (active) {
              void api
                .updatePublicLink(projectId, { includeNotes: event.target.checked })
                .then(() => refresh())
                .catch(() => undefined);
            }
          }}
        />
        {messages.publicLinkNotes}
      </label>
      {error !== null ? <p role="alert">{error}</p> : null}
      {confirm === 'create' ? (
        <Modal
          title={messages.publicLinkTitle}
          onClose={() => {
            setConfirm(null);
          }}
        >
          <p>{messages.publicLinkWarning}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void publish().catch(() => undefined);
            }}
          >
            {messages.publicLinkSwitch}
          </Button>
        </Modal>
      ) : null}
      {confirm === 'regenerate' ? (
        <Modal
          title={messages.publicLinkRegenerate}
          danger
          onClose={() => {
            setConfirm(null);
          }}
        >
          <p>{messages.publicLinkRegenerateWarning}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void api
                .regeneratePublicLink(projectId)
                .then((created) => {
                  setUrl(typeof created.url === 'string' ? created.url : null);
                  setConfirm(null);
                  return refresh();
                })
                .catch(() => undefined);
            }}
          >
            {messages.publicLinkRegenerate}
          </Button>
        </Modal>
      ) : null}
      {confirm === 'revoke' ? (
        <Modal
          title={messages.publicLinkDisable}
          danger
          onClose={() => {
            setConfirm(null);
          }}
        >
          <p>{messages.publicLinkRegenerateWarning}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void api
                .revokePublicLink(projectId)
                .then(() => {
                  setUrl(null);
                  setConfirm(null);
                  return refresh();
                })
                .catch(() => undefined);
            }}
          >
            {messages.publicLinkDisable}
          </Button>
        </Modal>
      ) : null}
    </section>
  );
}

function expiryValue(expiry: Expiry, date: string): string | null {
  const day = 24 * 60 * 60 * 1000;
  if (expiry === 'never') {
    return null;
  }
  if (expiry === 'day') {
    return new Date(Date.now() + day).toISOString();
  }
  if (expiry === 'week') {
    return new Date(Date.now() + 7 * day).toISOString();
  }
  if (expiry === 'month') {
    return new Date(Date.now() + 30 * day).toISOString();
  }
  if (date.length === 0) {
    return null;
  }
  return new Date(`${date}T23:59:59`).toISOString();
}
