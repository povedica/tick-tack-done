import { runAction } from '../../../components/run-action';
import type { ViewPage } from '@reflexionia/sdk';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { api } from '../../../api';
import { completeBody } from '../../tasks/complete-body';
import { ViewMenu } from '../../../components/ViewMenu';
import { useMessages, type Messages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { SidebarFoldButton } from '../../../shell/SidebarFoldButton';
import { MatrixBoard, MatrixViewToggle } from '../../matrix/MatrixBoard';
import { readMatrixLayout, writeMatrixLayout } from '../../matrix/layout';
import { useFeatures } from '../../settings/feature-flags';
import { newMutation, runOrQueue } from '../../offline/client';
import {
  collectFilterTasks,
  collectProjects,
  collectSmartList,
  collectTags,
  collectTasksByTag,
} from '../../tasks/collect';
import { rowFromTask, rowsFromView, smartApiKey } from '../../tasks/model';
import { refreshTaskSurfaces } from '../../tasks/refresh';
import { TaskList } from '../../tasks/TaskList';
import type { ViewDay } from '../../capture/quick-add';
import {
  patchViewPrefs,
  readViewPrefs,
  type StoredBoardView,
  type ViewGroupBy,
  type ViewSort,
} from '../view-prefs';
import { viewsApi } from '../api';

type GroupBy = ViewPage['group_by'];
type Sort = ViewPage['sort'];
type BoardView = StoredBoardView;

export function SmartListViewPage() {
  const messages = useMessages();
  const { key } = useParams();
  const listKey = smartApiKey(key ?? 'today');
  return (
    <Board
      key={listKey}
      messages={messages}
      title={smartLabel(messages, listKey)}
      queryKey={['smart-list-tasks', listKey]}
      load={(groupBy, sort) => collectSmartList(listKey, { groupBy, sort })}
      notice={listKey === 'assigned_to_me' ? messages.assignedEmpty : undefined}
      createViewDay={viewDayFor(listKey)}
      viewKey={`smart:${listKey}`}
      revealCompleted={listKey === 'completed' || listKey === 'trash'}
      initialGroup={listKey === 'completed' || listKey === 'trash' ? 'section' : 'priority'}
    />
  );
}

export function FilterViewPage() {
  const messages = useMessages();
  const { id } = useParams();
  const filterId = id ?? '';
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => viewsApi.listFilters() });
  const filter = filters.data?.items.find((item) => item.id === filterId);
  return (
    <Board
      messages={messages}
      title={filter?.name ?? messages.filtersTitle}
      queryKey={['filter-tasks', filterId]}
      load={(groupBy, sort) => collectFilterTasks(filterId, { groupBy, sort })}
      enabled={filterId.length > 0}
      viewKey={`filter:${filterId}`}
    />
  );
}

export function ProjectListPage() {
  const messages = useMessages();
  const { id } = useParams();
  const projectId = id ?? '';
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const project = projects.data?.items.find((item) => item.id === projectId);
  const columns = useQuery({
    queryKey: ['columns', projectId],
    queryFn: () => api.listColumns(projectId),
    enabled: projectId.length > 0,
  });
  if (projects.isSuccess && projectId.length > 0 && project === undefined) {
    return (
      <main className="screen-page">
        <h1>{messages.notFoundTitle}</h1>
        <p>{messages.notFoundBody}</p>
      </main>
    );
  }
  return (
    <Board
      key={projectId}
      messages={messages}
      title={project?.name ?? messages.listName}
      queryKey={['project-tasks', projectId]}
      createProjectId={projectId}
      matrixListId={project !== undefined && project.kind !== 'NOTE' ? projectId : undefined}
      columns={(columns.data?.items ?? []).map((column) => ({
        id: column.id,
        name: column.name,
        wip_limit: wipOf(column),
      }))}
      load={(groupBy, sort) =>
        viewsApi.previewFilter(
          {
            mode: 'normal',
            rules: {
              combinator: 'AND',
              groups: [
                {
                  combinator: 'AND',
                  conditions: [{ field: 'list', op: 'in', value: [projectId] }],
                },
              ],
            },
          },
          { groupBy, sort },
        )
      }
      enabled={projectId.length > 0}
      note={project?.kind === 'NOTE'}
      viewKey={`project:${projectId}`}
    />
  );
}

