import type { TaskDetail as Detail } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { fill, useMessages } from '../../i18n';

const MAX_ATTACHMENT = 25 * 1024 * 1024;

export function TaskDetail({
  taskId,
  onClose,
}: {
  readonly taskId: string;
  readonly onClose: () => void;
}) {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [series, setSeries] = useState<string | null>(null);
  const [children, setChildren] = useState(false);
  const detail = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.taskDetail(taskId),
  });
  const reminders = useQuery({
    queryKey: ['reminders', taskId],
    queryFn: () => api.listReminders(taskId),
  });
  const attachments = useQuery({
    queryKey: ['attachments', taskId],
    queryFn: () => api.listAttachments(taskId),
  });
  const occurrences = useQuery({
    queryKey: ['occurrences', taskId],
    queryFn: () => api.occurrences(taskId),
    enabled: detail.data?.repeat_rule !== null && detail.data?.repeat_rule !== undefined,
  });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.listTags() });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    await queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['project-tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['smart-list-tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['filter-tasks'] });
  }

  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.patchTask>[1]) => api.patchTask(taskId, body),
    onSuccess: async () => {
      setSaved(true);
      setError(null);
      await refresh();
    },
    onError: () => {
      setError(messages.saveFailed);
    },
  });

  if (detail.isPending) {
    return (
      <aside className="detail-panel" aria-busy="true">
        <p>{messages.saving}</p>
      </aside>
    );
  }
  if (detail.isError) {
    return (
      <aside className="detail-panel">
        <Button onClick={onClose}>{messages.close}</Button>
        <p role="alert">{fill(messages.loadFailed, messages.taskTitle)}</p>
        <Button
          onClick={() => {
            void detail.refetch();
          }}
        >
          {messages.retry}
        </Button>
      </aside>
    );
  }

  const task = detail.data;
  const activeChildren = task.subtasks.filter((item) => item.status === 'active');

  return (
    <aside className="detail-panel" aria-label={messages.taskTitle}>
      <div className="page-toolbar">
        <Button onClick={onClose}>{messages.close}</Button>
        {saved ? <span role="status">{messages.saved}</span> : null}
        <Button
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/task/${task.id}`);
          }}
        >
          {messages.copyLink}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void api.duplicateTask(task.id, crypto.randomUUID()).then(refresh);
          }}
        >
          {messages.duplicate}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            void api.deleteTask(task.id).then(() => {
              onClose();
            });
          }}
        >
          {messages.batchDelete}
        </Button>
      </div>
      {error !== null ? <p role="alert">{error}</p> : null}
      <label className="task-check-hit">
        <input
          type="checkbox"
          className={`task-check prio-${task.priority}`}
          checked={task.status === 'completed'}
          aria-label={fill(messages.completeLabel, task.title)}
          onChange={() => {
            if (task.status === 'completed') {
              void api.uncompleteTask(task.id, crypto.randomUUID()).then(refresh);
              return;
            }
            if (activeChildren.length > 0) {
              setChildren(true);
              return;
            }
            void api.completeTask(task.id, {}, crypto.randomUUID()).then(refresh);
          }}
        />
      </label>
      <textarea
        className="detail-title"
        aria-label={messages.titlePreview}
        defaultValue={task.title}
        key={task.title}
        onBlur={(event) => {
          if (event.target.value.trim().length > 0 && event.target.value !== task.title) {
            save.mutate({ title: event.target.value });
          }
        }}
      />
      <div className="page-toolbar">
        <label>
          {messages.prioritySet}
          <select
            value={task.priority}
            onChange={(event) => {
              const priority = event.target.value as Detail['priority'];
              save.mutate({ priority });
            }}
          >
            <option value="high">{messages.priorityHigh}</option>
            <option value="medium">{messages.priorityMedium}</option>
            <option value="low">{messages.priorityLow}</option>
            <option value="none">{messages.priorityNone}</option>
          </select>
        </label>
        <label>
          {messages.dateSet}
          <input
            type="datetime-local"
            value={toLocal(task.due_date)}
            onChange={(event) => {
              const next =
                event.target.value.length === 0 ? null : new Date(event.target.value).toISOString();
              if (task.repeat_rule !== null && next !== null) {
                setSeries(next);
                return;
              }
              save.mutate({ due_date: next });
            }}
          />
        </label>
        <label>
          {messages.listMove}
          <select
            value={task.project_id}
            onChange={(event) => {
              void api.moveTask(task.id, event.target.value).then(refresh);
            }}
          >
            {(projects.data?.items ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {messages.tagAdd}
        <select
          value=""
          onChange={(event) => {
            const id = event.target.value;
            if (id.length === 0 || task.tag_ids.includes(id)) {
              return;
            }
            save.mutate({ tag_ids: [...task.tag_ids, id] });
          }}
        >
          <option value="">{messages.tagAdd}</option>
          {(tags.data?.items ?? []).map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <p className="task-meta">
        {task.tag_ids.map((id) => (
          <button
            key={id}
            type="button"
            className="ui-tag"
            onClick={() => {
              save.mutate({ tag_ids: task.tag_ids.filter((item) => item !== id) });
            }}
          >
            {(tags.data?.items ?? []).find((tag) => tag.id === id)?.name ?? id} ×
          </button>
        ))}
      </p>
      <div className="page-toolbar" role="tablist">
        <span>{messages.contentLabel}</span>
      </div>
      <textarea
        aria-label={messages.contentLabel}
        defaultValue={task.content}
        key={`${task.id}-${task.updated_at}`}
        rows={6}
        onBlur={(event) => {
          if (event.target.value !== task.content) {
            save.mutate({ content: event.target.value });
          }
        }}
      />
      <section>
        <h3>{messages.checklist}</h3>
        <p>
          {task.checklist_progress.completed}/{task.checklist_progress.total}
        </p>
        <ul>
          {task.items.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.status === 'completed'}
                  onChange={() => {
                    if (item.status !== 'completed') {
                      void api.completeChecklistItem(task.id, item.id).then(refresh);
                    }
                  }}
                />
                {item.title}
              </label>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const raw = data.get('item');
            const title = (typeof raw === 'string' ? raw : '').trim();
            if (title.length === 0) {
              return;
            }
            void api.createChecklistItem(task.id, title, crypto.randomUUID()).then(refresh);
            event.currentTarget.reset();
          }}
        >
          <input
            name="item"
            aria-label={messages.checklistAdd}
            placeholder={messages.checklistAdd}
          />
        </form>
      </section>
      <section>
        <h3>{messages.subtasks}</h3>
        <ul>
          {task.subtasks.map((child) => (
            <li key={child.id}>
              <Link to={`?task=${child.id}`}>{child.title}</Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{messages.reminders}</h3>
        <ul>
          {(reminders.data ?? []).map((reminder) => (
            <li key={reminder.id}>
              {reminder.trigger} · {reminder.channel}
              <Button
                variant="ghost"
                onClick={() => {
                  void api
                    .deleteReminder(task.id, reminder.id)
                    .then(() => queryClient.invalidateQueries({ queryKey: ['reminders', taskId] }));
                }}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
        <Button
          onClick={() => {
            void api
              .createReminder(
                task.id,
                { trigger: '-PT30M', type: 'relative', channel: 'push' },
                crypto.randomUUID(),
              )
              .then(() => queryClient.invalidateQueries({ queryKey: ['reminders', taskId] }));
          }}
        >
          {messages.addReminder}
        </Button>
      </section>
      <section>
        <h3>{messages.recurrence}</h3>
        <p>{task.repeat_rule ?? messages.noRecurrence}</p>
        <div className="page-toolbar">
          <Button
            onClick={() => {
              save.mutate({ repeat_rule: 'FREQ=DAILY', repeat_from: 'due_date' });
            }}
          >
            {messages.repeatDaily}
          </Button>
          <Button
            onClick={() => {
              save.mutate({ repeat_rule: 'FREQ=WEEKLY', repeat_from: 'due_date' });
            }}
          >
            {messages.repeatWeekly}
          </Button>
          <Button
            onClick={() => {
              save.mutate({
                repeat_rule: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=6',
                repeat_from: 'due_date',
              });
            }}
          >
            {messages.repeatMonthly}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              save.mutate({ repeat_rule: null });
            }}
          >
            {messages.noRecurrence}
          </Button>
        </div>
        <ul>
          {(occurrences.data?.occurrences ?? []).slice(0, 5).map((item) => (
            <li key={item.due_date}>{item.due_date}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{messages.attachments}</h3>
        <ul>
          {(attachments.data?.items ?? []).map((file) => (
            <li key={file.id}>
              {file.file_name} · {file.byte_size}
            </li>
          ))}
        </ul>
        <input
          type="file"
          aria-label={messages.upload}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file === undefined) {
              return;
            }
            if (file.size > MAX_ATTACHMENT) {
              setError(messages.tooLarge);
              return;
            }
            void api
              .uploadAttachment(task.id, file, file.name)
              .then(() => queryClient.invalidateQueries({ queryKey: ['attachments', taskId] }));
          }}
        />
      </section>
      <section>
        <h3>{messages.activity}</h3>
        {task.activity.length === 0 ? <p>{messages.noActivity}</p> : null}
        <ul>
          {task.activity.map((entry) => (
            <li key={entry.id}>
              {entry.actor_id === me.data?.id ? messages.actorYou : messages.actorOther} ·{' '}
              {entry.action} · {entry.created_at}
            </li>
          ))}
        </ul>
      </section>
      <div className="page-toolbar">
        <Button
          onClick={() => {
            save.mutate({ kind: task.kind === 'note' ? 'task' : 'note' });
          }}
        >
          {task.kind === 'note' ? messages.convertTask : messages.convertNote}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void api.snoozeTask(task.id, 'tomorrow').then(refresh);
          }}
        >
          {messages.navTomorrow}
        </Button>
      </div>
      {children ? (
        <div className="ui-modal" role="dialog" aria-label={messages.completeChildren}>
          <p>{messages.completeChildren}</p>
          <Button
            onClick={() => {
              setChildren(false);
              void api
                .completeTask(task.id, { complete_children: 'complete' }, crypto.randomUUID())
                .then(refresh);
            }}
          >
            {messages.completeChildren}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setChildren(false);
              void api
                .completeTask(task.id, { complete_children: 'leave' }, crypto.randomUUID())
                .then(refresh);
            }}
          >
            {messages.leaveChildren}
          </Button>
        </div>
      ) : null}
      {series !== null ? (
        <div className="ui-modal" role="dialog" aria-label={messages.seriesPrompt}>
          <p>{messages.seriesPrompt}</p>
          <Button
            onClick={() => {
              const due = series;
              setSeries(null);
              void api.detachOccurrence(task.id, due).then(refresh);
            }}
          >
            {messages.thisOccurrence}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const due = series;
              setSeries(null);
              save.mutate({ due_date: due });
            }}
          >
            {messages.wholeSeries}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function toLocal(value: string | null): string {
  if (value === null) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
