import type { ViewPage } from '@reflexionia/sdk';
import { useState } from 'react';
import type { Messages } from '../../../i18n';

type GroupBy = ViewPage['group_by'];
type Sort = ViewPage['sort'];
type ViewTask = ViewPage['groups'][number]['tasks'][number];

const GROUPS: readonly GroupBy[] = ['none', 'section', 'date', 'tag', 'priority'];
const SORTS: readonly Sort[] = ['manual', 'date', 'priority', 'title', 'created'];

export function ListView({
  messages,
  page,
  groupBy,
  sort,
  onView,
}: {
  readonly messages: Messages;
  readonly page: ViewPage | undefined;
  readonly groupBy: GroupBy;
  readonly sort: Sort;
  readonly onView: (groupBy: GroupBy, sort: Sort) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = page?.groups ?? [];

  return (
    <section>
      <div className="view-controls">
        <label>
          {messages.groupBy}
          <select
            value={groupBy}
            onChange={(event) => {
              onView(asGroup(event.target.value), sort);
            }}
          >
            {GROUPS.map((value) => (
              <option key={value} value={value}>
                {groupText(messages, value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {messages.sortBy}
          <select
            value={sort}
            onChange={(event) => {
              onView(groupBy, asSort(event.target.value));
            }}
          >
            {SORTS.map((value) => (
              <option key={value} value={value}>
                {sortText(messages, value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {groups.length === 0 ? <p>{messages.taskEmpty}</p> : null}
      {groups.map((group) => (
        <section key={`${group.key}-${group.label}`}>
          <h2>{heading(messages, groupBy, group.key, group.label)}</h2>
          <ul className="task-list">
            {group.tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={openId === task.id ? 'selected' : undefined}
                  aria-expanded={openId === task.id}
                  onClick={() => {
                    setOpenId(openId === task.id ? null : task.id);
                  }}
                >
                  {task.title}
                </button>
                {openId === task.id ? <TaskDetail messages={messages} task={task} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

function TaskDetail({ messages, task }: { readonly messages: Messages; readonly task: ViewTask }) {
  return (
    <div className="detail">
      <p>
        {messages.listName}: {task.project_name}
      </p>
      <p>
        {messages.due}: {task.due_date ?? messages.noDateGroup}
      </p>
      <p>
        {messages.fieldPriority}: {priorityText(messages, task.priority)}
      </p>
      <p>
        {messages.tags}: {task.tags.map((tag) => tag.name).join(', ') || messages.noTag}
      </p>
      {task.content.length > 0 ? (
        <p>
          {messages.taskContent}: {task.content}
        </p>
      ) : null}
      {task.checklist.length > 0 ? (
        <>
          <p>{messages.checklist}</p>
          <ul>
            {task.checklist.map((item) => (
              <li key={item.id}>
                {item.title} (
                {item.status === 'completed' ? messages.statusCompleted : messages.statusActive})
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function heading(messages: Messages, groupBy: GroupBy, key: string, label: string): string {
  if (key === 'none') {
    if (groupBy === 'section') {
      return messages.noSection;
    }
    if (groupBy === 'date') {
      return messages.noDateGroup;
    }
    if (groupBy === 'tag') {
      return messages.noTag;
    }
  }
  if (key === 'all') {
    return messages.allTasks;
  }
  if (groupBy === 'priority') {
    return priorityText(messages, key);
  }
  return label;
}

function groupText(messages: Messages, value: GroupBy): string {
  switch (value) {
    case 'none':
      return messages.groupNone;
    case 'section':
      return messages.groupSection;
    case 'date':
      return messages.groupDate;
    case 'tag':
      return messages.groupTag;
    case 'priority':
      return messages.groupPriority;
    default: {
      const unreachable: never = value;
      return unreachable;
    }
  }
}

function sortText(messages: Messages, value: Sort): string {
  switch (value) {
    case 'manual':
      return messages.sortManual;
    case 'date':
      return messages.sortDate;
    case 'priority':
      return messages.sortPriority;
    case 'title':
      return messages.sortTitle;
    case 'created':
      return messages.sortCreated;
    default: {
      const unreachable: never = value;
      return unreachable;
    }
  }
}

export function priorityText(messages: Messages, value: string): string {
  switch (value) {
    case 'high':
      return messages.priorityHigh;
    case 'medium':
      return messages.priorityMedium;
    case 'low':
      return messages.priorityLow;
    default:
      return messages.priorityNone;
  }
}

function asGroup(value: string): GroupBy {
  return GROUPS.find((item) => item === value) ?? 'none';
}

function asSort(value: string): Sort {
  return SORTS.find((item) => item === value) ?? 'manual';
}
