import { ApiError } from '@reflexionia/sdk';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../../components/Popover';
import { useWtBMessages } from './i18n-wt-b';
import type { KanbanTab } from './KanbanTabs';

export function kanbanMoveError(
  error: unknown,
  labels: { readonly wipExceeded: string; readonly saveFailed: string },
): string {
  return error instanceof ApiError && error.code === 'wip_exceeded'
    ? labels.wipExceeded
    : labels.saveFailed;
}

/** RF-204/1002: touch and keyboard alternative to native drag and drop. */
export function KanbanMoveSheet({
  columns,
  currentId,
  onMove,
  moreLabel,
  wipExceeded,
  saveFailed,
  onMore,
}: {
  readonly columns: readonly KanbanTab[];
  readonly currentId: string;
  readonly onMove: (id: string) => Promise<void>;
  readonly moreLabel: string;
  readonly wipExceeded: string;
  readonly saveFailed: string;
  readonly onMore?: ((x: number, y: number) => void) | undefined;
}) {
  const messages = useWtBMessages();
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<'closed' | 'menu' | 'move'>('closed');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (stage === 'closed') return;
    const frame = requestAnimationFrame(() =>
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [stage]);
  function close() {
    setStage('closed');
    setError(null);
    anchor.current?.focus();
  }
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="task-more kanban-card-more"
        aria-label={moreLabel}
        aria-haspopup="menu"
        aria-expanded={stage !== 'closed'}
        onClick={() => {
          setError(null);
          setStage('menu');
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      <Popover
        open={stage !== 'closed'}
        label={messages.kanbanMoveTo}
        onClose={close}
        anchor={anchor}
        mobileSheet
        className="popover kanban-move-sheet"
      >
        <div
          ref={menu}
          role="menu"
          aria-label={stage === 'move' ? messages.kanbanMoveTo : moreLabel}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]:not(:disabled)',
              ),
            ];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const target =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[target]?.focus();
          }}
        >
          {stage === 'menu' ? (
            <>
              <button type="button" role="menuitem" onClick={() => setStage('move')}>
                {messages.kanbanMoveTo}
              </button>
              {onMore ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const box = anchor.current?.getBoundingClientRect();
                    close();
                    if (box) onMore(box.right, box.bottom);
                  }}
                >
                  {moreLabel}
                </button>
              ) : null}
            </>
          ) : (
            columns.map((column) => (
              <button
                key={column.id}
                type="button"
                role="menuitem"
                disabled={pending || column.id === currentId}
                onClick={() => {
                  setPending(true);
                  setError(null);
                  void onMove(column.id)
                    .then(close)
                    .catch((cause: unknown) =>
                      setError(kanbanMoveError(cause, { wipExceeded, saveFailed })),
                    )
                    .finally(() => setPending(false));
                }}
              >
                {column.name} <span>{column.count}</span>
              </button>
            ))
          )}
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </Popover>
    </>
  );
}
