import { MoreHorizontal, Pin } from 'lucide-react';
import type { Countdown } from './api';
import { dateLabel, countdownNumber } from './presentation';
import { useRef } from 'react';
import { Popover } from '../../components/Popover';
import { useMessages } from '../../i18n';

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
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <article
      className="countdown-card"
      data-color={countdown.color ?? 'none'}
      onContextMenu={(event) => {
        event.preventDefault();
        onEdit();
      }}
    >
      <header>
        <span className="countdown-emoji" aria-hidden="true">
          {countdown.emoji ?? '⏳'}
        </span>
        <span className="countdown-title">{countdown.title}</span>
        <div className="countdown-actions">
          {!archived ? (
            <button
              type="button"
              aria-label={countdown.pinned ? 'Desfijar' : 'Fijar'}
              onClick={onPin}
            >
              <Pin size={15} fill={countdown.pinned ? 'currentColor' : 'none'} />
            </button>
          ) : null}
          <>
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
            <Popover
              open={menuOpen}
              onClose={onCloseMenu}
              label={messages.moreActions}
              anchor={anchor}
              className="popover countdown-menu"
            >
              {!archived ? (
                <button type="button" role="menuitem" onClick={onEdit}>
                  Editar
                </button>
              ) : null}
              {!archived ? (
                <button type="button" role="menuitem" onClick={onPin}>
                  {countdown.pinned ? 'Desfijar' : 'Fijar'}
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={onArchive}>
                {archived ? 'Desarchivar' : 'Archivar'}
              </button>
              <button type="button" role="menuitem" className="is-danger" onClick={onDelete}>
                Eliminar
              </button>
            </Popover>
          </>
        </div>
      </header>
      <strong className="countdown-number">{countdownNumber(countdown)}</strong>
      <p>
        {countdown.kind === 'today'
          ? ''
          : `${countdown.days === 1 ? 'día' : 'días'} · ${countdown.kind === 'until' ? 'hasta' : 'desde'} `}
        {dateLabel(countdown.effectiveDate)}
      </p>
    </article>
  );
}
