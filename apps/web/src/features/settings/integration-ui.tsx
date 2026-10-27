import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Ellipsis, Info, Mail, Send, type LucideIcon } from 'lucide-react';
import { Popover } from '../../components/Popover';
import { useMessages } from '../../i18n';
import './integrations.css';

export interface ServiceAction {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon: LucideIcon;
  readonly tone?: 'danger';
  /** Desktop text link. Destructive actions stay in the overflow. */
  readonly link?: boolean;
  /** Set false to keep a non-link out of the desktop overflow (it still opens in the mobile sheet). */
  readonly menu?: boolean;
  readonly href?: string;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
}

const DESKTOP_QUERY = '(min-width: 768px)';

export function useDesktopIntegrations() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DESKTOP_QUERY);
    const sync = () => {
      setDesktop(media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);
  return desktop;
}

function shownInMenu(action: ServiceAction, desktop: boolean) {
  if (!desktop) return true;
  if (action.menu === false) return false;
  if (action.tone === 'danger' || action.menu === true) return true;
  return action.link !== true;
}

export function ServiceMark({ name }: { readonly name: 'google' | 'telegram' | 'mail' }) {
  const Icon = name === 'telegram' ? Send : name === 'mail' ? Mail : CalendarDays;
  return (
    <span className={`integration-mark is-${name}`} aria-hidden="true">
      <Icon size={18} strokeWidth={2} />
    </span>
  );
}

export function StatusChip({
  on,
  children,
  status,
}: {
  readonly on: boolean;
  readonly children: string;
  readonly status?: string;
}) {
  return (
    <span
      className={`integration-chip${on ? ' is-on' : ''}${status ? ' telegram-status' : ''}`}
      data-status={status}
      role="status"
    >
      {children}
    </span>
  );
}

export function InfoTip({ label, text }: { readonly label: string; readonly text: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="integration-info"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Info size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        anchor={anchor}
        label={label}
        mobileSheet
        mobileSheetMaxWidth={767}
        width={320}
        onClose={() => {
          setOpen(false);
        }}
        className="popover integration-popover integration-tip"
      >
        <p>{text}</p>
      </Popover>
    </>
  );
}

function LinkAction({ action }: { readonly action: ServiceAction }) {
  if (action.href) {
    return (
      <a className="integration-link" href={action.href} target="_blank" rel="noopener noreferrer">
        {action.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="integration-link"
      disabled={action.disabled}
      onClick={action.onSelect}
    >
      {action.label}
    </button>
  );
}

function MenuAction({
  action,
  onDone,
}: {
  readonly action: ServiceAction;
  readonly onDone: () => void;
}) {
  const Icon = action.icon;
  const className = `integration-menu-row${action.tone === 'danger' ? ' is-danger' : ''}`;
  const content = (
    <>
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      <span>
        {action.label}
        {action.detail ? <small>{action.detail}</small> : null}
      </span>
    </>
  );
  if (action.href) {
    return (
      <a
        className={className}
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onDone}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={action.disabled}
      onClick={() => {
        onDone();
        action.onSelect?.();
      }}
    >
      {content}
    </button>
  );
}

export function ServiceActions({
  actions,
  label,
  sheetHeader,
}: {
  readonly actions: readonly ServiceAction[];
  readonly label: string;
  readonly sheetHeader?: ReactNode;
}) {
  const messages = useMessages();
  const desktop = useDesktopIntegrations();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const links = desktop
    ? actions.filter((action) => action.link === true && action.tone !== 'danger')
    : [];
  const menuItems = actions.filter((action) => shownInMenu(action, desktop));
  const safe = menuItems.filter((action) => action.tone !== 'danger');
  const danger = menuItems.filter((action) => action.tone === 'danger');
  const close = () => {
    setOpen(false);
  };
  if (links.length === 0 && menuItems.length === 0) return null;
  return (
    <div className="integration-tools">
      {links.length > 0 ? (
        <div className="integration-links">
          {links.map((action, index) => (
            <span key={action.id} className="integration-link-item">
              {index > 0 ? (
                <span className="integration-dot" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <LinkAction action={action} />
            </span>
          ))}
        </div>
      ) : null}
      {menuItems.length > 0 ? (
        <>
          <button
            ref={anchor}
            type="button"
            className="integration-more"
            aria-label={messages.moreActions}
            aria-haspopup={desktop ? 'menu' : 'dialog'}
            aria-expanded={open}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            <Ellipsis size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <Popover
            open={open}
            anchor={anchor}
            label={label}
            mobileSheet
            mobileSheetMaxWidth={767}
            width={320}
            sheetHeader={sheetHeader}
            onClose={close}
            className="popover integration-popover"
          >
            <div className="integration-menu">
              {safe.map((action) => (
                <MenuAction key={action.id} action={action} onDone={close} />
              ))}
              {safe.length > 0 && danger.length > 0 ? (
                <div className="integration-menu-sep" role="separator" />
              ) : null}
              {danger.map((action) => (
                <MenuAction key={action.id} action={action} onDone={close} />
              ))}
            </div>
          </Popover>
        </>
      ) : null}
    </div>
  );
}
