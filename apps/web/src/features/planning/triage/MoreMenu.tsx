import { MoreHorizontal } from 'lucide-react';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanAction } from '@reflexionia/domain';
export function MoreMenu({
  onAction,
  busy,
}: {
  readonly onAction: (a: PlanAction) => void;
  readonly busy: boolean;
}) {
  const m = useWtFMessages();
  return (
    <details className="plan-more">
      <summary aria-label={m.actions}>
        <MoreHorizontal size={18} />
      </summary>
      <div>
        <button type="button" disabled={busy} onClick={() => onAction('someday')}>
          {m.someday}
        </button>
        <button type="button" disabled={busy} onClick={() => onAction('delete')}>
          {m.delete}
        </button>
      </div>
    </details>
  );
}
