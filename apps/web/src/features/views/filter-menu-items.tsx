import {
  Copy,
  Pencil,
  Pin,
  PinOff,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Messages } from '../../i18n';

export type FilterMenuActionId = 'conditions' | 'name' | 'pin' | 'duplicate' | 'delete';

export interface FilterMenuAction {
  readonly id: FilterMenuActionId;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly danger: boolean;
  readonly separatorBefore: boolean;
}

export function filterMenuItems(messages: Messages, pinned: boolean): readonly FilterMenuAction[] {
  return [
    {
      id: 'conditions',
      label: messages.filterEditConditions,
      icon: SlidersHorizontal,
      danger: false,
      separatorBefore: false,
    },
    {
      id: 'name',
      label: messages.filterEditName,
      icon: Pencil,
      danger: false,
      separatorBefore: false,
    },
    {
      id: 'pin',
      label: pinned ? messages.filterUnpin : messages.filterPinTop,
      icon: pinned ? PinOff : Pin,
      danger: false,
      separatorBefore: false,
    },
    {
      id: 'duplicate',
      label: messages.duplicateFilter,
      icon: Copy,
      danger: false,
      separatorBefore: false,
    },
    {
      id: 'delete',
      label: messages.filterDelete,
      icon: Trash2,
      danger: true,
      separatorBefore: true,
    },
  ];
}

export function FilterMenuButtons({
  messages,
  pinned,
  onSelect,
}: {
  readonly messages: Messages;
  readonly pinned: boolean;
  readonly onSelect: (id: FilterMenuActionId) => void;
}) {
  return (
    <>
      {filterMenuItems(messages, pinned).map((item) => {
        const Icon = item.icon;
        return (
          <span key={item.id} className="filter-menu-slot">
            {item.separatorBefore ? <div className="menu-sep" role="separator" /> : null}
            <button
              type="button"
              className={item.danger ? 'menu-item is-danger' : 'menu-item'}
              role="menuitem"
              onClick={() => {
                onSelect(item.id);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          </span>
        );
      })}
    </>
  );
}
