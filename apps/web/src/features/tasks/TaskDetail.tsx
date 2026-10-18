import type { TaskDetail as Detail } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Flag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { PriorityCheck } from '../../components/PriorityCheck';
import { Button } from '../../components/ui';
import { fill, useMessages } from '../../i18n';
import { newMutation, runOrQueue } from '../offline/client';

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
  const serverDue = detail.data?.due_date ?? null;
  const [dueDraft, setDueDraft] = useState('');
  useEffect(() => {
    setDueDraft(toLocal(serverDue));
  }, [detail.data?.id, serverDue]);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    await queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['project-tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['smart-list-tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['filter-tasks'] });
  }

  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.patchTask>[1]) =>
      runOrQueue(newMutation('update', taskId, { ...body }), () => api.patchTask(taskId, body)),
    onSuccess: async (outcome) => {
      setSaved(true);
      setError(null);
      if (!outcome.queued) {
        await refresh();
      }
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

  const progress =
    task.checklist_progress.total === 0
      ? 0
      : Math.round((task.checklist_progress.completed / task.checklist_progress.total) * 100);

  return (
    <aside className="detail-panel" aria-label={messages.taskTitle}>
      <header className="detail-head">
        <button type="button" className="icon-button" aria-label={messages.close} onClick={onClose}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <PriorityCheck
          priority={task.priority}
          label={fill(messages.completeLabel, task.title)}
          checked={task.status === 'completed'}
          onChange={() => {
            if (task.status === 'completed') {
              void api.uncompleteTask(task.id, crypto.randomUUID()).then(refresh);
              return;
            }
            if (activeChildren.length > 0) {
              setChildren(true);
              return;
            }
            void (async () => {
              const outcome = await runOrQueue(newMutation('complete', task.id, {}), (key) =>
                api.completeTask(task.id, {}, key),
              );
              if (!outcome.queued) {
                await refresh();
              }
            })();
          }}
        />
        <span className="detail-head-spacer" />
        <button
          type="button"
          className="icon-button"
          aria-label={messages.addReminder}
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
          <Bell size={20} aria-hidden="true" />
        </button>
        <label className="icon-button" aria-label={messages.prioritySet}>
          <Flag size={20} color={priorityColor(task.priority)} aria-hidden="true" />
          <select
            className="sr-only"
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
        <div className="detail-progress" aria-hidden="true">
          <span style={{ width: `${String(progress)}%` }} />
        </div>
      </header>
      <div className="detail-body">
        <div className="page-toolbar">
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
            {messages.dateSet}
            <input
              type="datetime-local"
              value={dueDraft}
              onChange={(event) => {
                setDueDraft(event.target.value);
              }}
              onBlur={() => {
                if (dueDraft === toLocal(task.due_date)) {
                  return;
                }
                const next = dueDraft.length === 0 ? null : new Date(dueDraft).toISOString();
                if (next !== null && Number.isNaN(new Date(dueDraft).getTime())) {
                  setDueDraft(toLocal(task.due_date));
                  return;
                }
                if (task.repeat_rule !== null && next !== null) {
                  setSeries(next);
                  return;
                }
                save.mutate({ due_date: next });
              }}
            />
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
          className="detail-content"
          aria-label={messages.contentLabel}
          placeholder={messages.contentHint}
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
        {task.subtasks.length > 0 ? (
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
        ) : null}
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
                      .then(() =>
                        queryClient.invalidateQueries({ queryKey: ['reminders', taskId] }),
                      );
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
          <label className="file-button">
            {messages.upload}
            <input
              className="sr-only"
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
          </label>
        </section>
        <section>
          <h3>{messages.activity}</h3>
          {task.activity.length === 0 ? <p>{messages.noActivity}</p> : null}
          <ul>
            {task.activity.map((entry) => (
              <li key={entry.id}>
                {entry.actor_id === me.data?.id ? messages.actorYou : messages.actorOther} ·{' '}
                {entry.action} · {relativeTime(entry.created_at, navigator.language)}
              </li>
            ))}
          </ul>
        </section>
        <div className="detail-actions">
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
      </div>
      <footer className="detail-foot">
        <label>
          {messages.listMove}
          <select
            aria-label={messages.listMove}
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
      </footer>
      {children ? (
        <div className="ui-modal" role="dialog" aria-label={messages.completeChildren}>
          <p>{messages.completeChildren}</p>
          <Button
            onClick={() => {
              setChildren(false);
              void (async () => {
                const outcome = await runOrQueue(
                  newMutation('complete', task.id, { complete_children: 'complete' }),
                  (key) => api.completeTask(task.id, { complete_children: 'complete' }, key),
                );
                if (!outcome.queued) {
                  await refresh();
                }
              })();
            }}
          >
            {messages.completeChildren}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setChildren(false);
              void (async () => {
                const outcome = await runOrQueue(
                  newMutation('complete', task.id, { complete_children: 'leave' }),
                  (key) => api.completeTask(task.id, { complete_children: 'leave' }, key),
                );
                if (!outcome.queued) {
                  await refresh();
                }
              })();
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

function priorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'var(--prio-high)';
    case 'medium':
      return 'var(--prio-medium)';
    case 'low':
      return 'var(--prio-low)';
    default:
      return 'var(--prio-none)';
  }
}

function relativeTime(iso: string, locale: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta)) {
    return iso;
  }
  const minutes = Math.round(delta / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) {
    return format.format(-hours, 'hour');
  }
  return format.format(-Math.round(hours / 24), 'day');
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
