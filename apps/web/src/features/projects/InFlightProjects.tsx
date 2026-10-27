import { actionDateChip } from '@reflexionia/domain';
import type { ProjectOverviewItem } from '@reflexionia/sdk';
import { Target } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { MarkListPicker } from './MarkListPicker';
import { useProjectsCopy } from './projects-text';

function isItem(value: unknown): value is ProjectOverviewItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Partial<ProjectOverviewItem>;
  return (
    typeof item.id === 'string' && typeof item.name === 'string' && typeof item.state === 'string'
  );
}

export function readInFlight(value: unknown): {
  items: ProjectOverviewItem[];
  active: number;
  paused: number;
  archived: number;
  missing: number;
} | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const body = value as {
    items?: unknown;
    counts?: { active?: unknown; paused?: unknown; archived?: unknown };
    no_next_action_count?: unknown;
  };
  const items = Array.isArray(body.items) ? body.items.filter(isItem).slice(0, 4) : [];
  return {
    items,
    active: typeof body.counts?.active === 'number' ? body.counts.active : 0,
    paused: typeof body.counts?.paused === 'number' ? body.counts.paused : 0,
    archived: typeof body.counts?.archived === 'number' ? body.counts.archived : 0,
    missing: typeof body.no_next_action_count === 'number' ? body.no_next_action_count : 0,
  };
}

export function InFlightProjects({ value }: { readonly value: unknown }) {
  const copy = useProjectsCopy();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const board = readInFlight(value);
  const now = new Date().toISOString();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  if (board === null) {
    return <p>{copy.permission}</p>;
  }
  if (board.active + board.paused + board.archived === 0 && board.items.length === 0) {
    return (
      <p>
        {copy.gardenEmpty} ·{' '}
        <button
          ref={anchor}
          type="button"
          className="projects-text-link"
          onClick={() => {
            setOpen(true);
          }}
        >
          {copy.markList}
        </button>
        <MarkListPicker
          copy={copy}
          anchor={anchor}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      </p>
    );
  }
  return (
    <>
      <ul className="garden-project-rows">
        {board.items.map((item) => {
          const chip =
            item.next_action === null
              ? null
              : actionDateChip(
                  {
                    startDate: item.next_action.start_date,
                    dueDate: item.next_action.due_date,
                    isAllDay: item.next_action.is_all_day,
                    timeZone: zone,
                  },
                  now,
                  copy.locale,
                );
          const ratio =
            item.total_count === 0 ? 0 : Math.round((item.done_count / item.total_count) * 100);
          return (
            <li key={item.id}>
              <Link className="garden-project-row" to={`/list/${item.id}`}>
                <Target size={16} aria-hidden="true" />
                <span className="name" title={item.name}>
                  {item.name}
                </span>
                <span className="next">
                  {item.next_action === null ? (
                    copy.noNext
                  ) : (
                    <>
                      {item.next_action.title}
                      {chip === null ? null : (
                        <span className={`project-card-when is-${chip.tone}`}> · {chip.text}</span>
                      )}
                    </>
                  )}
                </span>
                <span className="garden-project-progress">
                  {item.done_count} {copy.of} {item.total_count}
                  {item.total_count === 0 ? null : (
                    <span className="garden-project-mini" aria-hidden="true">
                      <span style={{ width: `${String(ratio)}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="garden-project-foot">
        {copy.summary(board.active, board.missing, board.paused)}
      </p>
    </>
  );
}
