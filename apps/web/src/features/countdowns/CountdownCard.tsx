import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import type { Countdown } from './api';
import { countdownNumber } from './presentation';
import { useRef } from 'react';
import { Popover } from '../../components/Popover';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';

export function CountdownCard({
  countdown,
  archived,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onEdit,
  onArchive,
  onDelete,
  onPin,
}: {
  readonly countdown: Countdown;
  readonly archived: boolean;
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly onEdit: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
  readonly onPin: () => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const anchor = useRef<HTMLButtonElement>(null);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${countdown.effectiveDate.slice(0, 10)}T12:00:00Z`));
  const caption =
    countdown.kind === 'today'
      ? messages.countdownIsToday
      : (countdown.kind === 'until' ? messages.countdownUntil : messages.countdownSince).replace(
          '{date}',
          date,
        );
  return (
    <article
      className={`countdown-card${countdown.pinned ? ' is-pinned' : ''}`}
      data-kind={countdown.kind}
      data-color={countdown.color ?? 'none'}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!menuOpen) onToggleMenu();
      }}
    >
      <header>
        <span className="countdown-emoji" aria-hidden="true">
          {countdown.emoji ?? '⏳'}
        </span>
        <span className="countdown-title">{countdown.title}</span>
      </header>
      <div className="countdown-count">
        <strong className="countdown-number">{countdownNumber(countdown, locale)}</strong>
        {countdown.kind !== 'today' ? (
          <span className="countdown-unit">
            {countdown.days === 1 ? messages.countdownDay : messages.countdownDays}
          </span>
        ) : null}
      </div>
      <p title={caption}>{caption}</p>
      <div className="countdown-actions">
        <button
          type="button"
          ref={anchor}
          aria-label={messages.moreActions}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      <Popover
        open={menuOpen}
        onClose={onCloseMenu}
        label={messages.moreActions}
        anchor={anchor}
        className="popover popover-menu"
      >
        <div className="menu-group">
          {!archived ? (
            <button type="button" className="popover-row" role="menuitem" onClick={onEdit}>
              <Pencil size={16} aria-hidden="true" />
              <span>{messages.countdownEdit}</span>
            </button>
          ) : null}
          {!archived ? (
            <button type="button" className="popover-row" role="menuitem" onClick={onPin}>
              {countdown.pinned ? (
                <PinOff size={16} aria-hidden="true" />
              ) : (
                <Pin size={16} aria-hidden="true" />
              )}
              <span>{countdown.pinned ? messages.countdownUnpin : messages.countdownPin}</span>
            </button>
          ) : null}
          <button type="button" className="popover-row" role="menuitem" onClick={onArchive}>
            {archived ? (
              <ArchiveRestore size={16} aria-hidden="true" />
            ) : (
              <Archive size={16} aria-hidden="true" />
            )}
            <span>{archived ? messages.countdownUnarchive : messages.archive}</span>
          </button>
        </div>
        <div className="menu-group">
          <button
            type="button"
            className="popover-row is-danger"
            role="menuitem"
            onClick={onDelete}
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>{messages.purge}</span>
          </button>
        </div>
      </Popover>
    </article>
  );
}
