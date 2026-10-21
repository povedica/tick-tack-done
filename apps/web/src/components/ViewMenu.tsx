import {
  Eye,
  EyeOff,
  Kanban,
  List,
  MoreHorizontal,
  Printer,
  SlidersHorizontal,
  Timeline,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Messages } from '../i18n';

export type BoardView = 'list' | 'kanban' | 'timeline';

export function ViewMenu({
  messages,
  view,
  onView,
  details,
  onDetails,
  hideCompleted,
  onHideCompleted,
  onPrint,
  children,
}: {
  readonly messages: Messages;
  readonly view?: BoardView | undefined;
  readonly onView?: ((view: BoardView) => void) | undefined;
  readonly details: boolean;
  readonly onDetails: (value: boolean) => void;
  readonly hideCompleted: boolean;
  readonly onHideCompleted: (value: boolean) => void;
  readonly onPrint: () => void;
  readonly children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    function onPointer(event: PointerEvent): void {
      if (root.current !== null && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="view-menu" ref={root}>
      <button
        type="button"
        className="icon-button"
        aria-label={messages.menuLabel}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu-card" id={menuId} role="menu">
          {onView !== undefined ? (
            <div className="menu-segment" role="group" aria-label={messages.viewList}>
              <Segment
                label={messages.viewList}
                checked={view === 'list'}
                onClick={() => {
                  onView('list');
                  setOpen(false);
                }}
              >
                <List size={16} aria-hidden="true" />
              </Segment>
              <Segment
                label={messages.viewKanban}
                checked={view === 'kanban'}
                onClick={() => {
                  onView('kanban');
                  setOpen(false);
                }}
              >
                <Kanban size={16} aria-hidden="true" />
              </Segment>
              <Segment
                label={messages.viewTimeline}
                checked={view === 'timeline'}
                onClick={() => {
                  onView('timeline');
                  setOpen(false);
                }}
              >
                <Timeline size={16} aria-hidden="true" />
              </Segment>
            </div>
          ) : null}
          <button
            type="button"
            className="menu-item"
            role="menuitemcheckbox"
            aria-checked={hideCompleted}
            onClick={() => {
              onHideCompleted(!hideCompleted);
            }}
          >
            <EyeOff size={16} aria-hidden="true" />
            <span className="menu-item-label">{messages.hideCompleted}</span>
            {hideCompleted ? <span aria-hidden="true">✓</span> : null}
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitemcheckbox"
            aria-checked={details}
            onClick={() => {
              onDetails(!details);
            }}
          >
            <Eye size={16} aria-hidden="true" />
            {messages.showDetails}
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            aria-expanded={options}
            onClick={() => {
              setOptions((current) => !current);
            }}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {messages.viewOptions}
          </button>
          {options ? <div className="menu-options">{children}</div> : null}
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPrint();
            }}
          >
            <Printer size={16} aria-hidden="true" />
            {messages.printView}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Segment({
  label,
  checked,
  onClick,
  children,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="menu-segment-btn"
      role="menuitemradio"
      aria-label={label}
      aria-checked={checked}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
