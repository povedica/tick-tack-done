import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyQuadrantDrop,
  DEFAULT_QUADRANT_EFFECTS,
  type MatrixQuadrant,
} from '@reflexionia/domain';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { taskQueryHref } from '../../shell/use-open-task';
import type { Task } from '@reflexionia/sdk';
import { api } from '../../api';
import { PriorityCheck } from '../../components/PriorityCheck';
import { displayTitle } from '../tasks/displayTitle';
import { EmptyState } from '../../components/ui';
import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { completeBody } from '../tasks/complete-body';
import { newMutation, runOrQueue } from '../offline/client';
import { quadrantOf } from '../tasks/model';
import { formatDueChip } from '../today/groups';
import { loadMatrixTasks } from './load';
import type { MatrixLayout } from './layout';
import { matrixScopeKey, matrixScopeParam, parseMatrixScope, type MatrixScope } from './scope';
import './matrix.css';

const QUADRANTS = ['do', 'schedule', 'delegate', 'drop'] as const;

export function MatrixViewToggle({
  value,
  onChange,
}: {
  readonly value: MatrixLayout;
  readonly onChange: (next: MatrixLayout) => void;
}) {
  const messages = useMessages();
  return (
    <div className="matrix-toggle" role="group" aria-label={messages.matrixView}>
      <button
        type="button"
        aria-pressed={value === 'list'}
        onClick={() => {
          onChange('list');
        }}
      >
        {messages.viewList}
      </button>
      <button
        type="button"
        aria-pressed={value === 'matrix'}
        onClick={() => {
          onChange('matrix');
        }}
      >
        {messages.matrixTitle}
      </button>
    </div>
  );
}

