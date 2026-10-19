import { Check, Flag } from 'lucide-react';
import { useMessages } from '../i18n';
import { Popover } from './Popover';

const ORDER = ['high', 'medium', 'low', 'none'] as const;
export type PriorityValue = (typeof ORDER)[number];

export function PriorityMenu({
  open,
  value,
  onClose,
  onChange,
}: {
  readonly open: boolean;
  readonly value: PriorityValue;
  readonly onClose: () => void;
  readonly onChange: (next: PriorityValue) => void;
}) {
  const messages = useMessages();
  const labels: Record<PriorityValue, string> = {
    high: messages.priorityHigh,
    medium: messages.priorityMedium,
    low: messages.priorityLow,
    none: messages.priorityNone,
  };
  return (
    <Popover
      open={open}
      label={messages.prioritySet}
      onClose={onClose}
      className="popover popover-menu"
    >
      <ul className="popover-list">
        {ORDER.map((priority) => (
          <li key={priority}>
            <button
              type="button"
              className="popover-row"
              aria-checked={value === priority}
              role="menuitemradio"
              onClick={() => {
                onChange(priority);
                onClose();
              }}
            >
              <Flag size={14} color={`var(--prio-${priority})`} aria-hidden="true" />
              <span>{labels[priority]}</span>
              {value === priority ? <Check size={14} aria-hidden="true" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
