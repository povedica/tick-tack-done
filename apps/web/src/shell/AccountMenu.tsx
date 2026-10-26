import { markSession } from '../features/auth/session';
import { runAction } from '../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react';
import { BarChart3, Flame, Keyboard, LogOut, Palette, Settings } from 'lucide-react';
import { api } from '../api';
import { useMessages } from '../i18n';
import { useControlSummary } from '../features/statistics/ControlSummary';
import { useStatisticsText } from '../features/statistics/text';
import './account-menu.css';

/** TTD-AUD-77 / RF-1602: the avatar is the only shell entry to personal progress. */
export function AccountMenu() {
  const messages = useMessages();
  const { t, number, countDays } = useStatisticsText();
  const progress = useControlSummary();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'right-start',
    middleware: [offset(8), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const cache = useQueryClient();
  const navigate = useNavigate();
  const name = me.data?.display_name.trim().length
    ? me.data.display_name
    : (me.data?.email ?? messages.settingsAccount);
  const score =
    progress.achievement.enabled === false || typeof progress.achievement.score !== 'number'
      ? null
      : progress.achievement.score;
  const state = score === null ? 'empty' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'behind';
  const label = t(
    score === null
      ? 'noControl'
      : score >= 75
        ? 'controlGood'
        : score >= 50
          ? 'controlFair'
          : 'controlBehind',
  );
  const days = countDays(progress.streak);
  const scoreLabel = messages.controlScoreOf.replace(
    '{score}',
    score === null ? '—' : number(score),
  );
  function close() {
    setOpen(false);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      (refs.domReference.current as HTMLElement | null)?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-trigger"
        ref={(node) => {
          refs.setReference(node);
        }}
        aria-label={messages.accountMenu}
        title={name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...getReferenceProps({
          onClick: () => {
            setOpen(!open);
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          },
        })}
      >
        <span className="account-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
      </button>
      {open ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} closeOnFocusOut returnFocus>
            <div
              ref={(node) => {
                refs.setFloating(node);
                menu.current = node;
              }}
              id={menuId}
              role="menu"
              aria-label={messages.accountMenu}
              className="account-menu-popover"
              style={floatingStyles}
              {...getFloatingProps({ onKeyDown })}
            >
              <div className="account-menu-identity" role="presentation">
                <span className="account-avatar" aria-hidden="true">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{name}</strong>
                  <span>{me.data?.email}</span>
                </div>
              </div>
              <p className="sr-only">{messages.accountProgress}</p>
              {progress.isPending ? (
                <div className="account-progress-loading" role="status" aria-label={t('loading')}>
                  <span />
                  <span />
                </div>
              ) : progress.isError ? (
                <div className="account-progress-error">
                  <p role="alert">{t('error')}</p>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      runAction(progress.refetch());
                    }}
                  >
                    {t('retry')}
                  </button>
                </div>
              ) : (
                <Link
                  role="menuitem"
                  tabIndex={0}
                  to="/statistics"
                  onClick={close}
                  className="account-progress"
                  data-state={state}
                  aria-label={messages.accountProgressLabel
                    .replace('{days}', days)
                    .replace('{score}', scoreLabel)
                    .replace('{state}', label)}
                >
                  <span className="account-progress-streak">
                    <Flame size={16} aria-hidden="true" />
                    <strong>{number(progress.streak)}</strong>
                    <small>{days}</small>
                  </span>
                  <span className="account-progress-score">
                    <span className="account-progress-value">
                      <strong>{score === null ? '—' : number(score)}</strong>
                      <small>/100</small>
                    </span>
                    <progress max={100} value={score ?? 0} aria-label={t('achievement')} />
                    <small className="account-progress-label">{label}</small>
                  </span>
                </Link>
              )}
              <div className="account-menu-links" role="presentation">
                <Link role="menuitem" tabIndex={-1} to="/settings" onClick={close}>
                  <Settings size={16} aria-hidden="true" />
                  {messages.navSettings}
                </Link>
                <Link role="menuitem" tabIndex={-1} to="/statistics" onClick={close}>
                  <BarChart3 size={16} aria-hidden="true" />
                  {messages.navStatistics}
                </Link>
                <Link role="menuitem" tabIndex={-1} to="/settings/appearance" onClick={close}>
                  <Palette size={16} aria-hidden="true" />
                  {messages.themeLabel}
                </Link>
                <Link role="menuitem" tabIndex={-1} to="/settings/shortcuts" onClick={close}>
                  <Keyboard size={16} aria-hidden="true" />
                  {messages.shortcutsTitle}
                </Link>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  type="button"
                  className="account-sign-out"
                  onClick={() => {
                    close();
                    runAction(
                      api.logout().then(() => {
                        markSession('anonymous');
                        cache.clear();
                        runAction(Promise.resolve(navigate('/login', { replace: true })));
                      }),
                    );
                  }}
                >
                  <LogOut size={16} aria-hidden="true" />
                  {messages.signOut}
                </button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
