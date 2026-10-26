import { Ban, CalendarDays, CircleCheck, Sun, ArrowRight, ChevronRight } from 'lucide-react';
import type { PlanAction } from '@reflexionia/domain';
import { useWtFMessages } from '../i18n-wt-f';
export function MobileActionBar({
  onAction,
  busy,
  count,
  onReview,
}: {
  readonly onAction: (a: PlanAction) => void;
  readonly busy: boolean;
  readonly count: number;
  readonly onReview: () => void;
}) {
  const m = useWtFMessages();
  return (
    <div className="plan-mobile-footer">
      <div className="plan-mobile-footer-heading">
        <span>{m.decideHint}</span>
        <button type="button" disabled={!count || busy} onClick={onReview}>
          {m.review} ({count})<ChevronRight size={15} />
        </button>
      </div>
      <nav className="plan-mobile-actions" aria-label={m.actions}>
        {(
          [
            ['done', CircleCheck],
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
            <span className="plan-mobile-action-icon">
              <Icon size={22} />
            </span>
            <span>{m[action]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
