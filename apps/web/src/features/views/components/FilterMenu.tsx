import { Copy, Funnel, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { Popover } from '../../../components/Popover';
import { fill, useMessages } from '../../../i18n';

export function FilterMenu({
  name,
  color,
  pinned,
  summary,
  countLabel,
  anchor,
  onClose,
  onEdit,
  onPin,
  onDuplicate,
  onDelete,
}: {
  readonly name: string;
  readonly color: string | null;
  readonly pinned: boolean;
  readonly summary: string;
  readonly countLabel: string;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onPin: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}) {
  const messages = useMessages();
  const menuRef = useRef<HTMLDivElement>(null);
  const tint = color === null ? undefined : ({ '--list-tint': color } as CSSProperties);

  useEffect(() => {
    const menu = menuRef.current;
    const first = menu?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      anchor.current?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const next =
      event.key === 'ArrowDown'
        ? items[(current + 1 + items.length) % items.length]
        : items[(current - 1 + items.length) % items.length];
    next?.focus();
  }

  const items = (
    <div ref={menuRef} className="filter-menu" role="menu" onKeyDown={onKeyDown}>
      <button type="button" className="menu-item" role="menuitem" onClick={onEdit}>
        <Pencil size={16} aria-hidden="true" />
        {messages.filterEdit}
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onPin}>
        {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
        {pinned ? messages.filterUnpin : messages.filterPinTop}
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onDuplicate}>
        <Copy size={16} aria-hidden="true" />
        {messages.duplicateFilter}
      </button>
      <div className="menu-sep" role="separator" />
      <button type="button" className="menu-item is-danger" role="menuitem" onClick={onDelete}>
        <Trash2 size={16} aria-hidden="true" />
        {messages.filterDelete}
      </button>
    </div>
  );

  return (
    <Popover
      open
      label={fill(messages.filterActions, name)}
      anchor={anchor}
      onClose={() => {
        onClose();
        anchor.current?.focus();
      }}
      mobileSheet
      sheetHeader={
        <div className="filter-sheet-head" style={tint}>
          <Funnel className="nav-filter-icon" size={18} aria-hidden="true" />
          <div>
            <strong>{name}</strong>
            <p>
              {countLabel}
              {summary.length > 0 ? ` · ${summary}` : ''}
            </p>
          </div>
        </div>
      }
    >
      {items}
    </Popover>
  );
}