export function Board({
  messages,
  title,
  queryKey,
  load,
  enabled = true,
  createProjectId,
  createViewDay = null,
  columns,
  notice,
  note = false,
  viewKey,
  revealCompleted = false,
  initialGroup = 'section',
  matrixListId,
  headerActions,
}: {
  readonly messages: Messages;
  readonly title: string;
  readonly queryKey: readonly unknown[];
  readonly load: (groupBy: GroupBy, sort: Sort) => Promise<ViewPage>;
  readonly enabled?: boolean | undefined;
  readonly createProjectId?: string | undefined;
  readonly createViewDay?: ViewDay | null | undefined;
  readonly columns?:
    | readonly { readonly id: string; readonly name: string; readonly wip_limit?: number | null }[]
    | undefined;
  readonly notice?: string | undefined;
  readonly note?: boolean | undefined;
  readonly viewKey: string;
  readonly revealCompleted?: boolean | undefined;
  readonly initialGroup?: GroupBy | undefined;
  readonly matrixListId?: string | undefined;
  readonly headerActions?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const locale = useAppLocale();
  const flags = useFeatures((state) => state.flags);
  const [params, setParams] = useSearchParams();
  const [prefs, setPrefs] = useState(() =>
    readViewPrefs(viewKey, {
      group: initialGroup,
      hideCompleted: !revealCompleted,
    }),
  );
  const groupBy: GroupBy = prefs.group;
  const sort: Sort = prefs.sort;
  const details = prefs.showDetails;
  const hideCompleted = prefs.hideCompleted;
  const [matrixLayout, setMatrixLayout] = useState(() =>
    matrixListId === undefined ? 'list' : readMatrixLayout(`list:${matrixListId}`),
  );
  useEffect(() => {
    if (matrixListId === undefined) {
      return;
    }
    setMatrixLayout(readMatrixLayout(`list:${matrixListId}`));
  }, [matrixListId]);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const inboxId = projects.data?.items.find((project) => project.is_inbox)?.id;
  const view = parseView(params.get('view') ?? prefs.view);
  const page = useQuery({
    queryKey: [...queryKey, groupBy, sort],
    queryFn: () => load(groupBy, sort),
    enabled,
    placeholderData: keepPreviousData,
  });
  const showNotes = note || viewKey.startsWith('smart:');
  const canCapture = !note && viewKey !== 'smart:trash' && viewKey !== 'smart:completed';
  const rows = rowsFromView(page.data)
    .filter((row) => (showNotes ? true : row.kind === 'task'))
    .filter((row) => row.status !== 'archived')
    .map((row) =>
      inboxId !== undefined && row.projectId === inboxId
        ? { ...row, projectName: messages.smartInbox }
        : row,
    );

  function savePrefs(patch: Partial<typeof prefs>): void {
    setPrefs(patchViewPrefs(viewKey, patch));
  }

  function chooseView(next: BoardView): void {
    savePrefs({ view: next });
    const query = new URLSearchParams(params);
    query.set('view', next);
    setParams(query, { replace: true });
  }

  return (
    <main className="screen-page">
      <header className="today-header">
        <div className="page-title">
          <SidebarFoldButton />
          <h1>{title}</h1>
        </div>
        <div className="page-actions">
          {headerActions}
          {flags.matrix && matrixListId !== undefined ? (
            <MatrixViewToggle
              value={matrixLayout}
              onChange={(next) => {
                writeMatrixLayout(`list:${matrixListId}`, next);
                setMatrixLayout(next);
              }}
            />
          ) : null}
          <span className="ui-badge">
            {page.isPending
              ? '—'
              : (() => {
                  const count = page.data?.count ?? rows.length;
                  return count === 1
                    ? messages.taskCountOne
                    : messages.taskCount.replace('{count}', String(count));
                })()}
          </span>
          <ViewMenu
            messages={messages}
            view={view}
            onView={chooseView}
            details={details}
            onDetails={(value) => {
              savePrefs({ showDetails: value });
            }}
            hideCompleted={hideCompleted}
            onHideCompleted={(value) => {
              savePrefs({ hideCompleted: value });
            }}
            onPrint={() => {
              window.print();
            }}
          >
            <label>
              {messages.groupBy}
              <select
                value={groupBy}
                onChange={(event) => {
                  savePrefs({ group: event.target.value as ViewGroupBy });
                }}
              >
                <option value="none">{messages.groupNone}</option>
                <option value="section">{messages.groupSection}</option>
                <option value="date">{messages.groupDate}</option>
                <option value="tag">{messages.groupTag}</option>
                <option value="priority">{messages.groupPriority}</option>
              </select>
            </label>
            <label>
              {messages.sortBy}
              <select
                value={sort}
                onChange={(event) => {
                  savePrefs({ sort: event.target.value as ViewSort });
                }}
              >
                <option value="manual">{messages.sortManual}</option>
                <option value="date">{messages.sortDate}</option>
                <option value="priority">{messages.sortPriority}</option>
                <option value="title">{messages.sortTitle}</option>
                <option value="created">{messages.sortCreated}</option>
              </select>
            </label>
          </ViewMenu>
        </div>
      </header>
      {notice !== undefined ? <p>{notice}</p> : null}
      {note && rows.length === 0 ? <p>{messages.noteEmpty}</p> : null}
      {page.isError ? <p className="error">{messages.previewFailed}</p> : null}
      {flags.matrix && matrixListId !== undefined && matrixLayout === 'matrix' ? (
        <MatrixBoard scope={{ kind: 'list', listId: matrixListId }} embedded />
      ) : (
        <TaskList
          messages={messages}
          rows={rows}
          locale={locale}
          view={view}
          columns={columns}
          showDetails={details}
          hideCompleted={hideCompleted}
          manualOrder={sort === 'manual'}
          trash={viewKey === 'smart:trash'}
          createProjectId={canCapture ? (createProjectId ?? inboxId) : undefined}
          createViewDay={createViewDay}
          onComplete={(row) => {
            if (row.status === 'completed') {
              runAction(
                api.uncompleteTask(row.id, crypto.randomUUID()).then(() => {
                  runAction(refreshTaskSurfaces(queryClient));
                }),
              );
              return;
            }
            runAction(
              runOrQueue(newMutation('complete', row.id, {}), (key) =>
                api.completeTask(row.id, completeBody(), key),
              ).then(() => {
                runAction(refreshTaskSurfaces(queryClient));
              }),
            );
          }}
          onCreated={() => {
            runAction(refreshTaskSurfaces(queryClient));
          }}
        />
      )}
    </main>
  );
}

export function CancelledPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ['cancelled-tasks'],
    queryFn: () => api.listTasks({ status: 'cancelled', limit: 100 }),
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: collectProjects,
    staleTime: 5 * 60_000,
  });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const names = new Map((projects.data?.items ?? []).map((project) => [project.id, project.name]));
  const tagNames = new Map((tags.data?.items ?? []).map((item) => [item.id, item.name]));
  const rows = (tasks.data?.items ?? []).map((task) => rowFromTask(task, names, tagNames));
  return (
    <main className="screen-page">
      <header className="today-header">
        <h1>{messages.navWont}</h1>
      </header>
      {tasks.isSuccess && rows.length === 0 ? <p>{messages.wontEmpty}</p> : null}
      <TaskList
        messages={messages}
        rows={rows}
        locale={locale}
        view="list"
        hideCompleted={false}
        onComplete={(row) => {
          runAction(
            api.completeTask(row.id, completeBody(), crypto.randomUUID()).then(() => {
              runAction(refreshTaskSurfaces(queryClient));
              runAction(queryClient.invalidateQueries({ queryKey: ['cancelled-tasks'] }));
            }),
          );
        }}
      />
    </main>
  );
}

