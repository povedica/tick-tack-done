import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '@reflexionia/sdk';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api';
import { PriorityCheck } from '../../components/PriorityCheck';
import { Highlight } from '../../components/Highlight';
import { Button, TagChip } from '../../components/ui';
import { fill, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import type { ViewDay } from '../capture/quick-add';
import { collectTags } from './collect';
import { refreshTaskSurfaces } from './refresh';
import { purgeTrashTask } from './purge-trash';
import { displayTitle } from './displayTitle';
import { completeBody } from './complete-body';
import { TaskComposer } from './TaskComposer';
import { openTaskComposer } from '../capture/notice';
import { formatTaskRowDate } from './row-date';
import { isOverdue, isSameDay, type RowModel } from './model';
import { calendarDay } from '../today/groups';
import './kanban-wt-b.css';
import { KanbanTabs } from './KanbanTabs';
import { useWtBMessages } from './i18n-wt-b';

export function TaskList({
  messages,
  rows,
  locale,
  onComplete,
  onCreated,
  createProjectId,
  createViewDay = null,
  columns,
  view,
  showDetails = true,
  hideCompleted = true,
  manualOrder = false,
  trash = false,
  highlightQuery = '',
}: {
  readonly messages: Messages;
  readonly rows: readonly RowModel[];
  readonly locale: string;
  readonly onComplete: (row: RowModel) => void;
  readonly onCreated?: (() => void) | undefined;
  readonly createProjectId?: string | undefined;
  readonly createViewDay?: ViewDay | null | undefined;
  readonly columns?:
    | readonly { readonly id: string; readonly name: string; readonly wip_limit?: number | null }[]
    | undefined;
  readonly view: 'list' | 'kanban' | 'timeline';
  readonly showDetails?: boolean | undefined;
  readonly hideCompleted?: boolean | undefined;
  readonly manualOrder?: boolean | undefined;
  readonly trash?: boolean | undefined;
  readonly highlightQuery?: string;
}) {
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const tagById = new Map((catalog.data?.items ?? []).map((tag) => [tag.id, tag]));
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const now = useMemo(() => new Date(), []);

  function open(id: string): void {
    const next = new URLSearchParams(window.location.search);
    next.set('task', id);
    setParams(next, { replace: true });
  }

  function toggle(id: string, extend: boolean): void {
    setSelected((current) => {
      const next = extend ? new Set(current) : new Set<string>();
      if (current.has(id) && extend) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const visible = (hideCompleted ? rows.filter((row) => row.status !== 'completed') : rows).map(
    (row) => ({
      ...row,
      tags: row.tags.map((tag) => {
        const current = tagById.get(tag.id);
        return current ? { ...tag, name: current.name, color: current.color } : tag;
      }),
    }),
  );
  const detailId = params.get('task');
  const body =
    view === 'kanban' ? (
      <Kanban
        messages={messages}
        rows={visible}
        columns={columns ?? []}
        projectId={createProjectId}
        locale={locale}
        onOpen={open}
        onComplete={onComplete}
      />
    ) : view === 'timeline' ? (
      <Timeline messages={messages} rows={visible} onOpen={open} />
    ) : (
      <ul
        className="task-list"
        data-details={showDetails ? 'on' : 'off'}
        data-order={manualOrder ? 'manual' : 'auto'}
        data-search={highlightQuery.length > 0 ? 'true' : undefined}
      >
        {visible.map((row) => (
          <li
            key={row.id}
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                !event.target.closest('button, a, input, label')
              )
                open(row.id);
            }}
          >
            <TaskRow
              messages={messages}
              row={row}
              locale={locale}
              now={now}
              manualOrder={manualOrder}
              trash={trash}
              highlightQuery={highlightQuery}
              selected={selected.has(row.id)}
              open={detailId === row.id}
              onOpen={() => {
                open(row.id);
              }}
              onComplete={() => {
                onComplete(row);
              }}
              onSelect={(extend) => {
                toggle(row.id, extend);
              }}
            />
          </li>
        ))}
      </ul>
    );

  return (
    <div>
      {createProjectId !== undefined && view !== 'kanban' ? (
        <TaskComposer
          defaultProjectId={createProjectId}
          viewDay={createViewDay}
          onCreated={onCreated}
        />
      ) : null}
      {body}
      {selected.size > 0 ? (
        <div className="batch-bar" role="toolbar" aria-label={messages.selectedCount}>
          <span>
            {selected.size} {messages.selectedCount}
          </span>
          <Button
            onClick={() => {
              runAction(
                Promise.all(
                  [...selected].map((id) =>
                    api.completeTask(id, completeBody(), crypto.randomUUID()),
                  ),
                ).then(() => {
                  setSelected(new Set());
                  runAction(refreshTaskSurfaces(queryClient));
                  onCreated?.();
                }),
              );
            }}
          >
            {messages.batchComplete}
          </Button>
          <Button
            onClick={() => {
              runAction(
                api
                  .batchTasks({
                    action: 'due',
                    ids: [...selected],
                    due_date: new Date(Date.now() + 86_400_000).toISOString(),
                  })
                  .then(() => {
                    setSelected(new Set());
                    onCreated?.();
                  }),
              );
            }}
          >
            {messages.batchDate}
          </Button>
          <Button
            onClick={() => {
              runAction(
                api
                  .batchTasks({ action: 'priority', ids: [...selected], priority: 'high' })
                  .then(() => {
                    setSelected(new Set());
                    onCreated?.();
                  }),
              );
            }}
          >
            {messages.batchPriority}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              runAction(
                api.batchTasks({ action: 'delete', ids: [...selected] }).then(() => {
                  setSelected(new Set());
                  onCreated?.();
                }),
              );
            }}
          >
            {messages.batchDelete}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  messages,
  row,
  locale,
  now,
  manualOrder,
  trash = false,
  highlightQuery = '',
  selected,
  open,
  onOpen,
  onComplete,
  onSelect,
}: {
  readonly messages: Messages;
  readonly row: RowModel;
  readonly locale: string;
  readonly now: Date;
  readonly manualOrder: boolean;
  readonly trash?: boolean | undefined;
  readonly highlightQuery?: string;
  readonly selected: boolean;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onComplete: () => void;
  readonly onSelect: (extend: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const done = row.status === 'completed';
  const overdue = !done && isOverdue(row.dueDate, now);
  const today = !done && isSameDay(row.startDate ?? row.dueDate, now, row.timeZone);
  const dateClass = overdue ? 'task-date is-overdue' : today ? 'task-date is-today' : 'task-date';
  const named = row.tags.filter((tag) => tag.name.length > 0 && tag.name !== tag.id);
  const shown = named.slice(0, 2);
  const extra = named.length - shown.length;
  const when = trash
    ? (row.deletedAt ?? null)
    : done && row.completedAt !== null
      ? row.completedAt
      : (row.startDate ?? row.dueDate);
  return (
    <div
      data-task-id={row.id}
      tabIndex={0}
      className={`task-row${open ? ' is-selected' : ''}${selected ? ' is-batch' : ''}${done ? ' is-done' : ''}`}
      data-selected={open ? 'true' : undefined}
      draggable={manualOrder}
      onDragStart={(event) => {
        if (!manualOrder) {
          return;
        }
        event.dataTransfer.setData('text/plain', row.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if (manualOrder) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData('text/plain');
        if (!manualOrder || id.length === 0 || id === row.id) {
          return;
        }
        event.preventDefault();
        runAction(
          api.patchTask(id, { before_id: row.id }).then(() => refreshTaskSurfaces(queryClient)),
        );
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (touch === undefined) {
          return;
        }
        const start = Number(event.currentTarget.dataset.x ?? touch.clientX);
        if (touch.clientX - start > 70) {
          onComplete();
        }
      }}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        if (touch !== undefined) {
          event.currentTarget.dataset.x = String(touch.clientX);
        }
      }}
    >
      {trash || !manualOrder ? null : (
        <GripVertical className="task-grip" size={12} aria-hidden="true" />
      )}
      {trash ? (
        <span className="task-check-spacer" aria-hidden="true" />
      ) : (
        <PriorityCheck
          priority={row.priority}
          label={fill(
            done ? messages.reopenLabel : messages.completeLabel,
            displayTitle(row.title),
          )}
          checked={done}
          onChange={(event) => {
            if (
              event.nativeEvent instanceof MouseEvent &&
              (event.nativeEvent.metaKey || event.nativeEvent.ctrlKey || event.nativeEvent.shiftKey)
            ) {
              onSelect(true);
              return;
            }
            onComplete();
          }}
        />
      )}
      <button type="button" className="task-title" onClick={onOpen}>
        {row.kind === 'note' ? <span className="ui-badge">{messages.noteBadge}</span> : null}{' '}
        <Highlight
          query={highlightQuery}
          text={shownTitle(
            row.title,
            named.map((tag) => tag.name),
            messages.untitled,
          )}
        />
        {highlightQuery.length > 0 && row.content.length > 0 ? (
          <small className="search-snippet">
            <Highlight text={searchSnippet(row.content, highlightQuery)} query={highlightQuery} />
          </small>
        ) : null}
      </button>
      <span className="task-meta">
        {highlightQuery.length > 0 && row.repeat && row.dueDate !== null ? (
          <span>
            {messages.occurrenceLabel} {formatRowDate(row.dueDate, locale, now, true, messages)}
          </span>
        ) : null}
        {shown.map((tag) => (
          <Link
            key={tag.id}
            to={`/tag/${tag.id}`}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <TagChip label={tag.name} color={tag.color} />
          </Link>
        ))}
        {extra > 0 ? (
          <span
            className="ui-tag"
            title={named
              .slice(2)
              .map((tag) => tag.name)
              .join(', ')}
          >
            +{extra}
          </span>
        ) : null}
        {row.repeat ? <span title={messages.recurrence}>↻</span> : null}
        {row.checklist.total > 0 ? (
          <span>
            {row.checklist.completed}/{row.checklist.total}
          </span>
        ) : null}
        {row.projectName.length > 0 ? (
          <span className="task-list-name" title={row.projectName}>
            {row.projectName}
          </span>
        ) : null}
        {row.source === 'email' ? <span title={messages.sourceEmail}>✉</span> : null}
        {row.source === 'api' ? <span title={messages.sourceApi}>API</span> : null}
        {when !== null ? (
          <time
            className={dateClass}
            dateTime={when}
            title={
              done
                ? messages.completedOn.replace(
                    '{date}',
                    new Date(when).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  )
                : new Date(when).toLocaleString(locale, { timeZone: row.timeZone })
            }
          >
            {trash ? `${messages.deletedOn} ` : ''}
            {trash || done
              ? formatRowDate(when, locale, now, done, messages)
              : formatTaskRowDate(row, locale, now, messages)}
          </time>
        ) : null}
        {trash ? (
          <TrashActions
            restoreLabel={messages.restore}
            purgeLabel={messages.purge}
            confirmLabel={messages.confirmDelete}
            cancelLabel={messages.cancel}
            onRestore={() => {
              runAction(api.restoreTask(row.id).then(() => refreshTaskSurfaces(queryClient)));
            }}
            onPurge={() => {
              runAction(purgeTrashTask(queryClient, row.id));
            }}
          />
        ) : null}
      </span>
      {trash ? null : (
        <button
          type="button"
          className="task-more"
          aria-label={messages.openDetail}
          onClick={onOpen}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Kanban({
  messages,
  rows,
  columns,
  projectId,
  locale,
  onOpen,
  onComplete,
}: {
  readonly messages: Messages;
  readonly rows: readonly RowModel[];
  readonly columns: readonly {
    readonly id: string;
    readonly name: string;
    readonly wip_limit?: number | null;
  }[];
  readonly projectId?: string | undefined;
  readonly locale: string;
  readonly onOpen: (id: string) => void;
  readonly onComplete: (row: RowModel) => void;
}) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState('');
  const [boardError, setBoardError] = useState<string | null>(null);
  const boardMessages = useWtBMessages();
  const boardRef = useRef<HTMLDivElement>(null);
  const dateMode = columns.length === 0;
  const loose = rows.some((row) => row.columnId === null || row.columnId.length === 0);
  const cols = dateMode
    ? dateKanbanColumns(messages)
    : [...columns, ...(loose ? [{ id: 'none', name: messages.noSection }] : [])];
  const now = useMemo(() => new Date(), []);
  return (
    <div className="kanban-wrap">
      {boardError !== null ? (
        <p className="error kanban-error" role="alert">
          {boardError}
        </p>
      ) : null}
      <KanbanTabs
        board={boardRef}
        columns={cols.map((column) => ({
          ...column,
          count: rows.filter((row) =>
            dateMode
              ? dateBucketOf(row, now) === column.id
              : column.id === 'none'
                ? !row.columnId
                : row.columnId === column.id,
          ).length,
        }))}
      />
      <div className="kanban" ref={boardRef}>
        {cols.map((column) => {
          const items = rows.filter((row) =>
            dateMode
              ? dateBucketOf(row, now) === column.id
              : column.id === 'none'
                ? row.columnId === null || row.columnId.length === 0
                : row.columnId === column.id,
          );
          const createInColumn = () => {
            const patch = dateMode ? dateBucketPatch(column.id, null, now) : null;
            openTaskComposer({
              text: '',
              defaultProjectId: projectId,
              ...(dateMode
                ? {
                    date: {
                      dueDate: patch?.due_date ?? null,
                      allDay: true,
                      durationMinutes: null,
                      reminder: null,
                      reminderTouched: false,
                      repeatRule: null,
                    },
                  }
                : { columnId: column.id === 'none' ? null : column.id }),
            });
          };
          return (
            <section
              key={column.id}
              id={`kanban-column-${column.id}`}
              data-kanban-column={column.id}
              className="kanban-col"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                event.currentTarget.classList.add('is-over');
              }}
              onDragLeave={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  event.currentTarget.classList.remove('is-over');
              }}
              onDrop={(event) => {
                event.currentTarget.classList.remove('is-over');
                const id = event.dataTransfer.getData('text/plain');
                if (id.length === 0) {
                  return;
                }
                const row = rows.find((item) => item.id === id);
                const body = dateMode
                  ? dateBucketPatch(column.id, row ?? null, now)
                  : { column_id: column.id === 'none' ? null : column.id };
                void api
                  .patchTask(id, body)
                  .then(() => refreshTaskSurfaces(queryClient))
                  .catch((error: unknown) => {
                    if (error instanceof ApiError && error.code === 'wip_exceeded') {
                      setBoardError(messages.wipExceeded);
                      return;
                    }
                    setBoardError(messages.saveFailed);
                  });
              }}
            >
              <h3>
                {column.name}{' '}
                <span className="ui-badge">
                  {items.length}
                  {column.wip_limit != null ? `/${String(column.wip_limit)}` : ''}
                </span>
                <button
                  type="button"
                  className="kanban-column-add"
                  aria-label={`${messages.addTask}: ${column.name}`}
                  onClick={createInColumn}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
                {projectId !== undefined && column.id !== 'none' ? (
                  <ColumnLimit
                    label={messages.columnMenu}
                    limitLabel={messages.columnLimitShort}
                    current={column.wip_limit ?? null}
                    onSave={(value) => {
                      runAction(api.updateColumn(projectId, column.id, { wip_limit: value }));
                    }}
                  />
                ) : null}
              </h3>
              {items.length === 0 ? <p>{boardMessages.kanbanEmpty}</p> : null}
              {items.map((row) => (
                <article
                  key={row.id}
                  className="kanban-card"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && event.key === 'Enter') {
                      event.preventDefault();
                      onOpen(row.id);
                    }
                  }}
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      !event.target.closest('button, a, input, label')
                    )
                      onOpen(row.id);
                  }}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', row.id);
                  }}
                >
                  <div className="kanban-card-title">
                    <PriorityCheck
                      priority={row.priority}
                      label={fill(messages.completeLabel, displayTitle(row.title))}
                      onChange={() => {
                        onComplete(row);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(row.id);
                      }}
                    >
                      {shownTitle(
                        row.title,
                        row.tags.map((tag) => tag.name),
                        messages.untitled,
                      )}
                    </button>
                  </div>
                  <p className="kanban-card-meta">
                    {row.tags.slice(0, 2).map((tag) => (
                      <TagChip key={tag.id} label={tag.name} color={tag.color} />
                    ))}
                    {(row.startDate ?? row.dueDate) !== null ? (
                      <time dateTime={row.startDate ?? row.dueDate ?? undefined}>
                        {formatTaskRowDate(row, locale, new Date(), messages)}
                      </time>
                    ) : null}
                  </p>
                </article>
              ))}
              <div className="kanban-add-space">
                <button
                  type="button"
                  onClick={createInColumn}
                  aria-label={`${messages.addTask}: ${column.name}`}
                >
                  <Plus size={16} aria-hidden="true" />
                  {messages.addTask}
                </button>
              </div>
            </section>
          );
        })}
        {projectId !== undefined && !dateMode ? (
          <form
            className="kanban-col kanban-add"
            onSubmit={(event) => {
              event.preventDefault();
              const name = section.trim();
              if (name.length === 0) {
                return;
              }
              runAction(
                api.createColumn(projectId, name, crypto.randomUUID()).then(() => {
                  setSection('');
                  runAction(queryClient.invalidateQueries({ queryKey: ['columns', projectId] }));
                }),
              );
            }}
          >
            <input
              aria-label={messages.noColumns}
              placeholder={messages.sectionAdd}
              value={section}
              onChange={(event) => {
                setSection(event.target.value);
              }}
            />
          </form>
        ) : null}
      </div>
    </div>
  );
}

