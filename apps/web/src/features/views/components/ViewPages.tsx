import { captureSettings } from '@reflexionia/domain';
import { runAction } from '../../../components/run-action';
import type { ViewPage } from '@reflexionia/sdk';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Funnel } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../../../api';
import { completeBody } from '../../tasks/complete-body';
import { Button, EmptyState } from '../../../components/ui';
import { SortMenu } from '../../../components/SortMenu';
import { ViewMenu } from '../../../components/ViewMenu';
import { fill, useMessages, type Messages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { SidebarFoldButton } from '../../../shell/SidebarFoldButton';
import { MatrixBoard, MatrixViewToggle } from '../../matrix/MatrixBoard';
import { readMatrixLayout, writeMatrixLayout } from '../../matrix/layout';
import { matrixScopeKey, type MatrixScope } from '../../matrix/scope';
import type { MatrixLayout } from '../../matrix/layout';
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
import { TaskList, withLinkCounts, loadVisibleLinkCounts } from '../../tasks/TaskList';
import type { ViewDay } from '../../capture/quick-add';
import {
  patchViewPrefs,
  readViewPrefs,
  type StoredBoardView,
  type ViewGroupBy,
  type ViewSort,
} from '../view-prefs';
import type { CaptureDraft } from '../../capture/notice';
import { viewsApi } from '../api';
import { captureSeed } from '../capture-seed';
import { duplicateFilter, pinFilter } from '../filter-commands';
import { FilterMenuButtons } from '../filter-menu-items';
import { useFilterUi } from '../filter-ui';
import { filterFolderLabels, filterTagLabels, summarizeRules } from '../summarize';
import { SummaryChips } from './SummaryChip';
import '../filters.css';
import { WorkHoursLine } from '../../settings/WorkHoursLine';

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
      load={(groupBy, sort) =>
        collectSmartList(listKey, {
          groupBy,
          sort,
          ...(listKey === 'today' || listKey === 'next_7_days' ? { context: 'auto' as const } : {}),
        })
      }
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
  const queryClient = useQueryClient();
  const { id } = useParams();
  const filterId = id ?? '';
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => viewsApi.listFilters() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const filter = filters.data?.items.find((item) => item.id === filterId);
  useEffect(() => {
    if (filter === undefined) {
      return;
    }
    document.getElementById('filter-view-title')?.focus();
  }, [filter]);
  if (filters.isSuccess && filterId.length > 0 && filter === undefined) {
    return (
      <main className="screen-page">
        <h1>{messages.notFoundTitle}</h1>
        <p>{messages.notFoundBody}</p>
        <Link to="/filters">{messages.filterSeeFilters}</Link>
      </main>
    );
  }
  const labels = filterTagLabels(
    filter !== undefined && 'tag_labels' in filter ? filter.tag_labels : undefined,
  );
  const folders = filterFolderLabels(
    filter !== undefined && 'folder_labels' in filter ? filter.folder_labels : undefined,
  );
  const listNames = new Map(
    (projects.data?.items ?? []).map((project) => [project.id, project.name]),
  );
  const chips =
    filter === undefined
      ? []
      : summarizeRules(filter.rules, {
          tagLabels: labels,
          folderLabels: folders,
          listNames,
          text: {
            today: messages.dateToday,
            tomorrow: messages.dateTomorrow,
            next7: messages.dateNext7,
            overdue: messages.dateOverdue,
            noDate: messages.dateNoDate,
            between: messages.filterDateBetween,
            priorityHigh: messages.filterPriorityHigh,
            priorityMedium: messages.filterPriorityMedium,
            priorityLow: messages.filterPriorityLow,
            priorityAny: messages.filterPriorityAny,
            statusActive: messages.statusActive,
            statusCompleted: messages.statusCompleted,
            deletedTag: messages.filterDeletedTag,
            deletedFolder: messages.filterDeletedFolder,
          },
        });
  const summary = chips.map((chip) => chip.text).join(' · ');
  const seed = filter === undefined ? null : captureSeed(filter.rules);
  const capture: CaptureDraft | undefined =
    seed === null || (seed.tagIds.length === 0 && seed.projectId === undefined)
      ? undefined
      : {
          text: '',
          ...(seed.tagIds.length === 0 ? {} : { tags: [...seed.tagIds] }),
          ...(seed.projectId === undefined ? {} : { project: seed.projectId }),
        };
  return (
    <Board
      messages={messages}
      title={filter?.name ?? messages.filtersTitle}
      titleId="filter-view-title"
      titleIcon={
        <Funnel size={20} aria-hidden="true" style={{ color: filter?.color ?? 'var(--ink-2)' }} />
      }
      belowTitle={
        <div className="filter-view-rules">
          <SummaryChips
            chips={chips}
            max={4}
            more={(count) => messages.filterMoreChips.replace('{count}', String(count))}
          />
        </div>
      }
      {...(filter === undefined
        ? {}
        : {
            menuExtra: (
              <FilterMenuButtons
                messages={messages}
                pinned={filter.pinned}
                onSelect={(id) => {
                  if (id === 'conditions') {
                    useFilterUi.getState().openEdit(filter.id, 'conditions');
                  } else if (id === 'name') {
                    useFilterUi.getState().openEdit(filter.id, 'name');
                  } else if (id === 'pin') {
                    pinFilter(
                      queryClient,
                      filter,
                      messages.filterPinnedLive,
                      messages.filterUnpinnedLive,
                    );
                  } else if (id === 'duplicate') {
                    duplicateFilter(queryClient, filter, messages.filterDuplicated);
                  } else {
                    useFilterUi.getState().askDelete({ id: filter.id, name: filter.name });
                  }
                }}
              />
            ),
          })}
      {...(capture === undefined ? {} : { captureDraft: capture })}
      {...(seed?.projectId === undefined ? {} : { createProjectId: seed.projectId })}
      {...(seed?.viewDay == null ? {} : { createViewDay: seed.viewDay })}
      {...(summary.length === 0
        ? {}
        : { capturePlaceholder: fill(messages.filterCaptureWith, summary) })}
      queryKey={['filter-tasks', filterId]}
      load={(groupBy, sort) => collectFilterTasks(filterId, { groupBy, sort })}
      enabled={filterId.length > 0 && filter !== undefined}
      viewKey={`filter:${filterId}`}
      empty={
        <EmptyState
          title={messages.filterNoMatchTitle}
          body={messages.filterNoMatchBody}
          action={
            <Button
              onClick={() => {
                useFilterUi.getState().openEdit(filterId);
              }}
            >
              {messages.filterEditConditions}
            </Button>
          }
        />
      }
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
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const foreign =
    project !== undefined && me.data?.id !== undefined && project.owner_id !== me.data.id;
  const role = foreign ? shareRole(project) : 'owner';
  const notice =
    role === 'read' ? messages.listReadOnly : role === 'comment' ? messages.listCommentOnly : null;
  return (
    <>
      {notice !== null ? (
        <p className="screen-note" role="status">
          {notice}
        </p>
      ) : null}
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
    </>
  );
}

function shareRole(project: { owner_id: string }): 'read' | 'comment' | 'write' {
  const role = (project as { role?: unknown }).role;
  if (role === 'comment' || role === 'write' || role === 'read') {
    return role;
  }
  return 'read';
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
  empty,
  titleIcon,
  belowTitle,
  menuExtra,
  titleId,
  captureDraft,
  capturePlaceholder,
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
  readonly empty?: ReactNode;
  readonly titleIcon?: ReactNode;
  readonly belowTitle?: ReactNode;
  readonly menuExtra?: ReactNode;
  readonly titleId?: string;
  readonly captureDraft?: CaptureDraft | undefined;
  readonly capturePlaceholder?: string | undefined;
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
  const remotePrefs = useQuery({
    queryKey: ['view-preferences', viewKey],
    queryFn: () => api.getViewPreferences(viewKey),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    const remote = remotePrefs.data?.preferences;
    if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
      const next = patchViewPrefs(viewKey, remote);
      setPrefs(next);
    }
  }, [remotePrefs.data, viewKey]);
  const groupBy: GroupBy = prefs.group;
  const sort: Sort = prefs.sort;
  const details = prefs.showDetails;
  const hideCompleted = prefs.hideCompleted;
  const matrixScope: MatrixScope | undefined =
    matrixListId !== undefined
      ? { kind: 'list', listId: matrixListId }
      : createViewDay === 'tomorrow'
        ? { kind: 'tomorrow' }
        : createViewDay === 'today'
          ? { kind: 'today' }
          : undefined;
  const scopeKey = matrixScope ? matrixScopeKey(matrixScope) : viewKey;
  const [matrixLayout, setMatrixLayout] = useState<MatrixLayout>(() => readMatrixLayout(scopeKey));
  useEffect(() => {
    setMatrixLayout(readMatrixLayout(scopeKey));
  }, [scopeKey]);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const preferredList = projects.data?.items.find(
    (project) =>
      !project.closed &&
      project.id === captureSettings(account.data?.capture_settings).default_list_id,
  );
  const inboxId = projects.data?.items.find((project) => project.is_inbox)?.id;
  const view = parseView(params.get('view') ?? prefs.view);
  useEffect(() => {
    if (view === 'kanban' && params.get('view') !== 'kanban') {
      const query = new URLSearchParams(params);
      query.set('view', 'kanban');
      setParams(query, { replace: true });
    }
  }, [view, params, setParams]);
  const page = useQuery({
    queryKey: [...queryKey, groupBy, sort],
    queryFn: () => load(groupBy, sort),
    enabled,
    placeholderData: keepPreviousData,
  });
  // ViewPage omits link counts; GET /tasks supplies them for this mounted project only.
  const visibleLinkRows = (page.data?.groups.flatMap((group) => group.tasks) ?? [])
    .filter(
      (task) =>
        (!hideCompleted || task.status !== 'completed') &&
        task.status !== 'archived' &&
        (note || task.kind === 'task'),
    )
    .map((task) => ({ id: task.id, status: task.status }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const visibleLinkStates = [...new Set(visibleLinkRows.map((row) => row.status))];
  const projectLinks = useQuery({
    queryKey: ['project-tasks', createProjectId, 'link-counts', visibleLinkRows],
    queryFn: async ({ signal }) =>
      (
        await Promise.all(
          visibleLinkStates.map((status) =>
            loadVisibleLinkCounts(
              (query) => api.listTasks(query),
              createProjectId ?? '',
              visibleLinkRows.filter((row) => row.status === status).map((row) => row.id),
              signal,
              status,
            ),
          ),
        )
      ).flat(),
    enabled:
      enabled &&
      createProjectId !== undefined &&
      (view === 'list' || view === 'kanban') &&
      matrixLayout !== 'matrix' &&
      visibleLinkRows.length > 0,
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
  });
  const showNotes = note || viewKey.startsWith('smart:');
  const canCapture = !note && viewKey !== 'smart:trash' && viewKey !== 'smart:completed';
  const rows = withLinkCounts(
    rowsFromView(page.data),
    projectLinks.data ?? page.data?.groups.flatMap((group) => group.tasks) ?? [],
  )
    .filter((row) => (showNotes ? true : row.kind === 'task'))
    .filter((row) => row.status !== 'archived')
    .map((row) =>
      inboxId !== undefined && row.projectId === inboxId
        ? { ...row, projectName: messages.smartInbox }
        : row,
    );

  function savePrefs(patch: Partial<typeof prefs>): void {
    const next = patchViewPrefs(viewKey, patch);
    setPrefs(next);
    runAction(
      api
        .putViewPreferences(viewKey, { ...next, syncAcrossDevices: true })
        .then(() => queryClient.invalidateQueries({ queryKey: ['view-preferences', viewKey] })),
    );
  }

  function chooseView(next: BoardView): void {
    setMatrixLayout(next === 'kanban' ? 'kanban' : 'list');
    writeMatrixLayout(scopeKey, next === 'kanban' ? 'kanban' : 'list');
    savePrefs({ view: next });
    const query = new URLSearchParams(params);
    query.set('view', next);
    setParams(query, { replace: true });
  }

  const taskCount = page.isPending
    ? '—'
    : (() => {
        const count = page.data?.count ?? rows.length;
        return count === 1
          ? messages.taskCountOne
          : messages.taskCount.replace('{count}', String(count));
      })();
  const taskCountBadge = <span className="ui-badge">{taskCount}</span>;
  return (
    <main className="screen-page">
      <header className="today-header">
        <div className="page-title">
          <SidebarFoldButton />
          {titleIcon}
          <h1
            id={titleId}
            className={titleId === undefined ? undefined : 'filter-view-title'}
            tabIndex={titleId === undefined ? undefined : -1}
          >
            {title}
          </h1>
        </div>
        {belowTitle === undefined ? null : (
          <div className="filter-view-meta">
            {belowTitle}
            {taskCountBadge}
          </div>
        )}
        {viewKey === 'smart:today' || viewKey === 'smart:next_7_days' ? <WorkHoursLine /> : null}
        <div className="page-actions">
          {headerActions}
          <MatrixViewToggle
            showMatrix={flags.matrix && matrixScope !== undefined}
            value={
              matrixLayout === 'matrix' && matrixScope !== undefined
                ? 'matrix'
                : view === 'kanban'
                  ? 'kanban'
                  : 'list'
            }
            onChange={(next) => {
              if (next === 'matrix') {
                writeMatrixLayout(scopeKey, next);
                setMatrixLayout(next);
              } else chooseView(next);
            }}
          />
          {belowTitle === undefined ? taskCountBadge : null}
          <SortMenu messages={messages}>
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
          </SortMenu>
          <ViewMenu
            messages={messages}
            view={view}
            onView={chooseView}
            matrixSelected={matrixLayout === 'matrix' && matrixScope !== undefined}
            onMatrix={
              flags.matrix && matrixScope !== undefined
                ? () => {
                    writeMatrixLayout(scopeKey, 'matrix');
                    setMatrixLayout('matrix');
                  }
                : undefined
            }
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
            {...(menuExtra === undefined ? {} : { extraItems: menuExtra })}
          />
        </div>
      </header>
      {notice !== undefined ? <p>{notice}</p> : null}
      {empty !== undefined && page.isSuccess && rows.length === 0 ? empty : null}
      {note && rows.length === 0 ? <p>{messages.noteEmpty}</p> : null}
      {page.isError ? <p className="error">{messages.previewFailed}</p> : null}
      {flags.matrix && matrixScope !== undefined && matrixLayout === 'matrix' ? (
        <MatrixBoard scope={matrixScope} embedded />
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
          createProjectId={
            canCapture ? (createProjectId ?? preferredList?.id ?? inboxId) : undefined
          }
          createViewDay={createViewDay}
          {...(captureDraft === undefined ? {} : { captureDraft })}
          {...(capturePlaceholder === undefined ? {} : { capturePlaceholder })}
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
  const rows = withLinkCounts(
    (tasks.data?.items ?? []).map((task) => rowFromTask(task, names, tagNames)),
    tasks.data?.items ?? [],
  );
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
  const rows = withLinkCounts(
    (tasks.data ?? []).map((task) => rowFromTask(task, names, tagNames)),
    tasks.data ?? [],
  );
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
