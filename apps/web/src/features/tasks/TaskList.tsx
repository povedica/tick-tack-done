import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { ApiError } from '@reflexionia/sdk';
import { useSearchParams } from 'react-router';
import { api } from '../../api';
import { PriorityCheck } from '../../components/PriorityCheck';
import { Button, TagChip } from '../../components/ui';
import { captureLanguage, fill, type Messages } from '../../i18n';
import { quickAddRequest, type ViewDay } from '../capture/quick-add';
import { newMutation, runOrQueue } from '../offline/client';
import { isOverdue, isSameDay, type RowModel } from './model';

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
}) {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [limit, setLimit] = useState('');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<readonly RowModel[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
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

  const visible = [
    ...pending,
    ...(hideCompleted ? rows.filter((row) => row.status !== 'completed') : rows),
  ];
  const detailId = params.get('task');
  const body =
    view === 'kanban' ? (
      <Kanban
        messages={messages}
        rows={visible}
        columns={columns ?? []}
        projectId={createProjectId}
        onOpen={open}
        onComplete={onComplete}
      />
    ) : view === 'timeline' ? (
      <Timeline messages={messages} rows={visible} onOpen={open} />
    ) : (
      <ul className="task-list" data-details={showDetails ? 'on' : 'off'}>
        {visible.map((row) => (
          <li key={row.id}>
            <TaskRow
              messages={messages}
              row={row}
              locale={locale}
              now={now}
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
      {createProjectId !== undefined ? (
        <>
          <form
            className="inline-add"
            onSubmit={(event) => {
              event.preventDefault();
              const title = draft.trim();
              if (title.length === 0) {
                return;
              }
              const request = quickAddRequest({
                text: title,
                language: captureLanguage(locale),
                now: new Date().toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                viewDay: createViewDay,
                defaultProjectId: createProjectId,
              });
              const tempId = `pending-${crypto.randomUUID()}`;
              const row: RowModel = {
                id: tempId,
                title: request.parsed.title.length > 0 ? request.parsed.title : title,
                priority: request.parsed.priority ?? 'none',
                dueDate: request.dueDate ?? request.parsed.due?.date ?? null,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                projectId: createProjectId ?? '',
                projectName: '',
                columnId: null,
                tags: request.parsed.tagNames.map((name) => ({ id: name, name, color: null })),
                checklist: { completed: 0, total: 0 },
                kind: 'task',
                status: 'active',
                repeat: false,
                source: 'manual',
                content: '',
              };
              setDraft('');
              setCreateError(null);
              setPending((current) => [row, ...current]);
              addRef.current?.focus();
              void runOrQueue(newMutation('create', tempId, { ...request.body }), (key) =>
                api.createTask(request.body, key),
              )
                .then((outcome) => {
                  if (!outcome.queued) {
                    setPending((current) => current.filter((item) => item.id !== tempId));
                  }
                  onCreated?.();
                })
                .catch(() => {
                  setPending((current) => current.filter((item) => item.id !== tempId));
                  setDraft(title);
                  setCreateError(messages.createFailed);
                  addRef.current?.focus();
                });
            }}
          >
            <input
              ref={addRef}
              name="title"
              value={draft}
              aria-label={messages.addTask}
              placeholder={`+ ${messages.addTask}`}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
          </form>
          {createError !== null ? (
            <p className="error" role="alert">
              {createError}
            </p>
          ) : null}
        </>
      ) : null}
      {body}
      {selected.size > 0 ? (
        <div className="batch-bar" role="toolbar" aria-label={messages.selectedCount}>
          <span>
            {selected.size} {messages.selectedCount}
          </span>
          <Button
            onClick={() => {
              void api.batchTasks({ action: 'complete', ids: [...selected] }).then(() => {
                setSelected(new Set());
                onCreated?.();
              });
            }}
          >
            {messages.batchComplete}
          </Button>
          <Button
            onClick={() => {
              void api
                .batchTasks({
                  action: 'due',
                  ids: [...selected],
                  due_date: new Date(Date.now() + 86_400_000).toISOString(),
                })
                .then(() => {
                  setSelected(new Set());
                  onCreated?.();
                });
            }}
          >
            {messages.batchDate}
          </Button>
          <Button
            onClick={() => {
              void api
                .batchTasks({ action: 'priority', ids: [...selected], priority: 'high' })
                .then(() => {
                  setSelected(new Set());
                  onCreated?.();
                });
            }}
          >
            {messages.batchPriority}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void api.batchTasks({ action: 'delete', ids: [...selected] }).then(() => {
                setSelected(new Set());
                onCreated?.();
              });
            }}
          >
            {messages.batchDelete}
          </Button>
        </div>
      ) : null}
      {view === 'kanban' && (columns?.length ?? 0) > 0 ? (
        <label>
          {messages.columnLimit}
          <input
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
            }}
            onBlur={() => {
              const column = columns?.[0];
              const value = Number(limit);
              if (
                createProjectId !== undefined &&
                column !== undefined &&
                Number.isInteger(value) &&
                value > 0
              ) {
                void api.updateColumn(createProjectId, column.id, { wip_limit: value });
              }
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function TaskRow({
  messages,
  row,
  locale,
  now,
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
  readonly selected: boolean;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onComplete: () => void;
  readonly onSelect: (extend: boolean) => void;
}) {
  const overdue = isOverdue(row.dueDate, now);
  const today = isSameDay(row.dueDate, now, row.timeZone);
  const dateClass = overdue ? 'task-date is-overdue' : today ? 'task-date is-today' : 'task-date';
  return (
    <div
      className={`task-row${open ? ' is-selected' : ''}${selected ? ' is-batch' : ''}`}
      data-selected={open ? 'true' : undefined}
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
      <GripVertical className="task-grip" size={12} aria-hidden="true" />
      <PriorityCheck
        priority={row.priority}
        label={fill(messages.completeLabel, row.title)}
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
      <button type="button" className="task-title" onClick={onOpen}>
        {row.title}
      </button>
      <span className="task-meta">
        {row.tags.map((tag) => (
          <TagChip key={tag.id} label={tag.name} color={tag.color} />
        ))}
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
        {row.dueDate !== null ? (
          <time className={dateClass} dateTime={row.dueDate}>
            {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
              new Date(row.dueDate),
            )}
          </time>
        ) : null}
      </span>
      <button type="button" className="task-more" aria-label={messages.openDetail} onClick={onOpen}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function Kanban({
  messages,
  rows,
  columns,
  projectId,
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
  readonly onOpen: (id: string) => void;
  readonly onComplete: (row: RowModel) => void;
}) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState('');
  const loose = rows.some((row) => row.columnId === null || row.columnId.length === 0);
  const cols =
    columns.length === 0
      ? [{ id: 'none', name: messages.noSection }]
      : [...columns, ...(loose ? [{ id: 'none', name: messages.noSection }] : [])];
  return (
    <div className="kanban">
      {cols.map((column) => {
        const items = rows.filter((row) =>
          column.id === 'none'
            ? row.columnId === null || row.columnId.length === 0
            : row.columnId === column.id,
        );
        return (
          <section
            key={column.id}
            className="kanban-col"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              const id = event.dataTransfer.getData('text/plain');
              if (id.length === 0 || column.id === 'none') {
                return;
              }
              void api.patchTask(id, { column_id: column.id }).catch((error: unknown) => {
                if (error instanceof ApiError && error.code === 'wip_exceeded') {
                  window.alert(messages.wipExceeded);
                }
              });
            }}
          >
            <h3>
              {column.name}{' '}
              <span className="ui-badge">
                {items.length}
                {column.wip_limit != null ? `/${String(column.wip_limit)}` : ''}
              </span>
            </h3>
            {items.length === 0 ? <p>{messages.kanbanEmpty}</p> : null}
            {items.map((row) => (
              <article
                key={row.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', row.id);
                }}
              >
                <PriorityCheck
                  priority={row.priority}
                  label={fill(messages.completeLabel, row.title)}
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
                  {row.title}
                </button>
              </article>
            ))}
          </section>
        );
      })}
      {projectId !== undefined ? (
        <form
          className="kanban-col kanban-add"
          onSubmit={(event) => {
            event.preventDefault();
            const name = section.trim();
            if (name.length === 0) {
              return;
            }
            void api.createColumn(projectId, name, crypto.randomUUID()).then(() => {
              setSection('');
              void queryClient.invalidateQueries({ queryKey: ['columns', projectId] });
            });
          }}
        >
          <input
            aria-label={messages.noColumns}
            placeholder={messages.noColumns}
            value={section}
            onChange={(event) => {
              setSection(event.target.value);
            }}
          />
        </form>
      ) : null}
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
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>('week');
  const planned = rows.filter((row) => row.dueDate !== null);
  const loose = rows.filter((row) => row.dueDate === null);
  return (
    <div className="timeline" data-zoom={zoom}>
      <div className="page-toolbar">
        <span>{messages.timelineZoom}</span>
        {(['day', 'week', 'month'] as const).map((item) => (
          <Button
            key={item}
            onClick={() => {
              setZoom(item);
            }}
          >
            {item}
          </Button>
        ))}
      </div>
      <aside>
        <h3>{messages.unscheduled}</h3>
        <ul>
          {loose.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  onOpen(row.id);
                }}
              >
                {row.title}
              </button>
              <Button
                onClick={() => {
                  void api.patchTask(row.id, {
                    due_date: new Date().toISOString(),
                    start_date: new Date().toISOString(),
                  });
                }}
              >
                {messages.placeToday}
              </Button>
            </li>
          ))}
        </ul>
      </aside>
      <div>
        {planned.map((row) => (
          <button
            key={row.id}
            type="button"
            className="timeline-bar"
            onClick={() => {
              onOpen(row.id);
            }}
          >
            {row.title}
          </button>
        ))}
        {planned.length === 0 ? <p>{messages.unscheduled}</p> : null}
      </div>
    </div>
  );
}