function Timeline({
  messages,
  rows,
  onOpen,
}: {
  readonly messages: Messages;
  readonly rows: readonly RowModel[];
  readonly onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const locale = useAppLocale();
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>(() => {
    try {
      const stored = window.localStorage.getItem('tick-tack-done.timeline.zoom');
      return stored === 'day' || stored === 'week' || stored === 'month' ? stored : 'week';
    } catch {
      return 'week';
    }
  });
  const planned = rows.filter((row) => (row.startDate ?? row.dueDate) !== null);
  const loose = rows.filter((row) => (row.startDate ?? row.dueDate) === null);
  const zoomLabel = {
    day: messages.timelineDay,
    week: messages.timelineWeek,
    month: messages.timelineMonth,
  } as const;
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' });
  return (
    <div className="timeline" data-zoom={zoom}>
      <div className="page-toolbar">
        <span>{messages.timelineZoom}</span>
        <div className="timeline-zoom" role="group" aria-label={messages.timelineZoom}>
          {(['day', 'week', 'month'] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              variant="ghost"
              className={zoom === item ? 'is-on' : undefined}
              aria-pressed={zoom === item}
              onClick={() => {
                setZoom(item);
                window.localStorage.setItem('tick-tack-done.timeline.zoom', item);
              }}
            >
              {zoomLabel[item]}
            </Button>
          ))}
        </div>
      </div>
      <aside>
        <h3>{messages.unscheduled}</h3>
        <ul>
          {loose.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', row.id);
                }}
                onClick={() => {
                  onOpen(row.id);
                }}
              >
                {shownTitle(
                  row.title,
                  row.tags.map((tag) => tag.name),
                  messages.untitled,
                )}
              </button>
              <Button
                onClick={() => {
                  runAction(
                    api
                      .patchTask(row.id, {
                        due_date: new Date().toISOString(),
                        start_date: new Date().toISOString(),
                      })
                      .then(() => refreshTaskSurfaces(queryClient)),
                  );
                }}
              >
                {messages.placeToday}
              </Button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="timeline-axis">
        {timelineDays(zoom).map((day) => {
          const key = day.toDateString();
          const items = planned.filter(
            (row) => new Date(row.startDate ?? row.dueDate ?? '').toDateString() === key,
          );
          return (
            <section
              key={key}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                const id = event.dataTransfer.getData('text/plain');
                if (id.length === 0) {
                  return;
                }
                const due = new Date(day);
                due.setHours(9, 0, 0, 0);
                runAction(
                  api
                    .patchTask(id, { due_date: due.toISOString(), start_date: due.toISOString() })
                    .then(() => refreshTaskSurfaces(queryClient)),
                );
              }}
            >
              <h3>{dayFormat.format(day)}</h3>
              {items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="timeline-bar"
                  title={shownTitle(
                    row.title,
                    row.tags.map((tag) => tag.name),
                    messages.untitled,
                  )}
                  onClick={() => {
                    onOpen(row.id);
                  }}
                >
                  {shownTitle(
                    row.title,
                    row.tags.map((tag) => tag.name),
                    messages.untitled,
                  )}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function timelineDays(zoom: 'day' | 'week' | 'month'): Date[] {
  const count = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function TrashActions({
  restoreLabel,
  purgeLabel,
  confirmLabel,
  cancelLabel,
  onRestore,
  onPurge,
}: {
  readonly restoreLabel: string;
  readonly purgeLabel: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onRestore: () => void;
  readonly onPurge: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span className="task-trash-actions">
        <Button
          type="button"
          size="sm"
          variant="danger"
          onClick={(event) => {
            event.stopPropagation();
            onPurge();
          }}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            setConfirm(false);
          }}
        >
          {cancelLabel}
        </Button>
      </span>
    );
  }
  return (
    <span className="task-trash-actions">
      <Button
        type="button"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onRestore();
        }}
      >
        {restoreLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          setConfirm(true);
        }}
      >
        {purgeLabel}
      </Button>
    </span>
  );
}

