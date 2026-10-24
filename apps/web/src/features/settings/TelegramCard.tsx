import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button, Modal } from '../../components/ui';
import { runAction } from '../../components/run-action';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { failureMessage } from '../../failure';
import { TotpQr } from './TotpQr';
import './telegram.css';
import { telegramUiState, useWtCMessages } from './i18n-wt-c';
import { TelegramBotSettings } from './TelegramBotSettings';
function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}
interface Pairing {
  code: string;
  expires: number;
  bot: string;
}
export function TelegramCard() {
  const m = useMessages();
  const wt = useWtCMessages();
  const locale = useAppLocale();
  const cache = useQueryClient();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [desktop, setDesktop] = useState(
    () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(min-width:1024px)').matches,
  );
  const closeDialog = useCallback(() => {
    setConfirm(false);
  }, []);
  const pending = useRef(false);
  const previouslyLinked = useRef<boolean | null>(null);
  const query = useQuery({
    queryKey: ['telegram'],
    queryFn: () => api.integrationStatus('telegram'),
    refetchInterval: (query) =>
      query.state.data?.linked !== true && pairing !== null && pairing.expires > Date.now()
        ? 2000
        : false,
  });
  const state = telegramUiState(query.data);
  const linked = state === 'linked';
  const blocked = state === 'blocked';
  const code = pairing?.code ?? '';
  const bot = pairing?.bot ?? text(query.data?.bot_username);
  const seconds = Math.max(0, Math.ceil(((pairing?.expires ?? now) - now) / 1000));
  const link =
    /^[A-Za-z0-9_]{1,64}$/.test(bot) && /^[A-Za-z0-9_-]{1,100}$/.test(code)
      ? `https://t.me/${bot}?start=${code}`
      : null;
  const generate = async () => {
    if (pending.current) return;
    pending.current = true;
    setError('');
    try {
      const body = await api.createTelegramPairing();
      setPairing({
        code: text(body.code),
        expires: Date.parse(text(body.expires_at)),
        bot: text(body.bot_username) || text(query.data?.bot_username),
      });
    } catch (caught) {
      setError(failureMessage(caught, m.telegramPairingFailed));
    } finally {
      pending.current = false;
    }
  };
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(min-width:1024px)');
    const changed = () => {
      setDesktop(media.matches);
    };
    media.addEventListener('change', changed);
    return () => {
      media.removeEventListener('change', changed);
    };
  }, []);
  useEffect(() => {
    if (state === 'webhook_ok' && pairing === null) runAction(generate());
  }, [state, pairing]);
  useEffect(() => {
    if (linked && previouslyLinked.current === false) {
      setNotice(m.telegramConnectionNotice);
      runAction(cache.invalidateQueries({ queryKey: ['notification-settings'] }));
    }
    previouslyLinked.current = linked;
  }, [linked, m.telegramConnectionNotice, cache]);
  const action = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (caught) {
      setError(failureMessage(caught, m.settingsFailed));
    } finally {
      await query.refetch();
      await cache.invalidateQueries({ queryKey: ['notification-settings'] });
      setBusy(false);
    }
  };
  const unlink = async () => {
    await api.disconnectTelegram();
    setConfirm(false);
    setPairing(null);
  };
  return (
    <section className="token-panel telegram-card" aria-labelledby="telegram-title">
      <div className="token-panel-head">
        <h2 id="telegram-title">{m.notificationTelegram}</h2>
        <span className="telegram-status" data-status={state}>
          {wt[state]}
        </span>
      </div>
      <TelegramBotSettings
        status={query.data}
        onSaved={() => {
          setPairing(null);
        }}
      />
      {notice ? <p role="status">{notice}</p> : null}
      {linked || blocked ? (
        <>
          <p>
            {text(query.data?.username)
              ? m.telegramConnectedAs
                  .replace('{username}', text(query.data?.username))
                  .replace('{name}', text(query.data?.display_name) || '—')
              : `${wt.linked}: ${text(query.data?.display_name) || wt.linked}`}
          </p>
          {query.data?.linked_at ? (
            <p className="token-meta">
              {m.telegramLinkedAt.replace(
                '{date}',
                new Date(text(query.data.linked_at)).toLocaleString(locale),
              )}
            </p>
          ) : null}
          {blocked ? <p role="alert">{m.notificationBlockedHelp}</p> : null}
          <label className="telegram-notify-switch">
            <span>{m.telegramReceive}</span>
            <input
              type="checkbox"
              role="switch"
              checked={query.data?.enabled !== false}
              onChange={(event) => {
                runAction(action(() => api.updateMe({ telegram_enabled: event.target.checked })));
              }}
            />
          </label>
          <div className="telegram-actions">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || blocked}
              onClick={() => {
                runAction(
                  action(() =>
                    api.testNotification('telegram').then(() => {
                      setNotice(m.notificationSent);
                    }),
                  ),
                );
              }}
            >
              {m.notificationTest}
            </Button>
            {blocked ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  runAction(action(() => api.recheckTelegram()));
                }}
              >
                {m.notificationRecheck}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirm(true);
              }}
            >
              {m.telegramUnlinkTitle}
            </Button>
          </div>
        </>
      ) : state === 'webhook_ok' ? (
        <>
          {link && seconds > 0 ? (
            <>
              <a className="telegram-open" href={link} target="_blank" rel="noopener noreferrer">
                {m.telegramOpen}
              </a>
              {desktop ? (
                <div className="telegram-qr">
                  <TotpQr value={link} label={m.telegramQr} size={160} />
                </div>
              ) : null}
              <p className="token-meta">
                {m.telegramExpires.replace(
                  '{time}',
                  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`,
                )}
              </p>
              <p className="token-meta">{m.telegramWaiting}</p>
            </>
          ) : pairing ? (
            <p>{seconds <= 0 ? m.telegramExpired : m.telegramBotUnavailable}</p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              runAction(generate());
            }}
          >
            {m.telegramRegenerate}
          </Button>
          {pairing ? (
            <details>
              <summary>{m.telegramManualFallback}</summary>
              <p className="telegram-manual">
                {m.telegramManualCommand.replace('{code}', code).replace('{bot}', bot)}
              </p>
            </details>
          ) : null}
        </>
      ) : state === 'none' ? (
        <p>{m.telegramUnconfigured}</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {confirm ? (
        <UnlinkDialog
          title={m.telegramUnlinkTitle}
          body={m.telegramUnlinkConfirm}
          cancel={m.cancel}
          confirm={m.telegramUnlinkAction}
          busy={busy}
          onClose={closeDialog}
          onConfirm={() => {
            runAction(action(unlink));
          }}
        />
      ) : null}
    </section>
  );
}

function UnlinkDialog({
  title,
  body,
  cancel,
  confirm,
  busy,
  onClose,
  onConfirm,
}: {
  readonly title: string;
  readonly body: string;
  readonly cancel: string;
  readonly confirm: string;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);
  return (
    <Modal title={title} onClose={onClose}>
      <div ref={ref}>
        <p>{body}</p>
        <Button variant="ghost" onClick={onClose}>
          {cancel}
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {confirm}
        </Button>
      </div>
    </Modal>
  );
}
