import { runAction } from '../../components/run-action';
import { type CreateTaskBody, type TaskDetail as Detail } from '@reflexionia/sdk';
import { describeRepeatRule, parseTrigger } from '@reflexionia/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock, Flag, Repeat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api';
import { DatePopover, reminderLabel, type DateDraft } from '../../components/DatePopover';
import { bindPopover } from '../../components/popover-stack';
import { PriorityMenu } from '../../components/PriorityMenu';
import { TagPicker } from '../../components/TagPicker';
import { Button, SkeletonRows } from '../../components/ui';
import { useActionToast } from '../../components/action-toast';
import { fill, useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { formatClock, useActiveFocus } from '../../shell/useActiveFocus';
import { formatDueChip } from '../today/groups';
import { PIN_KEY, readPins, togglePin } from '../today/pins';
import { newMutation, runOrQueue } from '../offline/client';
import { apiMessage } from './api-message';
import { collectTags } from './collect';
import { activityText, relativeTime } from './detail-model';
import { DetailBody } from './DetailBody';
import { DetailFooter } from './DetailFooter';
import { FormatBar } from './FormatBar';
import { DetailHeader } from './DetailHeader';
import { DetailMenu } from './DetailMenu';
import { refreshTaskSurfaces } from './refresh';
import { PriorityCheck } from '../../components/PriorityCheck';
import { completeBody } from './complete-body';
import { displayTitle } from './displayTitle';
import { createComment, deleteAttachment, listComments, patchChecklistItem } from './task-http';

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
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const focus = useActiveFocus();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setParams] = useSearchParams();
  const showToast = useActionToast((state) => state.show);
  const [saved, setSaved] = useState(false);
  const [series, setSeries] = useState<string | null>(null);
  const [children, setChildren] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateSlot, setDateSlot] = useState<'due' | 'when'>('due');
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
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
  const comments = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => listComments(taskId),
    enabled: commentsOpen,
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
    onSuccess: (outcome) => {
      setSaved(true);
      setError(null);
      if (!outcome.queued) {
        void refresh();
      }
    },
    onError: (caught: unknown) => {
      setError(apiMessage(caught, messages));
    },
  });
  useEffect(() => {
    if (!listOpen) {
      return;
    }
    return bindPopover(() => {
      setListOpen(false);
    });
  }, [listOpen]);
  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSaved(false);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [saved]);

  if (detail.data === undefined && detail.isError) {
    return (
      <aside className="detail-panel">
        <Button onClick={onClose}>{messages.close}</Button>
        <p role="alert">{fill(messages.loadFailed, messages.taskTitle)}</p>
        <Button
          onClick={() => {
            runAction(detail.refetch());
          }}
        >
          {messages.retry}
        </Button>
      </aside>
    );
  }
  if (detail.data === undefined) {
    return (
      <aside className="detail-panel" aria-busy="true">
        <SkeletonRows />
        <p className="ui-muted">{messages.detailLoading}</p>
      </aside>
    );
  }

  const task = detail.data;

  function uploadFile(file: File): void {
    if (file.size > MAX_ATTACHMENT) {
      setError(messages.tooLarge);
      return;
    }
    void api
      .uploadAttachment(task.id, file, file.name)
      .then(() => queryClient.invalidateQueries({ queryKey: ['attachments', taskId] }))
      .catch((caught: unknown) => {
        setError(apiMessage(caught, messages));
      });
  }
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
    reminderTouched: false,
    repeatRule: task.repeat_rule,
  };

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
    if (next.dueDate === null && task.due_date !== null) {
      const previousDue = task.due_date;
      const previousAllDay = task.is_all_day;
      const previousRule = task.repeat_rule;
      showToast(messages.dateCleared, () => {
        save.mutate({
          due_date: previousDue,
          is_all_day: previousAllDay,
          repeat_rule: previousRule,
        });
      });
    }
    if (!next.reminderTouched || sameTrigger(next.reminder, reminder?.trigger ?? null)) {
      return;
    }
    void (async () => {
      if (reminder !== undefined && next.reminder === null) {
        await api.deleteReminder(task.id, reminder.id);
      } else if (next.reminder !== null) {
        if (reminder !== undefined) {
          await api.deleteReminder(task.id, reminder.id);
        }
        await api.createReminder(
          task.id,
          { trigger: next.reminder, type: 'relative', channel: 'push' },
          crypto.randomUUID(),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['reminders', taskId] });
    })().catch((caught: unknown) => {
      setError(apiMessage(caught, messages));
    });
  }

  function complete(): void {
    if (task.status === 'completed') {
      runAction(api.uncompleteTask(task.id, crypto.randomUUID()).then(refresh));
      return;
    }
    if (activeChildren.length > 0) {
      setChildren(true);
      return;
    }
    runAction(finish(undefined));
  }

  async function finish(mode: 'complete' | 'leave' | undefined): Promise<void> {
    const body = mode === undefined ? completeBody() : completeBody({ complete_children: mode });
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
        taskId={task.id}
        title={task.title}
        priority={task.priority}
        completed={task.status === 'completed'}
        dueText={chip.text}
        dueTone={chip.tone}
        saving={save.isPending}
        saved={saved}
        savedLabel={messages.saved}
        savingLabel={messages.savingNow}
        completeLabel={task.status === 'completed' ? messages.reopenLabel : messages.completeLabel}
        dateLabel={messages.dateSet}
        priorityLabel={messages.prioritySet}
        closeLabel={messages.close}
        messages={messages}
        onComplete={complete}
        onOpenDate={() => {
          setDateOpen(true);
        }}
        onOpenPriority={() => {
          setPriorityOpen((current) => !current);
        }}
        onClose={onClose}
      />
      <div className="detail-pop-anchor">
        {dateOpen ? (
          <DatePopover
            open
            value={
              dateSlot === 'when'
                ? { ...draft, dueDate: task.start_date, allDay: task.is_all_day }
                : draft
            }
            timeZone={task.time_zone}
            onClose={() => {
              setDateOpen(false);
            }}
            onApply={(next) => {
              if (dateSlot === 'when') {
                save.mutate({ start_date: next.dueDate, is_all_day: next.allDay });
                return;
              }
              applyDate(next);
            }}
            onSomeday={() => {
              const someday = (task as Detail & { is_someday?: boolean }).is_someday;
              save.mutate({
                someday: !someday,
                ...(someday ? {} : { start_date: null }),
              } as Parameters<typeof api.patchTask>[1]);
            }}
            onNotice={setNotice}
            {...((me.data as { features?: { when_deadline?: boolean } } | undefined)?.features
              ?.when_deadline === false
              ? {}
              : {
                  onEvening: () => {
                    save.mutate({
                      evening_only: true,
                      start_date: task.start_date ?? task.due_date,
                      is_all_day: true,
                    } as Parameters<typeof api.patchTask>[1]);
                  },
                })}
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
      {error !== null ? (
        <p className="detail-alert" role="alert">
          {error}
          <button
            type="button"
            className="icon-button"
            aria-label={messages.close}
            onClick={() => {
              setError(null);
            }}
          >
            ×
          </button>
        </p>
      ) : null}
      {notice !== null ? (
        <p className="detail-alert" role="status">
          {notice}
        </p>
      ) : null}
      <DetailBody
        titleLeading={
          <PriorityCheck
            priority={task.priority}
            label={fill(
              task.status === 'completed' ? messages.reopenLabel : messages.completeLabel,
              task.title,
            )}
            checked={task.status === 'completed'}
            onChange={complete}
          />
        }
        metadata={
          <div className="detail-metadata">
            <button
              type="button"
              className="detail-meta-chip"
              onClick={() => {
                setDateSlot('when');
                setDateOpen(true);
              }}
            >
              <CalendarDays size={14} aria-hidden="true" />
              {(task.start_date ?? task.due_date) === null
                ? messages.whenField
                : formatDueChip(
                    task.start_date ?? task.due_date,
                    task.time_zone,
                    task.is_all_day,
                    new Date(),
                    locale,
                    { empty: messages.noDate, today: messages.dateToday },
                  ).text}
            </button>
            {repeatText !== null && (task.start_date !== null || task.due_date !== null) ? (
              <button
                type="button"
                className="detail-meta-chip"
                onClick={() => {
                  setDateSlot('due');
                  setDateOpen(true);
                }}
              >
                <Repeat size={14} aria-hidden="true" />
                {repeatText}
              </button>
            ) : null}
            <button
              type="button"
              className="detail-meta-chip"
              data-empty={task.duration_minutes === null}
              onClick={() => {
                setDateSlot('due');
                setDateOpen(true);
              }}
            >
              <Clock size={14} aria-hidden="true" />
              {task.duration_minutes === null
                ? messages.durationTab
                : `${String(task.duration_minutes)} min`}
            </button>
            <button
              type="button"
              className={`detail-meta-chip is-${chip.tone}`}
              data-empty={task.due_date === null}
              onClick={() => {
                setDateSlot('due');
                setDateOpen(true);
              }}
            >
              <Flag size={14} aria-hidden="true" />
              {task.due_date === null ? messages.deadlineField : chip.text}
            </button>
          </div>
        }
        title={task.title}
        content={task.content}
        titleLabel={messages.titlePreview}
        untitled={messages.untitled}
        contentLabel={messages.contentLabel}
        contentHint={messages.contentHint}
        contentRef={contentRef}
        editRequested={formatOpen}
        checklistLabel={messages.checklist}
        checklistAdd={messages.checklistAdd}
        checklistEdit={messages.checklistEdit}
        checklistDelete={messages.checklistDelete}
        tagAdd={messages.tagAddLabel}
        taskId={task.id}
        items={task.items.map((item) => ({
          id: item.id,
          title: item.title,
          done: item.status === 'completed',
        }))}
        subtasks={task.subtasks.map((child) => ({
          id: child.id,
          title: child.title,
          done: child.status === 'completed',
        }))}
        subtasksLabel={messages.subtasksLabel}
        tags={tagRows}
        reminder={reminder === undefined ? null : reminderLabel(reminder.trigger, messages)}
        repeat={repeatText}
        attachments={(attachments.data?.items ?? []).map((file) => ({
          id: file.id,
          name: file.file_name,
          size: file.byte_size,
        }))}
        attachmentLabel={messages.attachments}
        attachmentDownload={messages.attachmentDownload}
        attachmentDelete={messages.attachmentDelete}
        attachmentDrop={messages.attachmentDrop}
        onTitle={(value) => {
          if (value !== displayTitle(task.title)) {
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
          const next = value;
          if (next !== task.content) {
            save.mutate({ content: next });
          }
        }}
        onToggleItem={(id, done) => {
          if (!done) {
            runAction(api.completeChecklistItem(task.id, id).then(refresh));
          }
        }}
        onAddItem={(title) => {
          runAction(api.createChecklistItem(task.id, title, crypto.randomUUID()).then(refresh));
        }}
        onEditItem={(id, title) => {
          runAction(patchChecklistItem(task.id, id, { title }).then(refresh));
        }}
        onDeleteItem={(id) => {
          runAction(api.deleteChecklistItem(task.id, id).then(refresh));
        }}
        onReorderItem={(id, beforeId) => {
          runAction(patchChecklistItem(task.id, id, { before_id: beforeId }).then(refresh));
        }}
        onToggleSubtask={(id, done) => {
          const run = done
            ? api.uncompleteTask(id, crypto.randomUUID())
            : api.completeTask(id, completeBody(), crypto.randomUUID());
          runAction(run.then(refresh));
        }}
        onDeleteAttachment={(id) => {
          void deleteAttachment(task.id, id)
            .then(() => queryClient.invalidateQueries({ queryKey: ['attachments', taskId] }))
            .catch((caught: unknown) => {
              setError(apiMessage(caught, messages));
            });
        }}
        onDropFiles={(files) => {
          const file = files[0];
          if (file === undefined) {
            return;
          }
          uploadFile(file);
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
          runAction(
            api.deleteReminder(task.id, reminder.id).then(() => {
              runAction(queryClient.invalidateQueries({ queryKey: ['reminders', taskId] }));
            }),
          );
        }}
        onClearRepeat={() => {
          save.mutate({ repeat_rule: null });
        }}
      />
      {commentsOpen ? (
        <section className="detail-comments">
          {(comments.data ?? []).length === 0 ? null : (
            <ul>
              {(comments.data ?? []).map((comment) => (
                <li key={comment.id}>
                  <p className="comment-meta">
                    {comment.authorId === me.data?.id ? messages.actorYou : messages.actorOther}
                    {comment.createdAt !== null
                      ? ` · ${relativeTime(comment.createdAt, locale)}`
                      : ''}
                  </p>
                  <p>{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="comment-field"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const raw = data.get('comment');
              const text = (typeof raw === 'string' ? raw : '').trim();
              const form = event.currentTarget;
              if (text.length === 0) {
                return;
              }
              void createComment(task.id, text)
                .then(() => {
                  form.reset();
                  return queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
                })
                .catch((caught: unknown) => {
                  setError(apiMessage(caught, messages));
                });
            }}
          >
            <textarea
              className="comment-input"
              name="comment"
              aria-label={messages.commentAdd}
              placeholder={messages.commentAdd}
              rows={1}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </form>
        </section>
      ) : null}
      {parentOpen ? (
        <p className="detail-alert" role="status">
          {messages.parentUnavailable}
        </p>
      ) : null}
      {activityOpen ? (
        <section className="detail-activity">
          <h3>{messages.activity}</h3>
          {task.activity.length === 0 ? <p>{messages.noActivity}</p> : null}
          <ul>
            {task.activity.map((entry) => {
              const via =
                entry.token_name !== undefined &&
                entry.token_name !== null &&
                entry.token_name.length > 0
                  ? fill(messages.createdVia, entry.token_name)
                  : entry.actor_kind === 'api' || entry.token_id
                    ? messages.createdViaApi
                    : null;
              return (
                <li key={entry.id}>
                  {entry.actor_id === me.data?.id ? messages.actorYou : messages.actorOther}
                  {via !== null ? ` ${via}` : ''} · {activityText(entry.action, messages)} ·{' '}
                  {relativeTime(entry.created_at, locale)}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {focus?.taskId === task.id ? (
        <p className="detail-focus">
          <span>
            {messages.focusMini} {formatClock(focus.remaining)}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              runAction(
                api.finishFocus(focus.id).then(() => {
                  runAction(queryClient.invalidateQueries({ queryKey: ['focus-sessions'] }));
                }),
              );
            }}
          >
            {messages.focusFinish}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              runAction(
                api.abortFocus(focus.id).then(() => {
                  runAction(queryClient.invalidateQueries({ queryKey: ['focus-sessions'] }));
                }),
              );
            }}
          >
            {messages.focusCancel}
          </Button>
          <Link to="/focus">{messages.focusTitle}</Link>
        </p>
      ) : null}
      {formatOpen ? (
        <FormatBar
          field={contentRef}
          labels={messages}
          dateLabel={new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(new Date())}
          onCommit={(value) => {
            const next = value;
            if (next !== task.content) {
              save.mutate({ content: next });
            }
          }}
        />
      ) : null}
      <DetailFooter
        formatLabel={messages.formatBar}
        formatOpen={formatOpen}
        onToggleFormat={() => {
          setFormatOpen((current) => !current);
        }}
        listName={projectName}
        listLabel={messages.listMove}
        listOpen={listOpen}
        projects={(projects.data?.items ?? []).map((project) => ({
          id: project.id,
          name: project.is_inbox ? messages.smartInbox : project.name,
        }))}
        projectId={task.project_id}
        commentsLabel={messages.commentsLabel}
        moreLabel={messages.moreActions}
        onToggleList={() => {
          setListOpen((current) => !current);
        }}
        onMove={(projectId) => {
          setListOpen(false);
          runAction(api.moveTask(task.id, projectId).then(refresh));
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
          runAction(
            api
              .createTask(
                {
                  title: messages.subtaskTitle,
                  project_id: task.project_id,
                  parent_id: task.id,
                } as unknown as CreateTaskBody,
                crypto.randomUUID(),
              )
              .then(refresh),
          );
        }}
        onLinkParent={() => {
          setParentOpen(true);
        }}
        onPin={() => {
          const next = togglePin(pins, task.id);
          setPins(next);
          localStorage.setItem(PIN_KEY, JSON.stringify(next));
          showToast(next.includes(task.id) ? messages.pinnedToast : messages.unpinnedToast);
        }}
        onDiscard={() => {
          runAction(
            api.snoozeTask(task.id, 'next_week').then(() => {
              onClose();
              return refresh();
            }),
          );
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
            .then(() => queryClient.invalidateQueries({ queryKey: ['focus-sessions'] }))
            .catch((caught: unknown) => {
              setError(apiMessage(caught, messages));
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
          runAction(
            api.duplicateTask(task.id, crypto.randomUUID()).then((copy) => {
              const next = new URLSearchParams(window.location.search);
              next.set('task', copy.id);
              setParams(next, { replace: true });
              showToast(messages.duplicated);
              return refreshTaskSurfaces(queryClient);
            }),
          );
        }}
        onCopy={() => {
          runAction(navigator.clipboard.writeText(`${window.location.origin}/task/${task.id}`));
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
        onWontDo={() => {
          void api
            .cancelTask(task.id)
            .then(() => {
              showToast(messages.wontDoDone);
              runAction(refreshTaskSurfaces(queryClient));
              onClose();
            })
            .catch((caught: unknown) => {
              setError(apiMessage(caught, messages));
            });
        }}
        onDelete={() => {
          const id = task.id;
          runAction(
            api.deleteTask(id).then(() => {
              showToast(messages.movedToTrash, () => {
                runAction(api.restoreTask(id).then(() => refreshTaskSurfaces(queryClient)));
              });
              runAction(refreshTaskSurfaces(queryClient));
              onClose();
            }),
          );
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
          uploadFile(file);
          event.target.value = '';
        }}
      />
      {children ? (
        <div className="ui-modal" role="dialog" aria-label={messages.completeChildren}>
          <p>{messages.completeChildren}</p>
          <Button
            onClick={() => {
              setChildren(false);
              runAction(finish('complete'));
            }}
          >
            {messages.completeChildren}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setChildren(false);
              runAction(finish('leave'));
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
              runAction(api.detachOccurrence(task.id, due).then(refresh));
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

function sameTrigger(left: string | null, right: string | null): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  const a = parseTrigger(left);
  const b = parseTrigger(right);
  return (
    a.ok && b.ok && a.kind === 'relative' && b.kind === 'relative' && a.offsetMs === b.offsetMs
  );
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
