import { ApiError, type CreateTaskBody, type TaskDetail as Detail } from '@reflexionia/sdk';
import { describeRepeatRule, parseTrigger } from '@reflexionia/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api';
import { DatePopover, type DateDraft } from '../../components/DatePopover';
import { PriorityMenu } from '../../components/PriorityMenu';
import { TagPicker } from '../../components/TagPicker';
import { Button } from '../../components/ui';
import { useActionToast } from '../../components/action-toast';
import { fill, useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { formatDueChip, type TodayTask } from '../today/groups';
import { PIN_KEY, readPins, togglePin } from '../today/pins';
import { newMutation, runOrQueue } from '../offline/client';
import { collectTags } from './collect';
import { activityText, relativeTime } from './detail-model';
import { DetailBody } from './DetailBody';
import { DetailFooter } from './DetailFooter';
import { DetailHeader } from './DetailHeader';
import { DetailMenu } from './DetailMenu';
import { refreshTaskSurfaces } from './refresh';

const MAX_ATTACHMENT = 25 * 1024 * 1024;
const TEMPLATE_KEY = 'tick-tack-done.templates';

export function TaskDetail({
  taskId,
  onClose,
}: {
  readonly taskId: string;
  readonly onClose: () => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [, setParams] = useSearchParams();
  const showToast = useActionToast((state) => state.show);
  const [saved, setSaved] = useState(false);
  const [series, setSeries] = useState<string | null>(null);
  const [children, setChildren] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [pins, setPins] = useState<readonly string[]>(() =>
    readPins(localStorage.getItem(PIN_KEY)),
  );
  const fileRef = useRef<HTMLInputElement>(null);
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
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    await refreshTaskSurfaces(queryClient);
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
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : messages.saveFailed);
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
  const chip = formatDueChip(task.due_date, task.time_zone, task.is_all_day, new Date(), locale, {
    empty: messages.noDate,
    today: messages.dateToday,
  });
  const reminder = reminders.data?.[0];
  const repeatText =
    task.repeat_rule === null ? null : (describeRepeatRule(task.repeat_rule) ?? task.repeat_rule);
  const projectName =
    (projects.data?.items ?? []).find((project) => project.id === task.project_id)?.name ?? '';
  const tagRows = task.tag_ids.flatMap((id) => {
    const tag = (tags.data?.items ?? []).find((item) => item.id === id);
    return tag === undefined ? [] : [{ id, name: tag.name, color: tag.color }];
  });
  const draft: DateDraft = {
    dueDate: task.due_date,
    allDay: task.is_all_day,
    durationMinutes: task.duration_minutes,
    reminder: reminder?.trigger ?? null,
    repeatRule: task.repeat_rule,
  };

  const parents = queryClient.getQueryData<TodayTask[]>(['today-tasks']) ?? [];

  function applyDate(next: DateDraft): void {
    if (next.dueDate !== task.due_date || next.allDay !== task.is_all_day) {
      if (task.repeat_rule !== null && next.dueDate !== null && next.dueDate !== task.due_date) {
        setSeries(next.dueDate);
      } else {
        save.mutate({
          due_date: next.dueDate,
          is_all_day: next.allDay,
          duration_minutes: next.durationMinutes,
          repeat_rule: next.repeatRule,
        });
      }
    } else if (
      next.repeatRule !== task.repeat_rule ||
      next.durationMinutes !== task.duration_minutes
    ) {
      save.mutate({ duration_minutes: next.durationMinutes, repeat_rule: next.repeatRule });
    }
    const current = reminder?.trigger ?? null;
    if (next.reminder === current) {
      return;
    }
    void (async () => {
      if (reminder !== undefined) {
        await api.deleteReminder(task.id, reminder.id);
      }
      if (next.reminder !== null) {
        await api.createReminder(
          task.id,
          { trigger: next.reminder, type: 'relative', channel: 'push' },
          crypto.randomUUID(),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['reminders', taskId] });
    })().catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : messages.saveFailed);
    });
  }

  function complete(): void {
    if (task.status === 'completed') {
      void api.uncompleteTask(task.id, crypto.randomUUID()).then(refresh);
      return;
    }
    if (activeChildren.length > 0) {
      setChildren(true);
      return;
    }
    void finish(undefined);
  }

  async function finish(mode: 'complete' | 'leave' | undefined): Promise<void> {
    const body = mode === undefined ? {} : { complete_children: mode };
    const outcome = await runOrQueue(newMutation('complete', task.id, body), (key) =>
      api.completeTask(task.id, body, key),
    );
    if (!outcome.queued) {
      await refresh();
    }
  }

  return (
    <aside className="detail-panel" aria-label={messages.taskTitle}>
      <button
        type="button"
        className="icon-button detail-back"
        aria-label={messages.close}
        onClick={onClose}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <DetailHeader
        title={task.title}
        priority={task.priority}
        completed={task.status === 'completed'}
        dueText={chip.text}
        dueTone={chip.tone}
        saved={saved}
        savedLabel={messages.saved}
        completeLabel={task.status === 'completed' ? messages.reopenLabel : messages.completeLabel}
        dateLabel={messages.dateSet}
        priorityLabel={messages.prioritySet}
        messages={messages}
        onComplete={complete}
        onOpenDate={() => {
          setDateOpen(true);
        }}
        onOpenPriority={() => {
          setPriorityOpen((current) => !current);
        }}
      />
      <div className="detail-pop-anchor">
        {dateOpen ? (
          <DatePopover
            open
            value={draft}
            timeZone={task.time_zone}
            onClose={() => {
              setDateOpen(false);
            }}
            onApply={applyDate}
          />
        ) : null}
        <PriorityMenu
          open={priorityOpen}
          value={task.priority}
          onClose={() => {
            setPriorityOpen(false);
          }}
          onChange={(priority) => {
            save.mutate({ priority });
          }}
        />
        <TagPicker
          open={tagsOpen}
          tags={(tags.data?.items ?? []).map((tag) => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
          }))}
          selected={task.tag_ids}
          onClose={() => {
            setTagsOpen(false);
          }}
          onToggle={(id) => {
            const next = task.tag_ids.includes(id)
              ? task.tag_ids.filter((item) => item !== id)
              : [...task.tag_ids, id];
            save.mutate({ tag_ids: next });
          }}
        />
      </div>
      {error !== null ? <p role="alert">{error}</p> : null}
      <DetailBody
        title={task.title}
        content={task.content}
        titleLabel={messages.titlePreview}
        untitled={messages.untitled}
        contentLabel={messages.contentLabel}
        contentHint={messages.contentHint}
        checklistLabel={messages.checklist}
        checklistAdd={messages.checklistAdd}
        tagAdd={messages.tagAdd}
        items={task.items.map((item) => ({
          id: item.id,
          title: item.title,
          done: item.status === 'completed',
        }))}
        subtasks={task.subtasks.map((child) => ({ id: child.id, title: child.title }))}
        tags={tagRows}
        reminder={
          reminder === undefined
            ? null
            : humanTrigger(reminder.trigger, reminder.channel, messages, locale)
        }
        repeat={repeatText}
        attachmentCount={attachments.data?.items.length ?? 0}
        attachmentLabel={messages.attachments}
        onTitle={(value) => {
          if (value !== task.title) {
            save.mutate({ title: value });
          }
        }}
        onTitleKey={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onContent={(value) => {
          if (value !== task.content) {
            save.mutate({ content: value });
          }
        }}
        onToggleItem={(id, done) => {
          if (!done) {
            void api.completeChecklistItem(task.id, id).then(refresh);
          }
        }}
        onAddItem={(title) => {
          void api.createChecklistItem(task.id, title, crypto.randomUUID()).then(refresh);
        }}
        onRemoveTag={(id) => {
          save.mutate({ tag_ids: task.tag_ids.filter((item) => item !== id) });
        }}
        onOpenTags={() => {
          setTagsOpen(true);
        }}
        onClearReminder={() => {
          if (reminder === undefined) {
            return;
          }
          void api.deleteReminder(task.id, reminder.id).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['reminders', taskId] });
          });
        }}
        onClearRepeat={() => {
          save.mutate({ repeat_rule: null });
        }}
      />
      {commentsOpen ? (
        <form
          className="detail-comment"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const raw = data.get('comment');
            const text = (typeof raw === 'string' ? raw : '').trim();
            if (text.length === 0) {
              return;
            }
            save.mutate({ content: `${task.content}\n\n> ${text}`.trim() });
            setCommentsOpen(false);
          }}
        >
          <input
            name="comment"
            aria-label={messages.commentAdd}
            placeholder={messages.commentAdd}
          />
        </form>
      ) : null}
      {formatOpen ? (
        <div className="popover popover-menu detail-menu">
          <button
            type="button"
            className="popover-row"
            onClick={() => {
              save.mutate({ content: `${task.content}\n\n**${messages.contentLabel}**` });
              setFormatOpen(false);
            }}
          >
            {messages.formatText}
          </button>
        </div>
      ) : null}
      {parentOpen ? (
        <div className="popover popover-menu detail-menu">
          <p>{messages.parentSearch}</p>
          <button
            type="button"
            className="popover-row"
            onClick={() => {
              save.mutate({ content: task.content.replace(/\n\n[^\n]*$/u, '') });
              setParentOpen(false);
            }}
          >
            {messages.noParent}
          </button>
          {parents
            .filter((item) => item.id !== task.id)
            .slice(0, 8)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="popover-row"
                onClick={() => {
                  save.mutate({
                    content: `${task.content}\n\n${messages.linkParent}: ${item.title}`.trim(),
                  });
                  setParentOpen(false);
                }}
              >
                {item.title}
              </button>
            ))}
        </div>
      ) : null}
      {activityOpen ? (
        <section className="detail-activity">
          <h3>{messages.activity}</h3>
          {task.activity.length === 0 ? <p>{messages.noActivity}</p> : null}
          <ul>
            {task.activity.map((entry) => (
              <li key={entry.id}>
                {entry.actor_id === me.data?.id ? messages.actorYou : messages.actorOther} ·{' '}
                {activityText(entry.action, messages)} · {relativeTime(entry.created_at, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DetailFooter
        listName={projectName}
        listLabel={messages.listMove}
        formatLabel={messages.formatText}
        commentsLabel={messages.commentsLabel}
        moreLabel={messages.moreActions}
        projects={(projects.data?.items ?? []).map((project) => ({
          id: project.id,
          name: project.is_inbox ? messages.smartInbox : project.name,
        }))}
        projectId={task.project_id}
        messages={messages}
        listOpen={listOpen}
        onToggleList={() => {
          setListOpen((current) => !current);
        }}
        onMove={(projectId) => {
          setListOpen(false);
          void api.moveTask(task.id, projectId).then(refresh);
        }}
        onFormat={() => {
          setFormatOpen((current) => !current);
        }}
        onComments={() => {
          setCommentsOpen((current) => !current);
        }}
        onMore={() => {
          setMenuOpen((current) => !current);
        }}
      />
      <DetailMenu
        open={menuOpen}
        messages={messages}
        pinned={pins.includes(task.id)}
        onClose={() => {
          setMenuOpen(false);
        }}
        onAddSubtask={() => {
          void api
            .createTask(
              {
                title: messages.subtaskTitle,
                project_id: task.project_id,
                parent_id: task.id,
              } as unknown as CreateTaskBody,
              crypto.randomUUID(),
            )
            .then(refresh);
        }}
        onLinkParent={() => {
          setParentOpen(true);
        }}
        onPin={() => {
          const next = togglePin(pins, task.id);
          setPins(next);
          localStorage.setItem(PIN_KEY, JSON.stringify(next));
        }}
        onDiscard={() => {
          void api.snoozeTask(task.id, 'next_week').then(() => {
            onClose();
            return refresh();
          });
        }}
        onTags={() => {
          setTagsOpen(true);
        }}
        onUpload={() => {
          fileRef.current?.click();
        }}
        onFocus={() => {
          void api
            .startFocus({ task_id: task.id })
            .then(() => navigate('/focus'))
            .catch((caught: unknown) => {
              setError(caught instanceof ApiError ? caught.message : messages.saveFailed);
            });
        }}
        onActivity={() => {
          setActivityOpen(true);
        }}
        onTemplate={() => {
          const stored = readTemplates();
          stored.push({ title: task.title, content: task.content, priority: task.priority });
          localStorage.setItem(TEMPLATE_KEY, JSON.stringify(stored));
          showToast(messages.templateSaved);
        }}
        onDuplicate={() => {
          void api.duplicateTask(task.id, crypto.randomUUID()).then((copy) => {
            const next = new URLSearchParams(window.location.search);
            next.set('task', copy.id);
            setParams(next, { replace: true });
            showToast(messages.duplicated);
            return refreshTaskSurfaces(queryClient);
          });
        }}
        onCopy={() => {
          void navigator.clipboard.writeText(`${window.location.origin}/task/${task.id}`);
          showToast(messages.copyLink);
        }}
        onConvert={() => {
          save.mutate({ kind: task.kind === 'note' ? 'task' : 'note' });
        }}
        onExport={() => {
          downloadTask(task);
        }}
        onPrint={() => {
          window.print();
        }}
        onDelete={() => {
          const id = task.id;
          void api.deleteTask(id).then(() => {
            showToast(messages.movedToTrash, () => {
              void api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient));
            });
            void refreshTaskSurfaces(queryClient);
            onClose();
          });
        }}
      />
      <input
        ref={fileRef}
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
          void api.uploadAttachment(task.id, file, file.name).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['attachments', taskId] });
          });
        }}
      />
      {children ? (
        <div className="ui-modal" role="dialog" aria-label={messages.completeChildren}>
          <p>{messages.completeChildren}</p>
          <Button
            onClick={() => {
              setChildren(false);
              void finish('complete');
            }}
          >
            {messages.completeChildren}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setChildren(false);
              void finish('leave');
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

function humanTrigger(
  trigger: string,
  channel: string,
  messages: ReturnType<typeof useMessages>,
  locale: string,
): string {
  const parsed = parseTrigger(trigger);
  let label = trigger;
  if (parsed.ok && parsed.kind === 'relative') {
    const minutes = Math.round(Math.abs(parsed.offsetMs) / 60_000);
    if (minutes === 30) {
      label = messages.reminder30;
    } else if (minutes === 60) {
      label = messages.reminderHour;
    } else if (minutes === 1440) {
      label = messages.reminderDay;
    }
  } else if (parsed.ok) {
    label = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(parsed.at),
    );
  }
  const shown = channel.trim();
  return shown.length > 0 && shown !== 'push' ? `${label} · ${shown}` : label;
}

function readTemplates(): { title: string; content: string; priority: string }[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) {
        return [];
      }
      const row = item as { title?: unknown; content?: unknown; priority?: unknown };
      if (typeof row.title !== 'string' || typeof row.content !== 'string') {
        return [];
      }
      return [
        {
          title: row.title,
          content: row.content,
          priority: typeof row.priority === 'string' ? row.priority : 'none',
        },
      ];
    });
  } catch {
    return [];
  }
}

function downloadTask(task: Detail): void {
  const blob = new Blob([JSON.stringify(task, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${task.title.length > 0 ? task.title : 'task'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
