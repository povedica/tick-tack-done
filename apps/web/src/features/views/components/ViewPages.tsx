import type { ViewPage } from '@reflexionia/sdk';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../../../api';
import { Button } from '../../../components/ui';
import { useMessages, type Messages } from '../../../i18n';
import { newMutation, runOrQueue } from '../../offline/client';
import { rowsFromView, smartApiKey } from '../../tasks/model';
import { TaskList } from '../../tasks/TaskList';
import { viewsApi } from '../api';

type GroupBy = ViewPage['group_by'];
type Sort = ViewPage['sort'];
type BoardView = 'list' | 'kanban' | 'timeline';

export function SmartListViewPage() {
  const messages = useMessages();
  const { key } = useParams();
  const listKey = smartApiKey(key ?? 'today');
  return (
    <Board
      messages={messages}
      title={smartLabel(messages, listKey)}
      queryKey={['smart-list-tasks', listKey]}
      load={(groupBy, sort) => viewsApi.smartListTasks(listKey, { groupBy, sort })}
      notice={listKey === 'assigned_to_me' ? messages.assignedEmpty : undefined}
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
      load={(groupBy, sort) => viewsApi.filterTasks(filterId, { groupBy, sort })}
      enabled={filterId.length > 0}
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
  return (
    <Board
      messages={messages}
      title={project?.name ?? messages.listName}
      queryKey={['project-tasks', projectId]}
      createProjectId={projectId}
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
                  conditions: [
                    { field: 'list', op: 'in', value: [projectId] },
                    { field: 'status', op: 'eq', value: 'active' },
                  ],
                },
              ],
            },
          },
          { groupBy, sort },
        )
      }
      enabled={projectId.length > 0}
      note={project?.kind === 'NOTE'}
    />
  );
}

function Board({
  messages,
  title,
  queryKey,
  load,
  enabled = true,
  createProjectId,
  columns,
  notice,
  note = false,
}: {
  readonly messages: Messages;
  readonly title: string;
  readonly queryKey: readonly unknown[];
  readonly load: (groupBy: GroupBy, sort: Sort) => Promise<ViewPage>;
  readonly enabled?: boolean | undefined;
  readonly createProjectId?: string | undefined;
  readonly columns?: readonly { readonly id: string; readonly name: string }[] | undefined;
  readonly notice?: string | undefined;
  readonly note?: boolean | undefined;
}) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [groupBy, setGroupBy] = useState<GroupBy>('section');
  const [sort, setSort] = useState<Sort>('manual');
  const view = parseView(params.get('view'));
  const page = useQuery({
    queryKey: [...queryKey, groupBy, sort],
    queryFn: () => load(groupBy, sort),
    enabled,
    placeholderData: keepPreviousData,
  });
  const rows = rowsFromView(page.data).filter((row) => (note ? row.kind === 'note' : true));

  function chooseView(next: BoardView): void {
    const query = new URLSearchParams(params);
    query.set('view', next);
    setParams(query, { replace: true });
  }

  return (
    <main className="screen-page">
      <p>
        <Link to="/today">{messages.backToday}</Link>
      </p>
      <header className="page-toolbar">
        <h1>{title}</h1>
        <span className="ui-badge">{page.data?.count ?? rows.length}</span>
        <Button
          onClick={() => {
            chooseView('list');
          }}
        >
          {messages.viewList}
        </Button>
        <Button
          onClick={() => {
            chooseView('kanban');
          }}
        >
          {messages.viewKanban}
        </Button>
        <Button
          onClick={() => {
            chooseView('timeline');
          }}
        >
          {messages.viewTimeline}
        </Button>
      </header>
      {notice !== undefined ? <p>{notice}</p> : null}
      {note && rows.length === 0 ? <p>{messages.noteEmpty}</p> : null}
      <div className="page-toolbar">
        <label>
          {messages.groupBy}
          <select
            value={groupBy}
            onChange={(event) => {
              setGroupBy(event.target.value as GroupBy);
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
              setSort(event.target.value as Sort);
            }}
          >
            <option value="manual">{messages.sortManual}</option>
            <option value="date">{messages.sortDate}</option>
            <option value="priority">{messages.sortPriority}</option>
            <option value="title">{messages.sortTitle}</option>
            <option value="created">{messages.sortCreated}</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            window.print();
          }}
        >
          {messages.printView}
        </Button>
      </div>
      {page.isError ? <p className="error">{messages.previewFailed}</p> : null}
      <TaskList
        messages={messages}
        rows={rows}
        locale={navigator.language}
        view={view}
        columns={columns}
        createProjectId={note ? undefined : createProjectId}
        onComplete={(row) => {
          void runOrQueue(newMutation('complete', row.id, {}), (key) =>
            api.completeTask(row.id, {}, key),
          ).then(() => {
            void queryClient.invalidateQueries({ queryKey: [...queryKey] });
          });
        }}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: [...queryKey] });
        }}
      />
    </main>
  );
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
