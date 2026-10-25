import { Ban, CalendarDays, Check, Sun, ArrowRight } from 'lucide-react';
import type { PlanAction } from '@reflexionia/domain';
import { useWtFMessages } from '../i18n-wt-f';
export function MobileActionBar({
  onAction,
  busy,
}: {
  readonly onAction: (a: PlanAction) => void;
  readonly busy: boolean;
}) {
  const m = useWtFMessages();
  return (
    <nav className="plan-mobile-actions" aria-label={m.actions}>
      {(
        [
          ['done', Check],
          ['today', Sun],
          ['tomorrow', ArrowRight],
          ['move', CalendarDays],
          ['wont_do', Ban],
        ] as const
      ).map(([action, Icon]) => (
        <button
          key={action}
          type="button"
          disabled={busy}
          onClick={() => {
            onAction(action);
          }}
        >
          <Icon size={20} />
          <span>{m[action]}</span>
        </button>
      ))}
    </nav>
  );
}