function ColumnLimit({
  label,
  limitLabel,
  current,
  onSave,
}: {
  readonly label: string;
  readonly limitLabel: string;
  readonly current: number | null;
  readonly onSave: (value: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current === null ? '' : String(current));
  return (
    <span className="column-limit">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setOpen((item) => !item);
        }}
      >
        …
      </Button>
      {open ? (
        <label>
          {limitLabel}
          <input
            value={value}
            inputMode="numeric"
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onBlur={() => {
              const next = value.trim().length === 0 ? null : Number(value);
              onSave(next !== null && Number.isInteger(next) && next > 0 ? next : null);
            }}
          />
        </label>
      ) : null}
    </span>
  );
}

function formatRowDate(
  value: string,
  locale: string,
  now: Date,
  done: boolean,
  messages: Messages,
): string {
  const date = new Date(value);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - start.getTime()) / 86_400_000);
  const time =
    date.getHours() === 0 && date.getMinutes() === 0
      ? ''
      : ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (!done && diff === 0) {
    return `${messages.dateToday}${time}`;
  }
  if (!done && diff === 1) {
    return `${messages.dateTomorrow}${time}`;
  }
  const formatted = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
  return `${formatted}${time.length > 0 ? `,${time}` : ''}`;
}

function shownTitle(title: string, tagNames: readonly string[], untitled: string): string {
  const text = displayTitle(title, tagNames);
  return text.length === 0 ? untitled : text;
}

