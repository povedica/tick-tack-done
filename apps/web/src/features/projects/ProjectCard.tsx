import { actionDateChip, activityLabel, projectDayLabel } from '@reflexionia/domain';
import type { ProjectOverviewItem } from '@reflexionia/sdk';
import {
  CalendarPlus,
  CircleDashed,
  CornerDownRight,
  Ellipsis,
  GripVertical,
  List,
} from 'lucide-react';
import { useRef, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { runAction } from '../../components/run-action';
import { useLongPress } from '../../components/useLongPress';
import type { ProjectsCopy } from './projects-text';

export function projectActivity(
  item: ProjectOverviewItem,
  now: string,
  timeZone: string,
  locale: string,
): { text: string; stale: boolean } {
  if (item.state === 'archived') {
    const day = projectDayLabel(item.closed_at ?? item.created_at, timeZone, locale);
    const text = locale.toLowerCase().startsWith('en') ? `archived ${day}` : `archivado ${day}`;
    return { text, stale: false };
  }
  if (item.state === 'paused') {
    const day = projectDayLabel(
      item.project_status_changed_at ?? item.created_at,
      timeZone,
      locale,
    );
    const text = locale.toLowerCase().startsWith('en')
      ? `paused since ${day}`
      : `en pausa desde ${day}`;
    return { text, stale: false };
  }
  if (item.last_activity_at === null) {
    return { text: '', stale: false };
  }
  return {
    text: activityLabel(item.last_activity_at, now, timeZone, locale),
    stale: item.attention === 'stale',
  };
}

export function ProjectCard({
  item,
  copy,
  now,
  timeZone,
  dragging,
  draggable,
  onMenu,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: {
  readonly item: ProjectOverviewItem;
  readonly copy: ProjectsCopy;
  readonly now: string;
  readonly timeZone: string;
  readonly dragging: boolean;
  readonly draggable: boolean;
  readonly onMenu: (anchor: HTMLButtonElement) => void;
  readonly onContextMenu: (anchor?: HTMLElement) => void;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
}) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLElement>(null);
  const press = useLongPress(() => {
    onContextMenu(cardRef.current ?? undefined);
  });
  const archived = item.state === 'archived';
  const activity = projectActivity(item, now, timeZone, copy.locale);
  const created = projectDayLabel(item.created_at, timeZone, copy.locale);
  const chip =
    item.next_action === null
      ? null
      : actionDateChip(
          {
            startDate: item.next_action.start_date,
            dueDate: item.next_action.due_date,
            isAllDay: item.next_action.is_all_day,
            timeZone,
          },
          now,
          copy.locale,
        );
  const ratio = item.total_count === 0 ? 0 : Math.round((item.done_count / item.total_count) * 100);
  return (
    <article
      ref={cardRef}
      className={`project-card${archived ? ' is-archived' : ''}${dragging ? ' is-dragging' : ''}`}
      data-project-id={item.id}
      data-project-state={item.state}
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...press}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) {
          return;
        }
        runAction(Promise.resolve(navigate(`/list/${item.id}`)));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          runAction(Promise.resolve(navigate(`/list/${item.id}`)));
        }
      }}
    >
      {draggable ? <GripVertical className="project-grip" size={14} aria-hidden="true" /> : null}
      <div className="project-card-top">
        <List size={16} color={item.color ?? 'var(--ink-3)'} aria-hidden="true" />
        <span className="project-card-name" title={item.name}>
          {item.name}
        </span>
        <button
          type="button"
          className="project-card-menu"
          aria-label={`${copy.menu}: ${item.name}`}
          onClick={(event) => {
            onMenu(event.currentTarget);
          }}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </button>
      </div>
      {!archived && item.outcome !== null && item.outcome.length > 0 ? (
        <p className="project-card-outcome" title={item.outcome}>
          {item.outcome}
        </p>
      ) : null}
      {archived ? null : item.next_action === null ? (
        <p className="project-card-next is-missing">
          <CircleDashed size={14} aria-hidden="true" />
          {copy.noNext}
        </p>
      ) : (
        <p className="project-card-next">
          <CornerDownRight size={14} aria-hidden="true" />
          <span title={item.next_action.title}>{item.next_action.title}</span>
          {chip === null ? null : (
            <span className={`project-card-when is-${chip.tone}`}>· {chip.text}</span>
          )}
        </p>
      )}
      <div className="project-card-meta">
        <span>
          {item.done_count} {copy.of} {item.total_count}
        </span>
        {archived || item.total_count === 0 ? null : (
          <span className="project-card-bar project-card-track" aria-hidden="true">
            <span style={{ width: `${String(ratio)}%` }} />
          </span>
        )}
        {activity.text.length === 0 ? null : (
          <span
            className={activity.stale ? 'project-card-activity is-stale' : 'project-card-activity'}
          >
            {activity.text}
          </span>
        )}
      </div>
      <p className="project-card-created">
        <CalendarPlus size={13} aria-hidden="true" />
        {copy.created} {created}
      </p>
    </article>
  );
}
