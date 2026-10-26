import { useState } from 'react';
import { Circle, CircleCheck, Menu, PanelLeftClose, Repeat } from 'lucide-react';
import { Button, TagChip } from '../../../components/ui';
import type { PointerEventHandler } from 'react';
import { actionDate } from '@reflexionia/domain';
import { useWtFMessages } from '../i18n-wt-f';
import type { PlanSession } from '../api';
export function QueueList({
  session,
  index,
  onSelect,
  onDrag,
  onCollapse,
}: {
  readonly onCollapse: () => void;
  readonly session: PlanSession;
  readonly index: number;
  readonly onSelect: (n: number) => void;
  readonly onDrag?: (id: string) => PointerEventHandler<HTMLElement>;
}) {
  const m = useWtFMessages(),
    count = session.decisions.length;
  const [group, setGroup] = useState('none');
  const groups = new Map<string, number[]>();
  session.cards.forEach((card, i) => {
    const key =
      group === 'list'
        ? card.project_name
        : group === 'priority'
          ? card.priority === 'none'
            ? '—'
            : m[card.priority]
          : '';
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  return (
    <aside className="sp-queue" aria-label={m.queue}>
      <div className="sp-qhead">
        <strong>{m.queue}</strong>
        <span>
          {Math.min(index + 1, session.cards.length)} {m.of} {session.cards.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={m.hideQueue}
          aria-expanded
          onClick={onCollapse}
        >
          <PanelLeftClose size={17} />
        </Button>
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
          style={{
            width: `${String(session.cards.length ? (count / session.cards.length) * 100 : 0)}%`,
          }}
        />
      </div>
      <label className="plan-queue-group">
        {m.groupBy}
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
          }}
        >
          <option value="none">{m.ungrouped}</option>
          <option value="list">{m.byList}</option>
          <option value="priority">{m.byPriority}</option>
        </select>
      </label>
      <div className="plan-queue-scroll">
        {[...groups].map(([name, indices]) => (
          <section key={name}>
            {name ? <h3>{name}</h3> : null}
            <ul>
              {[...indices]
                .sort(
                  (a, b) =>
                    Number(
                      session.decisions.some(
                        (d) => d.task_id === session.cards[a]?.task_id && d.action !== 'skip',
                      ),
                    ) -
                    Number(
                      session.decisions.some(
                        (d) => d.task_id === session.cards[b]?.task_id && d.action !== 'skip',
                      ),
                    ),
                )
                .map((i) => {
                  const card = session.cards[i];
                  if (!card) return null;
                  const choice = session.decisions.find((d) => d.task_id === card.task_id);
                  const planned = choice !== undefined && choice.action !== 'skip';
                  const target = choice ? actionDate(choice, session.local_date) : null;
                  return (
                    <li key={card.task_id}>
                      <button
                        type="button"
                        title={card.title}
                        aria-current={i === index ? 'step' : undefined}
                        className={`sp-q ${i === index ? 'is-current' : ''} ${choice ? 'is-done' : ''} ${choice?.action === 'done' ? 'is-completed' : planned ? 'is-planned' : ''}`}
                        disabled={planned}
                        onClick={() => {
                          onSelect(i);
                        }}
                        onPointerDown={planned ? undefined : onDrag?.(card.task_id)}
                      >
                        {planned ? (
                          <CircleCheck
                            size={16}
                            className="plan-queue-check is-completed"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle size={16} className="plan-queue-check" aria-hidden="true" />
                        )}
                        <span className="plan-queue-task">
                          <span className="plan-queue-title">
                            <span className="sp-q-title">{card.title}</span>
                            {card.recurring ? (
                              <Repeat
                                size={12}
                                className="plan-queue-repeat"
                                role="img"
                                aria-label={m.repeating}
                              />
                            ) : null}
                          </span>
                          <span className="plan-queue-meta">
                            <span className="plan-queue-project">
                              <Menu
                                size={13}
                                style={{ color: card.project_color ?? 'var(--ink-3)' }}
                                aria-hidden="true"
                              />
                              <span className="plan-queue-project-name">{card.project_name}</span>
                            </span>
                            {card.tags.length ? (
                              <span className="plan-queue-tags">
                                {card.tags.slice(0, 2).map((tag) => (
                                  <TagChip key={tag.id} label={tag.name} color={tag.color} />
                                ))}
                              </span>
                            ) : null}
                          </span>
                        </span>
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
          </section>
        ))}
      </div>
    </aside>
  );
}
