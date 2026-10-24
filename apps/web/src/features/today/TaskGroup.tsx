import { messagesFor, fill, type Messages } from '../../i18n';
import {
  Calendar,
  ChevronDown,
  FileText,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Plus,
  Paperclip,
  Link as LinkIcon,
  Pin,
  Repeat,
} from 'lucide-react';
import { Link } from 'react-router';
import { PriorityCheck } from '../../components/PriorityCheck';
import { TagChip } from '../../components/ui';
import { displayTitle } from '../tasks/displayTitle';
import { dragHasTask, setTaskDrag, taskDragId } from './drag';
import { calendarDay, taskWhen, type TaskGroupKey, type TodayTask } from './groups';
import { CompactTaskTime } from './CompactTaskTime';
import '../tasks/kanban-wt-b.css';
import { wtBMessagesFor } from '../tasks/i18n-wt-b';
import { KanbanMoveSheet } from '../tasks/KanbanMoveSheet';
import type { KanbanTab } from '../tasks/KanbanTabs';

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
  deadlineSoonDays = 2,
  onCreate,
  onToggle,
  onComplete,
  onOpen,
  onMore,
  onSelect,
  onPriorityDrop,
  onColumnDrop,
  onFocus,
  moveColumns,
  onMove,
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
  readonly deadlineSoonDays?: number;
  readonly onCreate?: (() => void) | undefined;
  readonly onToggle: (id: string, open: boolean) => void;
  readonly onComplete: (task: TodayTask) => void;
  readonly onOpen: (id: string) => void;
  readonly onMore: (task: TodayTask, x: number, y: number) => void;
  readonly onSelect: (id: string, mode: 'toggle' | 'range' | 'plain') => void;
  readonly onColumnDrop?: ((taskId: string) => void) | undefined;
  readonly onPriorityDrop: (taskId: string, priority: TodayTask['priority']) => void;
  readonly onFocus: (id: string) => void;
  readonly moveColumns?: readonly KanbanTab[] | undefined;
  readonly onMove?: ((taskId: string, target: string) => Promise<void>) | undefined;
}) {
  return (
    <details
      id={onCreate ? `kanban-column-${id}` : id}
      data-kanban-column={onCreate ? id : undefined}
      className="task-group"
      open={onCreate !== undefined || !collapsed}
      onToggle={(event) => {
        if (!onCreate) onToggle(id, event.currentTarget.open);
      }}
      onDragOver={(event) => {
        if ((groupKind === 'priority' || onColumnDrop) && dragHasTask(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          event.currentTarget.dataset.dragOver = 'true';
        }
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          delete event.currentTarget.dataset.dragOver;
      }}
      onDrop={(event) => {
        delete event.currentTarget.dataset.dragOver;
        const dropped = taskDragId(event.dataTransfer);
        if (onColumnDrop && dropped !== null) {
          event.preventDefault();
          onColumnDrop(dropped);
          return;
        }
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
      <summary
        onClick={(event) => {
          if (onCreate) event.preventDefault();
        }}
      >
        <ChevronDown className="task-chevron" size={16} aria-hidden="true" />
        <span>{label}</span>
        <span className="task-count">{tasks.length}</span>
        {onCreate ? (
          <button
            type="button"
            className="kanban-column-add"
            aria-label={`${messagesFor(locale).addTask}: ${label}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCreate();
            }}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        ) : null}
      </summary>
      {onCreate && tasks.length === 0 ? (
        <p className="kanban-empty">{wtBMessagesFor(locale).kanbanEmpty}</p>
      ) : null}
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
            <li
              key={task.id}
              draggable={onCreate !== undefined}
              onDragStart={(event) => {
                if (onCreate) setTaskDrag(event.dataTransfer, task.id);
              }}
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  !event.target.closest('button, a, input, label')
                )
                  onOpen(task.id);
              }}
            >
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
                  label={completeLabel.replace('{name}', displayTitle(task.title))}
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
                      <TagChip label={tag.name} color={tagColors.get(tag.id) ?? null} />
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
                  {(task.linkCount ?? 0) > 0 ? (
                    <span className="task-link-count">
                      <LinkIcon size={12} aria-hidden="true" /> {task.linkCount}
                    </span>
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
                  {deadlineText(task, deadlineSoonDays, messagesFor(locale)) !== null ? (
                    <span
                      className={
                        deadlineText(task, deadlineSoonDays, messagesFor(locale))?.tone === 'late'
                          ? 'task-date is-overdue'
                          : 'task-date'
                      }
                    >
                      {deadlineText(task, deadlineSoonDays, messagesFor(locale))?.label}
                    </span>
                  ) : null}
                  {when.time !== null ? (
                    <CompactTaskTime
                      value={when.time}
                      date={task.dueDate}
                      reminder={task.hasReminder}
                    />
                  ) : null}
                </span>
                {moveColumns && onMove ? (
                  <KanbanMoveSheet
                    columns={moveColumns}
                    currentId={id}
                    moreLabel={moreLabel}
                    wipExceeded={messagesFor(locale).wipExceeded}
                    saveFailed={messagesFor(locale).saveFailed}
                    onMove={(target) => onMove(task.id, target)}
                    onMore={(x, y) => onMore(task, x, y)}
                  />
                ) : (
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
                )}
              </div>
            </li>
          );
        })}
        {onCreate ? (
          <li className="kanban-add-space">
            <button
              type="button"
              aria-label={`${messagesFor(locale).addTask}: ${label}`}
              onClick={onCreate}
            >
              <Plus size={16} aria-hidden="true" />
              {messagesFor(locale).addTask}
            </button>
          </li>
        ) : null}
      </ul>
    </details>
  );
}

function deadlineText(
  task: TodayTask,
  soonDays: number,
  messages: Messages,
): { readonly label: string; readonly tone: 'soon' | 'late' } | null {
  if (task.isSomeday === true || task.dueDate == null || task.status !== 'active') {
    return null;
  }
  const today = calendarDay(new Date().toISOString(), task.timeZone);
  const due = calendarDay(task.dueDate, task.timeZone);
  const diff = Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (diff < 0) {
    return null;
  }
  if (diff === 0) {
    return { label: messages.deadlineToday, tone: 'late' };
  }
  if (diff === 1) {
    return { label: messages.deadlineTomorrow, tone: 'soon' };
  }
  if (diff <= soonDays) {
    return { label: fill(messages.deadlineInDays, String(diff)), tone: 'soon' };
  }
  return null;
}

function isPriority(id: string): id is TodayTask['priority'] {
  return id === 'high' || id === 'medium' || id === 'low' || id === 'none';
}
