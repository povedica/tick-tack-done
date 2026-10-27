import { projectDayLabel } from '@reflexionia/domain';
import type { ProjectOverviewItem } from '@reflexionia/sdk';
import { Check, ChevronLeft, List } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { Popover } from '../../components/Popover';
import { projectActivity } from './ProjectCard';
import type { ProjectsCopy } from './projects-text';

export type ProjectMenuAction =
  'open' | 'pause' | 'resume' | 'archive' | 'unarchive' | 'remove' | 'delete';

const STATES = ['active', 'paused', 'archived'] as const;

export function ProjectMenu({
  item,
  copy,
  now,
  timeZone,
  anchor,
  open,
  sheet,
  onClose,
  onAction,
}: {
  readonly item: ProjectOverviewItem;
  readonly copy: ProjectsCopy;
  readonly now: string;
  readonly timeZone: string;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly sheet: boolean;
  readonly onClose: () => void;
  readonly onAction: (action: ProjectMenuAction) => void;
}) {
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    setMoving(false);
  }, [item.id, open]);
  const activity = projectActivity(item, now, timeZone, copy.locale);
  const created = projectDayLabel(item.created_at, timeZone, copy.locale);
  const stateLabel = { active: copy.active, paused: copy.paused, archived: copy.archived } as const;
  return (
    <Popover
      open={open}
      anchor={anchor}
      label={`${copy.menu}: ${item.name}`}
      onClose={onClose}
      mobileSheet={sheet}
      className="project-menu"
      sheetHeader={
        sheet ? (
          <div className="project-sheet-head">
            <div className="project-sheet-name">
              <List size={16} color={item.color ?? 'var(--ink-3)'} aria-hidden="true" />
              <span>{item.name}</span>
            </div>
            <p className="project-sheet-meta">
              {item.done_count} {copy.of} {item.total_count} · {copy.created} {created}
              {activity.text.length === 0 ? '' : ` · ${activity.text}`}
            </p>
          </div>
        ) : undefined
      }
      headingAction={
        sheet && moving ? (
          <button
            type="button"
            aria-label={copy.backShort}
            onClick={() => {
              setMoving(false);
            }}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : undefined
      }
    >
      <div role="menu">
        {sheet && moving ? (
          STATES.map((state) => (
            <button
              key={state}
              type="button"
              role="menuitem"
              onClick={() => {
                onAction(state === 'active' ? 'resume' : state === 'paused' ? 'pause' : 'archive');
              }}
            >
              <span>{stateLabel[state]}</span>
              {item.state === state ? <Check size={16} aria-hidden="true" /> : null}
            </button>
          ))
        ) : item.state === 'archived' ? (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAction('open');
              }}
            >
              {copy.openList}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAction('unarchive');
              }}
            >
              {copy.unarchive}
            </button>
            <div className="project-menu-sep" />
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                onAction('delete');
              }}
            >
              {copy.delete}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAction('open');
              }}
            >
              {copy.openList}
            </button>
            <div className="project-menu-sep" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAction(item.state === 'paused' ? 'resume' : 'pause');
              }}
            >
              {item.state === 'paused' ? copy.resume : copy.pause}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAction('archive');
              }}
            >
              {copy.archive}
            </button>
            {sheet ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoving(true);
                }}
              >
                <span>{copy.moveTo}</span>
                <span>{stateLabel[item.state]}</span>
              </button>
            ) : (
              <>
                <div className="project-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAction('remove');
                  }}
                >
                  {copy.remove}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Popover>
  );
}
