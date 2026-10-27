import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Popover } from '../../../components/Popover';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanAction } from '@reflexionia/domain';

const DEFAULT_ACTIONS = ['someday', 'delete'] as const;

export function MoreMenu({
  onAction,
  busy,
  actions = DEFAULT_ACTIONS,
}: {
  readonly onAction: (a: PlanAction) => void;
  readonly busy: boolean;
  /** Defaults to someday and delete so the mobile card keeps both. */
  readonly actions?: readonly ('someday' | 'delete')[];
}) {
  const m = useWtFMessages();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div className="plan-more">
      <button
        ref={anchor}
        className="plan-more-trigger"
        type="button"
        aria-label={m.actions}
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      <Popover
        open={open}
        anchor={anchor}
        mobileSheet
        label={m.actions}
        closeLabel={m.close}
        onClose={() => {
          setOpen(false);
        }}
        className="popover popover-menu"
      >
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="popover-row"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onAction(action);
            }}
          >
            {m[action]}
          </button>
        ))}
      </Popover>
    </div>
  );
}
