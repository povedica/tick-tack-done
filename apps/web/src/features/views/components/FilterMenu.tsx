import { Funnel } from 'lucide-react';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Popover } from '../../../components/Popover';
import { fill, useMessages } from '../../../i18n';
import { FilterMenuButtons, type FilterMenuActionId } from '../filter-menu-items';

export function FilterMenu({
  name,
  color,
  pinned,
  summary,
  chips,
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
  readonly chips?: ReactNode;
  readonly countLabel: string;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onEdit: (focus: 'conditions' | 'name') => void;
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

  function select(id: FilterMenuActionId): void {
    onClose();
    if (id === 'conditions') {
      onEdit('conditions');
    } else if (id === 'name') {
      onEdit('name');
    } else if (id === 'pin') {
      onPin();
    } else if (id === 'duplicate') {
      onDuplicate();
    } else {
      onDelete();
    }
  }

  const items = (
    <div ref={menuRef} className="filter-menu" role="menu" onKeyDown={onKeyDown}>
      <FilterMenuButtons messages={messages} pinned={pinned} onSelect={select} />
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
            {chips ?? null}
            <p>
              {countLabel}
              {chips === undefined && summary.length > 0 ? ` · ${summary}` : ''}
            </p>
          </div>
        </div>
      }
    >
      {items}
    </Popover>
  );
}