export function TagViewPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: collectProjects,
    staleTime: 5 * 60_000,
  });
  const tasks = useQuery({
    queryKey: ['tag-tasks', id],
    queryFn: () => collectTasksByTag(id),
    enabled: id.length > 0,
  });
  const tag = tags.data?.items.find((item) => item.id === id);
  if (tags.isSuccess && id.length > 0 && tag === undefined) {
    return (
      <main className="screen-page">
        <h1>{messages.notFoundTitle}</h1>
        <p>{messages.notFoundBody}</p>
      </main>
    );
  }
  const names = new Map((projects.data?.items ?? []).map((project) => [project.id, project.name]));
  const tagNames = new Map((tags.data?.items ?? []).map((item) => [item.id, item.name]));
  const rows = (tasks.data ?? []).map((task) => rowFromTask(task, names, tagNames));
  return (
    <main className="screen-page">
      <header className="today-header">
        <div className="page-title">
          <h1>{tag?.name ?? messages.tagsTitle}</h1>
        </div>
        <span className="ui-badge">{tasks.isPending ? '—' : rows.length}</span>
      </header>
      <TaskList
        messages={messages}
        rows={rows}
        locale={locale}
        view="list"
        onComplete={(row) => {
          runAction(
            api.completeTask(row.id, completeBody(), crypto.randomUUID()).then(() => {
              runAction(refreshTaskSurfaces(queryClient));
            }),
          );
        }}
      />
    </main>
  );
}

function viewDayFor(key: string): ViewDay | null {
  if (key === 'today' || key === 'tomorrow') {
    return key;
  }
  return null;
}

function parseView(value: string | null): BoardView {
  if (value === 'kanban' || value === 'timeline') {
    return value;
  }
  return 'list';
}

function smartLabel(messages: Messages, key: string): string {
  switch (key) {
    case 'today':
      return messages.smartToday;
    case 'tomorrow':
      return messages.smartTomorrow;
    case 'next_7_days':
      return messages.smartNext7;
    case 'all':
      return messages.smartAll;
    case 'inbox':
      return messages.smartInbox;
    case 'assigned_to_me':
      return messages.smartAssigned;
    case 'completed':
      return messages.smartCompleted;
    case 'trash':
      return messages.smartTrash;
    case 'no_date':
      return messages.smartNoDate;
    case 'recently_added':
      return messages.smartRecent;
    default:
      return key;
  }
}

function wipOf(column: object): number | null {
  if ('wip_limit' in column && typeof column.wip_limit === 'number') {
    return column.wip_limit;
  }
  return null;
}
