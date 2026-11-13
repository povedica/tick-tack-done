import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api';
import { runAction } from '../../components/run-action';
import { useMessages, type Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { completeBody } from '../tasks/complete-body';
import { refreshTaskSurfaces } from '../tasks/refresh';
import type { RowModel } from '../tasks/model';
import { TaskList } from '../tasks/TaskList';

function searchRow(item: unknown): RowModel | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const row = item as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.title !== 'string') {
    return null;
  }
  const priority =
    row.priority === 'low' || row.priority === 'medium' || row.priority === 'high'
      ? row.priority
      : 'none';
  return {
    id: row.id,
    title: row.title,
    priority,
    dueDate: typeof row.due_date === 'string' ? row.due_date : null,
    startDate: typeof row.start_date === 'string' ? row.start_date : null,
    durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
    isAllDay: row.is_all_day === true,
    timeZone: typeof row.time_zone === 'string' ? row.time_zone : 'UTC',
    projectId: typeof row.project_id === 'string' ? row.project_id : '',
    projectName: typeof row.project_name === 'string' ? row.project_name : '',
    columnId: null,
    tags: [],
    checklist: { completed: 0, total: 0 },
    kind: row.kind === 'note' ? 'note' : 'task',
    status: typeof row.status === 'string' ? row.status : 'active',
    repeat: typeof row.repeat_rule === 'string' && row.repeat_rule.length > 0,
    source: 'manual',
    content: '',
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
  };
}

export function SearchPage() {
  const messages = useMessages();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const search = useQuery({
    queryKey: ['search-page', q],
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
  });
  return (
    <section className="screen-page">
      <h1>{messages.searchTitle}</h1>
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const raw = data.get('q');
          const next = new URLSearchParams(params);
          next.set('q', typeof raw === 'string' ? raw : '');
          setParams(next, { replace: true });
        }}
      >
        <input
          className="search-input"
          name="q"
          defaultValue={q}
          placeholder={messages.searchPlaceholder}
          aria-label={messages.searchTitle}
        />
      </form>
      {search.data?.groups.length === 0 ? (
        <p>
          {messages.searchEmpty} {messages.searchRetryHint}
        </p>
      ) : null}
      {(search.data?.groups ?? []).map((group) => (
        <section key={group.type}>
          <h2>
            {group.type === 'task'
              ? group.items.length === 1
                ? messages.searchTaskSingular
                : messages.searchTaskCount.replace('{count}', String(group.items.length))
              : group.type === 'note'
                ? group.items.length === 1
                  ? messages.searchNoteSingular
                  : messages.searchNoteCount.replace('{count}', String(group.items.length))
                : groupLabel(messages, group.type)}
          </h2>
          {group.type === 'task' || group.type === 'note' ? (
            <TaskList
              messages={messages}
              rows={group.items.flatMap((item) => {
                const row = searchRow(item);
                return row === null ? [] : [row];
              })}
              locale={locale}
              view="list"
              hideCompleted={false}
              highlightQuery={q}
              onComplete={(row) => {
                const call =
                  row.status === 'completed'
                    ? api.uncompleteTask(row.id, crypto.randomUUID())
                    : api.completeTask(row.id, completeBody(), crypto.randomUUID());
                runAction(call.then(() => refreshTaskSurfaces(queryClient)));
              }}
            />
          ) : (
            <ul className="task-list">
              {group.items.map((item, index) => {
                const title =
                  typeof item.title === 'string'
                    ? item.title
                    : typeof item.name === 'string'
                      ? item.name
                      : '';
                const id = typeof item.id === 'string' ? item.id : String(index);
                const href = group.type === 'tag' ? `/tag/${id}` : `/list/${id}`;
                return (
                  <li key={id}>
                    <Link className="task-row" to={href}>
                      <span className="task-title">{highlight(title, q)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}

function groupLabel(messages: Messages, type: string): string {
  if (type === 'task') {
    return messages.entityTask;
  }
  if (type === 'list') {
    return messages.listsTitle;
  }
  if (type === 'tag') {
    return messages.tagsTitle;
  }
  return type;
}

function highlight(title: string, query: string): ReactNode {
  const needle = query.trim();
  const index = needle.length === 0 ? -1 : title.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return title;
  }
  return (
    <>
      {title.slice(0, index)}
      <mark>{title.slice(index, index + needle.length)}</mark>
      {title.slice(index + needle.length)}
    </>
  );
}
