import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Link as LinkIcon } from 'lucide-react';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { normalizeTaskUrl } from '@reflexionia/domain';
import { refreshTaskSurfaces } from './refresh';
import { apiMessage } from './api-message';
import { Button } from '../../components/ui';
import { runAction } from '../../components/run-action';
import './task-assets.css';
export function LinkSection({ taskId }: { readonly taskId: string }) {
  const messages = useMessages();
  const cache = useQueryClient();
  const links = useQuery({
    queryKey: ['task-links', taskId],
    queryFn: () => api.listTaskLinks(taskId),
    refetchInterval: 1000,
  });
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current);
  };
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['task-links', taskId] });
    await refreshTaskSurfaces(cache);
  };
  const save = async () => {
    const normalized = normalizeTaskUrl(url);
    if (!normalized) {
      setError(messages.taskLinkInvalid);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await api.addTaskLink(taskId, { url: normalized, ...(title ? { title } : {}) });
      await refresh();
      setAdding(false);
      setUrl('');
      setTitle('');
      setError('');
    } catch (caught) {
      setError(apiMessage(caught, messages));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await api.removeTaskLink(taskId, id);
      await refresh();
      setMenu(null);
      setError('');
    } catch (caught) {
      setError(apiMessage(caught, messages));
    }
  };
  return (
    <section className="detail-block task-links" aria-label={messages.taskLinks}>
      <h3>{messages.taskLinks}</h3>
      <ul className="attachment-chips">
        {(links.data?.items ?? []).map((link) => {
          const normalized = normalizeTaskUrl(link.url);
          if (!normalized) return null;
          const target = new URL(normalized);
          const host = target.hostname;
          return (
            <li key={link.id}>
              <a
                className="attachment-chip task-link-chip"
                href={normalized}
                target="_blank"
                rel="noopener noreferrer"
                title={link.title ?? link.url}
                onPointerDown={() => {
                  held.current = false;
                  hold.current = setTimeout(() => {
                    held.current = true;
                    setMenu(link.id);
                  }, 500);
                }}
                onPointerUp={cancelHold}
                onPointerCancel={cancelHold}
                onPointerLeave={cancelHold}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu(link.id);
                }}
                onClick={(event) => {
                  if (held.current) {
                    event.preventDefault();
                    held.current = false;
                  }
                }}
              >
                {host ? (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
                    onError={event => { event.currentTarget.style.visibility = 'hidden'; }}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <LinkIcon size={14} aria-hidden="true" />
                )}
                <span className="asset-name">{link.title ?? (host.length ? host : target.pathname)}</span>
              </a>
              <button
                className="asset-remove link-remove"
                data-open={menu === link.id}
                type="button"
                aria-label={messages.taskLinkRemove}
                onClick={() => { runAction(remove(link.id)); }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setAdding(true);
          setError('');
        }}
      >
        {messages.taskLinkAdd}
      </Button>
      {adding ? (
        <form
          className="link-form"
          onSubmit={(event) => {
            event.preventDefault();
            runAction(save());
          }}
        >
          <label>
            {messages.taskLinkUrl}
            <input value={url} maxLength={4096} onChange={(event) => { setUrl(event.target.value); }} />
          </label>
          <label>
            {messages.taskLinkTitle}
            <input
              value={title}
              maxLength={200}
              onChange={(event) => { setTitle(event.target.value); }}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {messages.taskLinkSave}
          </Button>
          <Button variant="ghost" onClick={() => { setAdding(false); }}>
            {messages.cancel}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className="link-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
