import {
  Eye,
  EyeOff,
  Grid2X2,
  Kanban,
  List,
  MoreHorizontal,
  Printer,
  Timeline,
} from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { Messages } from '../i18n';
import { Popover } from './Popover';

export type BoardView = 'list' | 'kanban' | 'timeline';

export function ViewMenu({
  messages,
  view,
  onView,
  onMatrix,
  matrixSelected = false,
  showTimeline = true,
  details,
  onDetails,
  hideCompleted,
  onHideCompleted,
  onPrint,
  extraItems,
}: {
  readonly messages: Messages;
  readonly view?: BoardView | undefined;
  readonly onView?: ((view: BoardView) => void) | undefined;
  readonly onMatrix?: (() => void) | undefined;
  readonly matrixSelected?: boolean;
  readonly showTimeline?: boolean;
  readonly details: boolean;
  readonly onDetails: (value: boolean) => void;
  readonly hideCompleted: boolean;
  readonly onHideCompleted: (value: boolean) => void;
  readonly onPrint: () => void;
  readonly extraItems?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  return (
    <div className="view-menu">
      <button
        ref={anchor}
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
      <Popover
        open={open}
        anchor={anchor}
        label={messages.menuLabel}
        onClose={() => {
          setOpen(false);
        }}
        className="menu-card view-menu-popover"
        width={260}
      >
        <div id={menuId} role="menu">
          {onView !== undefined ? (
            <div className="menu-segment" role="group" aria-label={messages.viewList}>
              <Segment
                label={messages.viewList}
                checked={!matrixSelected && view === 'list'}
                onClick={() => {
                  onView('list');
                  setOpen(false);
                }}
              >
                <List size={16} aria-hidden="true" />
              </Segment>
              {onMatrix ? (
                <Segment
                  label={messages.matrixTitle}
                  checked={matrixSelected}
                  onClick={() => {
                    onMatrix();
                    setOpen(false);
                  }}
                >
                  <Grid2X2 size={16} aria-hidden="true" />
                </Segment>
              ) : null}
              <Segment
                label={messages.viewKanban}
                checked={!matrixSelected && view === 'kanban'}
                onClick={() => {
                  onView('kanban');
                  setOpen(false);
                }}
              >
                <Kanban size={16} aria-hidden="true" />
              </Segment>
              {showTimeline ? (
                <Segment
                  label={messages.viewTimeline}
                  checked={!matrixSelected && view === 'timeline'}
                  onClick={() => {
                    onView('timeline');
                    setOpen(false);
                  }}
                >
                  <Timeline size={16} aria-hidden="true" />
                </Segment>
              ) : null}
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
            onClick={() => {
              setOpen(false);
              onPrint();
            }}
          >
            <Printer size={16} aria-hidden="true" />
            {messages.printView}
          </button>
          {extraItems !== undefined ? (
            <>
              <div className="menu-sep" role="separator" />
              {extraItems}
            </>
          ) : null}
        </div>
      </Popover>
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