export function MatrixPage() {
  const [params, setParams] = useSearchParams();
  const scope = parseMatrixScope(params.get('scope'));

  useEffect(() => {
    if (params.get('scope') !== null) {
      return;
    }
    const next = new URLSearchParams(params);
    next.set('scope', 'all');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <MatrixBoard
      scope={scope}
      picker
      onScope={(next) => {
        const query = new URLSearchParams(params);
        query.set('scope', matrixScopeParam(next));
        setParams(query, { replace: true });
      }}
    />
  );
}

export function MatrixBoard({
  scope,
  picker = false,
  embedded = false,
  onScope,
}: {
  readonly scope: MatrixScope;
  readonly picker?: boolean;
  readonly embedded?: boolean;
  readonly onScope?: (scope: MatrixScope) => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const location = useLocation();
  const queryClient = useQueryClient();
  const narrow = useNarrowViewport();
  const [info, setInfo] = useState(false);
  const [active, setActive] = useState<MatrixQuadrant>('do');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<ReadonlySet<string>>(new Set());
  const [completeError, setCompleteError] = useState<string | null>(null);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects(),
    staleTime: 60_000,
  });
  const tasks = useQuery({
    queryKey: ['matrix-tasks', matrixScopeKey(scope)],
    queryFn: () => loadMatrixTasks((query) => api.listTasks(query), scope, new Date()),
  });
  const names = useMemo(
    () =>
      new Map(
        (projects.data?.items ?? []).map((project) => [
          project.id,
          project.is_inbox ? messages.smartInbox : project.name,
        ]),
      ),
    [projects.data?.items, messages.smartInbox],
  );
  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => {
    const next: Record<MatrixQuadrant, Task[]> = { do: [], schedule: [], delegate: [], drop: [] };
    for (const task of tasks.data ?? []) {
      next[quadrantOf(task.priority, task.due_date, now)].push(task);
    }
    return next;
  }, [now, tasks.data]);

  function move(taskId: string, quadrant: MatrixQuadrant): void {
    const patch = applyQuadrantDrop(DEFAULT_QUADRANT_EFFECTS[quadrant], new Date().toISOString());
    setMenuId(null);
    runAction(
      api.patchTask(taskId, { priority: patch.priority, due_date: patch.dueDate }).then(() => {
        runAction(tasks.refetch());
        runAction(refreshTaskSurfaces(queryClient));
      }),
    );
  }

  const quads = QUADRANTS.map((key) => ({
    key,
    short: shortLabel(messages, key),
    label: longLabel(messages, key),
    tone: `is-${key}`,
  }));

  const body = (
    <>
      {completeError !== null ? <p role="alert">{completeError}</p> : null}
      <div className="matrix-toolbar">
        {embedded ? null : <h1>{messages.matrixTitle}</h1>}
        <div className="page-actions">
          {picker ? (
            <label className="matrix-scope">
              {messages.matrixScope}
              <select
                aria-label={messages.matrixScope}
                value={matrixScopeParam(scope)}
                onChange={(event) => {
                  onScope?.(parseMatrixScope(event.target.value));
                }}
              >
                <option value="all">{messages.matrixAll}</option>
                <option value="today">{messages.navToday}</option>
                {(projects.data?.items ?? []).map((project) => (
                  <option key={project.id} value={`list/${project.id}`}>
                    {project.is_inbox ? messages.smartInbox : project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-expanded={info}
            aria-label={messages.matrixInfo}
            onClick={() => {
              setInfo((current) => !current);
            }}
          >
            i
          </button>
        </div>
      </div>
      {info ? <p className="matrix-info ui-muted">{messages.matrixRules}</p> : null}
      {tasks.isSuccess && tasks.data.length === 0 ? (
        <EmptyState title={messages.matrixTitle} body={messages.matrixEmpty} />
      ) : null}
      <div className="matrix-tabs" role="tablist" aria-label={messages.matrixTitle}>
        {quads.map((quad) => (
          <button
            key={quad.key}
            type="button"
            role="tab"
            aria-selected={active === quad.key}
            onClick={() => {
              setActive(quad.key);
            }}
          >
            {quad.short} {groups[quad.key].length}
          </button>
        ))}
      </div>
      <div className="quad-grid">
        {quads.map((quad) => (
          <section
            key={quad.key}
            className={`quad ${quad.tone}${active === quad.key ? ' is-active' : ''}`}
            onDragOver={(event) => {
              if (!narrow) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              if (narrow) {
                return;
              }
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain');
              if (id.length > 0) {
                move(id, quad.key);
              }
            }}
          >
            <h2>
              {quad.label} <span className="ui-badge">{groups[quad.key].length}</span>
            </h2>
            <ul className="task-list">
              {groups[quad.key].map((task) => {
                const due = formatDueChip(
                  task.due_date,
                  task.time_zone,
                  task.is_all_day,
                  now,
                  locale,
                  { empty: messages.noDate, today: messages.navToday },
                );
                return (
                  <li key={task.id}>
                    <div
                      className="task-row matrix-card"
                      draggable={!narrow}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', task.id);
                      }}
                    >
                      <PriorityCheck
                        priority={task.priority}
                        label={messages.completeLabel.replace('{name}', displayTitle(task.title))}
                        checked={false}
                        disabled={completing.has(task.id)}
                        onChange={() => {
                          setCompleting((ids) => new Set([...ids, task.id]));
                          setCompleteError(null);
                          void runOrQueue(newMutation('complete', task.id, completeBody()), (key) =>
                            api.completeTask(task.id, completeBody(), key),
                          )
                            .then(() => refreshTaskSurfaces(queryClient))
                            .catch(() => {
                              setCompleteError(messages.completeFailed);
                            })
                            .finally(() => {
                              setCompleting(
                                (ids) => new Set([...ids].filter((id) => id !== task.id)),
                              );
                            });
                        }}
                      />
                      <Link
                        className="task-title"
                        to={taskQueryHref(location.pathname, location.search, task.id)}
                      >
                        {displayTitle(task.title)}
                      </Link>
                      <span className="task-meta">
                        {scope.kind === 'all' ? (
                          <span className="task-list-name">{names.get(task.project_id) ?? ''}</span>
                        ) : null}
                        {task.due_date !== null ? (
                          <time
                            className={
                              due.tone === 'overdue' ? 'task-date is-overdue' : 'task-date'
                            }
                          >
                            {due.text}
                          </time>
                        ) : null}
                        <span>{priorityLabel(messages, task.priority)}</span>
                      </span>
                      {narrow ? (
                        <button
                          type="button"
                          className="task-more is-visible"
                          aria-label={messages.matrixMove}
                          aria-expanded={menuId === task.id}
                          onClick={() => {
                            setMenuId((current) => (current === task.id ? null : task.id));
                          }}
                        >
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </button>
                      ) : null}
                      {narrow && menuId === task.id ? (
                        <div className="matrix-move" role="menu" aria-label={messages.matrixMove}>
                          {quads.map((target) => (
                            <button
                              key={target.key}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                move(task.id, target.key);
                              }}
                            >
                              {target.short}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
  if (embedded) {
    return <div className="matrix-board">{body}</div>;
  }
  return <section className="screen-page is-wide matrix-board">{body}</section>;
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 800px)').matches : false,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 800px)');
    const onChange = (): void => {
      setNarrow(query.matches);
    };
    onChange();
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);
  return narrow;
}

function shortLabel(messages: Messages, key: MatrixQuadrant): string {
  switch (key) {
    case 'do':
      return messages.matrixDo;
    case 'schedule':
      return messages.matrixSchedule;
    case 'delegate':
      return messages.matrixDelegate;
    case 'drop':
      return messages.matrixDrop;
  }
}

function longLabel(messages: Messages, key: MatrixQuadrant): string {
  switch (key) {
    case 'do':
      return messages.quadrantDo;
    case 'schedule':
      return messages.quadrantSchedule;
    case 'delegate':
      return messages.quadrantDelegate;
    case 'drop':
      return messages.quadrantDrop;
  }
}

function priorityLabel(messages: Messages, priority: Task['priority']): string {
  switch (priority) {
    case 'high':
      return messages.priorityHigh;
    case 'medium':
      return messages.priorityMedium;
    case 'low':
      return messages.priorityLow;
    case 'none':
      return messages.priorityNone;
  }
}
