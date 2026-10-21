import { MoreHorizontal, Pin } from 'lucide-react';
import type { Countdown } from './api';
import { dateLabel, countdownNumber } from './presentation';

export function CountdownCard({
  countdown,
  archived,
  onEdit,
  onArchive,
  onDelete,
  onPin,
}: {
  readonly countdown: Countdown;
  readonly archived: boolean;
  readonly onEdit: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
  readonly onPin: () => void;
}) {
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
        <span className="countdown-title">
          <span aria-hidden="true">{countdown.emoji ?? '⏳'}</span>
          {countdown.title}
        </span>
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
          <details>
            <summary aria-label="Abrir acciones">
              <MoreHorizontal size={18} />
            </summary>
            <div className="countdown-menu">
              {!archived ? (
                <button type="button" onClick={onEdit}>
                  Editar
                </button>
              ) : null}
              {!archived ? (
                <button type="button" onClick={onPin}>
                  {countdown.pinned ? 'Desfijar' : 'Fijar'}
                </button>
              ) : null}
              <button type="button" onClick={onArchive}>
                {archived ? 'Desarchivar' : 'Archivar'}
              </button>
              <button type="button" className="is-danger" onClick={onDelete}>
                Eliminar
              </button>
            </div>
          </details>
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
