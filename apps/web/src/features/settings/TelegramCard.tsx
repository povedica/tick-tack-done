import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Send, Trash2, Unlink } from 'lucide-react';
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
import { ServiceActions, ServiceMark, StatusChip, type ServiceAction } from './integration-ui';

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}
interface Pairing {
  code: string;
  expires: number;
  bot: string;
}
function linkedStamp(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    short: `${pick('day')}/${pick('month')} ${pick('hour')}:${pick('minute')}`,
    full: date.toLocaleString(locale),
  };
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
    refetchInterval: (current) =>
      current.state.data?.linked !== true && pairing !== null && pairing.expires > Date.now()
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
      runAction(cache.invalidateQueries({ queryKey: ['notification-settings'] }));
    }
    previouslyLinked.current = linked;
  }, [linked, cache]);
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
  const handle = text(query.data?.username);
  const person = text(query.data?.display_name);
  const who = handle ? `@${handle}${person ? ` (${person})` : ''}` : person;
  const stamp = query.data?.linked_at ? linkedStamp(text(query.data.linked_at), locale) : null;
  const botName = text(query.data?.bot_username);
  const meta = botName
    ? stamp
      ? m.telegramBotMeta.replace('{bot}', botName).replace('{date}', stamp.short)
      : m.telegramBotMetaPlain.replace('{bot}', botName)
    : m.telegramBotFoot;
  const metaTitle = stamp ? m.telegramLinkedAt.replace('{date}', stamp.full) : undefined;
  return (
    <TelegramBotSettings
      status={query.data}
      onSaved={() => {
        setPairing(null);
      }}
    >
      {(controls) => {
        const sheetWho = who ? m.telegramAlertsTo.replace('{who}', who) : '';
        const sheetBits = [sheetWho, m.telegramBotFoot.replace(/\.$/, ''), metaTitle ?? ''].filter(
          (bit) => bit.length > 0,
        );
        const actions: ServiceAction[] = [];
        if (linked || blocked) {
          actions.push({
            id: 'test',
            label: m.notificationTest,
            icon: Send,
            link: true,
            disabled: busy || blocked || controls.busy,
            ...(who ? { detail: m.telegramTestDetail.replace('{who}', who) } : {}),
            onSelect: () => {
              runAction(
                action(() =>
                  api.testNotification('telegram').then(() => {
                    setNotice(m.notificationSent);
                  }),
                ),
              );
            },
          });
        }
        if (blocked) {
          actions.push({
            id: 'recheck',
            label: m.notificationRecheck,
            icon: RefreshCw,
            link: true,
            disabled: busy || controls.busy,
            onSelect: () => {
              runAction(action(() => api.recheckTelegram()));
            },
          });
        }
        if (controls.state === 'token_saved' || controls.state === 'error') {
          actions.push({
            id: 'retry',
            label: wt.retry,
            icon: RefreshCw,
            link: true,
            disabled: controls.busy,
            onSelect: () => {
              controls.retry();
            },
          });
        }
        if (controls.state !== 'none') {
          actions.push(
            {
              id: 'replace',
              label: wt.replace,
              icon: KeyRound,
              link: true,
              disabled: controls.busy,
              onSelect: () => {
                controls.toggleReplace();
              },
            },
            {
              id: 'remove',
              label: wt.remove,
              icon: Trash2,
              tone: 'danger',
              disabled: controls.busy,
              onSelect: () => {
                controls.remove();
              },
            },
          );
        }
        if (linked || blocked) {
          actions.push({
            id: 'unlink',
            label: m.telegramUnlinkTitle,
            icon: Unlink,
            tone: 'danger',
            disabled: busy,
            onSelect: () => {
              setConfirm(true);
            },
          });
        }
        return (
          <>
            <article className="integration-row telegram-card" aria-labelledby="telegram-title">
              <div className="integration-head">
                <div className="integration-id">
                  <ServiceMark name="telegram" />
                  <div className="integration-copy">
                    <div className="integration-name">
                      <h2 id="telegram-title">{m.notificationTelegram}</h2>
                      <StatusChip on={controls.state === 'linked'} status={controls.state}>
                        {wt[controls.state]}
                      </StatusChip>
                    </div>
                    <p className="integration-meta" title={metaTitle}>
                      {controls.username ? (
                        <a
                          href={`https://t.me/${encodeURIComponent(controls.username)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {meta}
                        </a>
                      ) : (
                        meta
                      )}
                    </p>
                  </div>
                </div>
                <ServiceActions
                  actions={actions}
                  label={m.notificationTelegram}
                  sheetHeader={
                    <div className="integration-sheet-intro">
                      <ServiceMark name="telegram" />
                      <div>
                        <strong>{m.notificationTelegram}</strong>
                        <p>{sheetBits.join(' · ')}</p>
                      </div>
                    </div>
                  }
                />
              </div>
              {linked || blocked ? (
                <div className="integration-services">
                  <div className="integration-switch">
                    <span className="integration-switch-label">
                      <strong>{m.telegramAlertsTo.split(' · ')[0]}</strong>
                      <span className="integration-detail">
                        {m.telegramAlertsTo
                          .split(' · ')
                          .slice(1)
                          .join(' · ')
                          .replace('{who}', who || '—')}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="notification-switch"
                      role="switch"
                      aria-label={m.telegramAlertsTo.replace('{who}', who || '—')}
                      aria-checked={query.data?.enabled !== false}
                      disabled={blocked}
                      onClick={() => {
                        runAction(
                          action(() =>
                            api.updateMe({ telegram_enabled: query.data?.enabled === false }),
                          ),
                        );
                      }}
                    >
                      <span />
                    </button>
                  </div>
                  {blocked ? <p role="alert">{m.notificationBlockedHelp}</p> : null}
                </div>
              ) : null}
              {notice ? (
                <p className="integration-follow" role="status">
                  {notice}
                </p>
              ) : null}
              <div className="integration-follow">
                {controls.localOnly}
                {state === 'webhook_ok' ? (
                  <>
                    {link && seconds > 0 ? (
                      <>
                        <a
                          className="telegram-open"
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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
                ) : controls.state === 'none' ? (
                  <p>{m.telegramUnconfigured}</p>
                ) : null}
                {controls.form}
                {controls.alerts}
                {error ? <p role="alert">{error}</p> : null}
              </div>
              <p className="integration-foot integration-follow">{m.telegramBotFoot}</p>
            </article>
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
          </>
        );
      }}
    </TelegramBotSettings>
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
