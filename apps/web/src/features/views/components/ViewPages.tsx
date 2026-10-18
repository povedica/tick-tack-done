import type { ViewPage } from '@reflexionia/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { messagesFor } from '../../../i18n';
import { viewsApi } from '../api';
import { ListView } from './ListView';

export function SmartListViewPage() {
  const messages = messagesFor(navigator.language);
  const { key } = useParams();
  const listKey = key ?? 'today';
  const [groupBy, setGroupBy] = useState<ViewPage['group_by']>('none');
  const [sort, setSort] = useState<ViewPage['sort']>('manual');
  const page = useQuery({
    queryKey: ['smart-list-tasks', listKey, groupBy, sort],
    queryFn: () => viewsApi.smartListTasks(listKey, { groupBy, sort }),
    placeholderData: keepPreviousData,
  });

  return (
    <main className="screen">
      <p>
        <Link to="/today">{messages.backToday}</Link>
        {' · '}
        <Link to="/smart-lists">{messages.smartListsTitle}</Link>
      </p>
      <h1>{smartLabel(messages, listKey)}</h1>
      {page.isError ? <p className="error">{messages.previewFailed}</p> : null}
      <ListView
        messages={messages}
        page={page.data}
        groupBy={groupBy}
        sort={sort}
        onView={(nextGroup, nextSort) => {
          setGroupBy(nextGroup);
          setSort(nextSort);
        }}
      />
    </main>
  );
}

export function FilterViewPage() {
  const messages = messagesFor(navigator.language);
  const { id } = useParams();
  const filterId = id ?? '';
  const [groupBy, setGroupBy] = useState<ViewPage['group_by']>('none');
  const [sort, setSort] = useState<ViewPage['sort']>('manual');
  const page = useQuery({
    queryKey: ['filter-tasks', filterId, groupBy, sort],
    queryFn: () => viewsApi.filterTasks(filterId, { groupBy, sort }),
    enabled: filterId.length > 0,
    placeholderData: keepPreviousData,
  });

  return (
    <main className="screen">
      <p>
        <Link to="/today">{messages.backToday}</Link>
        {' · '}
        <Link to="/filters">{messages.filtersTitle}</Link>
      </p>
      <h1>{messages.filtersTitle}</h1>
      {page.isError ? <p className="error">{messages.filterFailed}</p> : null}
      <ListView
        messages={messages}
        page={page.data}
        groupBy={groupBy}
        sort={sort}
        onView={(nextGroup, nextSort) => {
          setGroupBy(nextGroup);
          setSort(nextSort);
        }}
      />
    </main>
  );
}

export function ProjectListPage() {
  const messages = messagesFor(navigator.language);
  const { id } = useParams();
  const projectId = id ?? '';
  const [groupBy, setGroupBy] = useState<ViewPage['group_by']>('section');
  const [sort, setSort] = useState<ViewPage['sort']>('manual');
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const project = projects.data?.items.find((item) => item.id === projectId);
  const page = useQuery({
    queryKey: ['project-tasks', projectId, groupBy, sort],
    queryFn: () =>
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
      ),
    enabled: projectId.length > 0,
    placeholderData: keepPreviousData,
  });

  return (
    <main className="screen">
      <p>
        <Link to="/today">{messages.backToday}</Link>
      </p>
      <h1>{project?.name ?? messages.listName}</h1>
      {page.isError ? <p className="error">{messages.previewFailed}</p> : null}
      <ListView
        messages={messages}
        page={page.data}
        groupBy={groupBy}
        sort={sort}
        onView={(nextGroup, nextSort) => {
          setGroupBy(nextGroup);
          setSort(nextSort);
        }}
      />
    </main>
  );
}

function smartLabel(messages: ReturnType<typeof messagesFor>, key: string): string {
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
