import {
  AlarmClock,
  Calendar,
  ChevronDown,
  FileText,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Pin,
  Repeat,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { PriorityCheck } from '../../components/PriorityCheck';
import { displayTitle } from '../tasks/displayTitle';
import { dragHasTask, setTaskDrag, taskDragId } from './drag';
import { taskWhen, type TaskGroupKey, type TodayTask } from './groups';

export function TaskGroup({
  id,
  label,
  tasks,
  locale,
  todayLabel,
  tomorrowLabel,
  completeLabel,
  moreLabel,
  untitled,
  groupKind,
  collapsed,
  selected,
  leaving,
  pinned,
  focusId,
  projectNames,
  tagNames,
  tagColors,
  details,
  openTaskId,
  onToggle,
  onComplete,
  onOpen,
  onMore,
  onSelect,
  onPriorityDrop,
  onFocus,
}: {
  readonly id: string;
  readonly label: string;
  readonly tasks: readonly TodayTask[];
  readonly locale: string;
  readonly todayLabel: string;
  readonly tomorrowLabel: string;
  readonly completeLabel: string;
  readonly moreLabel: string;
  readonly untitled: string;
  readonly groupKind: TaskGroupKey;
  readonly collapsed: boolean;
  readonly selected: ReadonlySet<string>;
  readonly leaving: ReadonlySet<string>;
  readonly pinned: ReadonlySet<string>;
  readonly focusId: string | null;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly tagNames: ReadonlyMap<string, string>;
  readonly tagColors: ReadonlyMap<string, string | null>;
  readonly details: boolean;
  readonly openTaskId: string | null;
  readonly onToggle: (id: string, open: boolean) => void;
  readonly onComplete: (task: TodayTask) => void;
  readonly onOpen: (id: string) => void;
  readonly onMore: (task: TodayTask, x: number, y: number) => void;
  readonly onSelect: (id: string, mode: 'toggle' | 'range' | 'plain') => void;
  readonly onPriorityDrop: (taskId: string, priority: TodayTask['priority']) => void;
  readonly onFocus: (id: string) => void;
}) {
  return (
    <details
      id={id}
      className="task-group"
      open={!collapsed}
      onToggle={(event) => {
        onToggle(id, event.currentTarget.open);
      }}
      onDragOver={(event) => {
        if (groupKind === 'priority' && dragHasTask(event.dataTransfer)) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (groupKind !== 'priority') {
          return;
        }
        const taskId = taskDragId(event.dataTransfer);
        if (taskId === null || !isPriority(id)) {
          return;
        }
        event.preventDefault();
        onPriorityDrop(taskId, id);
      }}
    >
      <summary>
        <ChevronDown className="task-chevron" size={16} aria-hidden="true" />
        <span>{label}</span>
        <span className="task-count">{tasks.length}</span>
      </summary>
      <ul className="task-list" data-details={details ? 'on' : 'off'}>
        {tasks.map((task) => {
          const namedTags = task.tagIds.flatMap((tagId) => {
            const name = tagNames.get(tagId);
            return name === undefined ? [] : [{ id: tagId, name }];
          });
          const title = displayTitle(
            task.title,
            namedTags.map((tag) => tag.name),
          );
          const when = taskWhen(task, new Date(), locale, {
            today: todayLabel,
            tomorrow: tomorrowLabel,
          });
          const classes = [
            'task-row',
            openTaskId === task.id ? 'is-selected' : '',
            selected.has(task.id) ? 'is-batch' : '',
            leaving.has(task.id) ? 'is-leaving' : '',
            task.id.startsWith('pending-') ? 'is-pending' : '',
          ]
            .filter((item) => item.length > 0)
            .join(' ');
          return (
            <li key={task.id}>
              <div
                className={classes}
                data-task-id={task.id}
                draggable
                tabIndex={focusId === task.id ? 0 : -1}
                onFocus={() => {
                  onFocus(task.id);
                }}
                onDragStart={(event) => {
                  setTaskDrag(event.dataTransfer, task.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onMore(task, event.clientX, event.clientY);
                }}
                onDragOver={(event) => {
                  if (dragHasTask(event.dataTransfer)) {
                    event.preventDefault();
                  }
                }}
              >
                <GripVertical className="task-grip" size={12} aria-hidden="true" />
                <PriorityCheck
                  priority={task.priority}
                  checked={task.status === 'completed'}
                  label={completeLabel.replace('{name}', task.title)}
                  onChange={() => {
                    onComplete(task);
                  }}
                />
                <button
                  type="button"
                  className="task-title"
                  onClick={(event) => {
                    if (event.shiftKey) {
                      onSelect(task.id, 'range');
                      return;
                    }
                    if (event.metaKey || event.ctrlKey) {
                      onSelect(task.id, 'toggle');
                      return;
                    }
                    onOpen(task.id);
                  }}
                >
                  {title.length === 0 ? untitled : title}
                </button>
                <span className="task-meta">
                  {namedTags.slice(0, 2).map((tag) => (
                    <Link
                      key={tag.id}
                      to={`/tag/${tag.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <span className="ui-tag" style={tagStyle(tagColors.get(tag.id) ?? null)}>
                        {tag.name}
                      </span>
                    </Link>
                  ))}
                  {namedTags.length > 2 ? (
                    <span className="task-tag-more">+{namedTags.length - 2}</span>
                  ) : null}
                  {pinned.has(task.id) ? <Pin size={14} aria-hidden="true" /> : null}
                  {task.hasContent ? (
                    <FileText className="task-icon" size={14} aria-hidden="true" />
                  ) : null}
                  {task.checklistTotal > 0 ? (
                    <span className="task-icon">
                      <ListChecks size={14} aria-hidden="true" />
                      {task.checklistDone}/{task.checklistTotal}
                    </span>
                  ) : null}
                  {task.hasRepeat ? (
                    <Repeat className="task-icon" size={14} aria-hidden="true" />
                  ) : null}
                  {task.attachmentCount > 0 ? (
                    <Paperclip className="task-icon" size={14} aria-hidden="true" />
                  ) : null}
                  {task.source !== 'manual' && task.source.length > 0 ? (
                    <Calendar className="task-icon" size={14} aria-hidden="true" />
                  ) : null}
                  {(projectNames.get(task.projectId) ?? '').length > 0 ? (
                    <span className="task-list-name">{projectNames.get(task.projectId)}</span>
                  ) : null}
                  {when.date !== null ? (
                    <time
                      className={when.overdue ? 'task-date is-overdue' : 'task-date'}
                      dateTime={task.dueDate ?? undefined}
                    >
                      {when.date}
                    </time>
                  ) : null}
                  {when.time !== null ? (
                    <time className="task-time" dateTime={task.dueDate ?? undefined}>
                      {when.time}
                      {task.hasReminder ? <AlarmClock size={12} aria-hidden="true" /> : null}
                    </time>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="task-more"
                  aria-label={moreLabel}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    onMore(task, rect.right, rect.bottom);
                  }}
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function isPriority(id: string): id is TodayTask['priority'] {
  return id === 'high' || id === 'medium' || id === 'low' || id === 'none';
}

function tagStyle(color: string | null): CSSProperties | undefined {
  if (color === null || color.length === 0) {
    return undefined;
  }
  return { '--tag': color } as CSSProperties;
}
