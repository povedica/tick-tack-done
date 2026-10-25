import { Check } from 'lucide-react';
import type { PointerEventHandler } from 'react';
import { actionDate } from '@reflexionia/domain';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanSession } from '../api';
export function QueueList({
  session,
  index,
  onSelect,
  onDrag,
}: {
  readonly session: PlanSession;
  readonly index: number;
  readonly onSelect: (n: number) => void;
  readonly onDrag?: (id: string) => PointerEventHandler<HTMLElement>;
}) {
  const m = useWtFMessages(),
    count = session.decisions.length;
  return (
    <aside className="sp-queue" aria-label={m.queue}>
      <div className="sp-qhead">
        <strong>{m.queue}</strong>
        <span>
          {Math.min(index + 1, session.cards.length)} {m.of} {session.cards.length}
        </span>
      </div>
      <div
        className="sp-progress"
        role="progressbar"
        aria-label={m.queue}
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={session.cards.length}
      >
        <span
          style={{ width: `${session.cards.length ? (count / session.cards.length) * 100 : 0}%` }}
        />
      </div>
      <ul>
        {session.cards.map((card, i) => {
          const choice = session.decisions.find((d) => d.task_id === card.task_id);
          const target = choice ? actionDate(choice, session.local_date) : null;
          return (
            <li key={card.task_id}>
              <button
                type="button"
                title={card.title}
                aria-current={i === index ? 'step' : undefined}
                className={`sp-q ${i === index ? 'is-current' : ''} ${choice ? 'is-done' : ''}`}
                onClick={() => onSelect(i)}
                onPointerDown={onDrag?.(card.task_id)}
              >
                {choice ? (
                  <Check size={14} />
                ) : (
                  <span
                    className="sp-dot"
                    style={{ background: card.project_color ?? 'var(--ink-3)' }}
                  />
                )}
                <span className="sp-q-title">{card.title}</span>
                {choice ? (
                  <span className="sp-q-dest">
                    {target === session.local_date
                      ? m.today
                      : target
                        ? `${target.slice(8)}/${target.slice(5, 7)}`
                        : m[choice.action]}
                    {choice.time ? ` ${choice.time}` : ''}
                  </span>
                ) : card.due_date && card.due_date.slice(0, 10) < session.local_date ? (
                  <i className="sp-q-late" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
