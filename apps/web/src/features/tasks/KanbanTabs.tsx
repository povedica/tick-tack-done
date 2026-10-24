import { useEffect, useState, type RefObject } from 'react';
import { useWtBMessages } from './i18n-wt-b';

export interface KanbanTab {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

/** RF-1002: one navigation shared by date and project boards. */
export function KanbanTabs({
  board,
  columns,
}: {
  readonly board: RefObject<HTMLDivElement | null>;
  readonly columns: readonly KanbanTab[];
}) {
  const messages = useWtBMessages();
  const [active, setActive] = useState(columns[0]?.id ?? '');
  const ids = columns.map((column) => column.id).join('|');
  useEffect(() => {
    const root = board.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive((visible.target as HTMLElement).dataset.kanbanColumn ?? '');
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll('[data-kanban-column]').forEach((column) => {
      observer.observe(column);
    });
    return () => {
      observer.disconnect();
    };
  }, [board, ids]);

  function choose(id: string) {
    const column = [
      ...(board.current?.querySelectorAll<HTMLElement>('[data-kanban-column]') ?? []),
    ].find((node) => node.dataset.kanbanColumn === id);
    column?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
    setActive(id);
  }
  return (
    <div className="kanban-tabs" role="tablist" aria-label={messages.kanbanColumnsNav}>
      {columns.map((column, index) => (
        <button
          key={column.id}
          type="button"
          role="tab"
          aria-controls={`kanban-column-${column.id}`}
          aria-selected={active === column.id}
          tabIndex={active === column.id ? 0 : -1}
          onClick={() => {
            choose(column.id);
          }}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? columns.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + columns.length) %
                    columns.length;
            const next = columns[target];
            if (next) {
              choose(next.id);
              (
                event.currentTarget.parentElement?.children[target] as HTMLElement | undefined
              )?.focus();
            }
          }}
        >
          {column.name} <span>{column.count}</span>
        </button>
      ))}
    </div>
  );
}
