import { ArrowUpDown } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { Messages } from '../i18n';
import { Popover } from './Popover';

export function SortMenu({
  messages,
  children,
}: {
  readonly messages: Messages;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <div className="sort-menu">
      <button
        ref={anchor}
        type="button"
        className="icon-button"
        aria-label={messages.sortBy}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <ArrowUpDown size={20} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        anchor={anchor}
        label={messages.sortBy}
        className="menu-card view-menu-popover sort-menu-popover"
        width={300}
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="sort-options" id={id}>
          {children}
        </div>
      </Popover>
    </div>
  );
}
