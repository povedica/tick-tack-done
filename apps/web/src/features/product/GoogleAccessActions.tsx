import { Button } from '../../components/ui';
import type { Messages } from '../../i18n';
import { useEffect, useRef } from 'react';
import './google-access.css';

export function googleAuthorizationUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_google_url');
  const url = new URL(value);
  if (url.origin !== 'https://accounts.google.com') throw new Error('invalid_google_url');
  return url.href;
}

export function GoogleAccessActions({
  messages,
  connected,
  configured,
  confirming,
  busy,
  error,
  onConnect,
  onRequestDisconnect,
  onCancel,
  onConfirm,
  removeImportedEvents = false,
  onRemoveImportedEvents,
}: {
  readonly messages: Messages;
  readonly connected: boolean;
  readonly configured: boolean;
  readonly confirming: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConnect: () => void;
  readonly onRequestDisconnect: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly removeImportedEvents?: boolean;
  readonly onRemoveImportedEvents?: (remove: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirming) dialog.current?.showModal();
  }, [confirming]);
  return (
    <>
      <div className="token-actions">
        {connected || configured ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy || !configured}
            onClick={onConnect}
          >
            {connected ? messages.googleReconnect : messages.googleConnect}
          </Button>
        ) : null}
        {connected ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onRequestDisconnect}
          >
            {messages.googleDisconnect}
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <dialog
          ref={dialog}
          className="ui-modal google-disconnect-dialog"
          role="alertdialog"
          aria-label={messages.googleDisconnect}
          onCancel={(event) => {
            event.preventDefault();
            onCancel();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onCancel();
          }}
        >
          <p>{messages.googleDisconnectBody}</p>
          <ul>
            <li>{messages.googleDisconnectCalendars}</li>
            <li>{messages.googleDisconnectAttachments}</li>
            <li>{messages.googleDisconnectRevoke}</li>
          </ul>
          <label className="google-remove-events">
            <input
              type="checkbox"
              checked={removeImportedEvents}
              onChange={(event) => {
                onRemoveImportedEvents?.(event.target.checked);
              }}
            />
            {messages.googleDisconnectRemoveEvents}
          </label>
          {error !== null ? <p role="alert">{error}</p> : null}
          <div className="token-actions">
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
              {messages.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={busy}
              disabled={busy}
              onClick={onConfirm}
            >
              {messages.googleDisconnect}
            </Button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

export function googleCallbackNotice(params: URLSearchParams): {
  readonly notice: 'connected' | 'error' | 'denied';
  readonly params: URLSearchParams;
} | null {
  const notice = params.get('google');
  if (notice !== 'connected' && notice !== 'error' && notice !== 'denied') return null;
  const cleaned = new URLSearchParams(params);
  cleaned.delete('google');
  return { notice, params: cleaned };
}