/** TTD-AUD-68: date columns when the list has no board sections. */
function dateKanbanColumns(
  messages: Messages,
): readonly { readonly id: string; readonly name: string; readonly wip_limit?: number | null }[] {
  return [
    { id: 'overdue', name: messages.overdueTitle },
    { id: 'today', name: messages.navToday },
    { id: 'tomorrow', name: messages.navTomorrow },
    { id: 'next7', name: messages.navNext7 },
    { id: 'later', name: messages.kanbanLater },
    { id: 'nodate', name: messages.noDate },
  ];
}

function dateBucketOf(row: RowModel, now: Date): string {
  if (row.dueDate === null) {
    return 'nodate';
  }
  const zone = row.timeZone.length > 0 ? row.timeZone : 'UTC';
  const today = calendarDay(now.toISOString(), zone);
  const due = calendarDay(row.dueDate, zone);
  if (due < today) {
    return 'overdue';
  }
  if (due === today) {
    return 'today';
  }
  const tomorrow = calendarDay(new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), zone);
  if (due === tomorrow) {
    return 'tomorrow';
  }
  const weekEnd = calendarDay(
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    zone,
  );
  if (due <= weekEnd) {
    return 'next7';
  }
  return 'later';
}

function dateBucketPatch(
  bucket: string,
  row: RowModel | null,
  now: Date,
): { due_date: string | null; is_all_day: boolean } {
  const zone = row?.timeZone && row.timeZone.length > 0 ? row.timeZone : 'UTC';
  if (bucket === 'nodate') {
    return { due_date: null, is_all_day: true };
  }
  const offsetDays =
    bucket === 'overdue' || bucket === 'today'
      ? 0
      : bucket === 'tomorrow'
        ? 1
        : bucket === 'next7'
          ? 3
          : 14;
  const target = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const key = calendarDay(target.toISOString(), zone);
  return { due_date: `${key}T00:00:00.000Z`, is_all_day: true };
}

function searchSnippet(content: string, query: string): string {
  const match = content.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  const start = Math.max(0, match - 60);
  return `${start > 0 ? '…' : ''}${content.slice(start, start + 240)}`;
}
