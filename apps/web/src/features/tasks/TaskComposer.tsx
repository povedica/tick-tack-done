import { runAction } from '../../components/run-action';
import {
  CalendarDays,
  ChevronDown,
  Check,
  Flag,
  Inbox,
  Tag,
  Paperclip,
  FileText,
  Layers,
  Plus,
  Mic,
  Send,
} from 'lucide-react';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskBody } from '@reflexionia/sdk';
import { api } from '../../api';
import { DatePopover, type DateDraft } from '../../components/DatePopover';
import { Popover } from '../../components/Popover';
import { TagIcon } from '../../components/TagIcon';
import { captureLanguage, fill, useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { quickAddRequest, type ViewDay } from '../capture/quick-add';
import { textSegments } from '../capture/draft';
import { noticesFrom, useCaptureNotice, type CaptureNotice } from '../capture/notice';
import { useSpeech } from '../capture/speech';
import { newMutation, runOrQueue } from '../offline/client';
import { formatDueChip } from '../today/groups';
import { collectTags } from './collect';
import { refreshTaskSurfaces } from './refresh';
import './composer.css';
import { useComposerCopy } from './composer-text';

export function TaskComposer({
  defaultProjectId,
  viewDay = null,
  inputRef,
  onCreated,
  initialText = '',
  onCaptured,
  autoFocus = false,
  onDismiss,
}: {
  readonly initialText?: string;
  readonly autoFocus?: boolean;
  readonly onDismiss?: () => void;
  readonly onCaptured?: (notice: CaptureNotice) => void;
  readonly defaultProjectId?: string | undefined;
  readonly viewDay?: ViewDay | null | undefined;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly onCreated?: (() => void) | undefined;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const cache = useQueryClient();
  const ownInput = useRef<HTMLInputElement>(null);
  const field = inputRef ?? ownInput;
  const mirror = useRef<HTMLDivElement>(null);
  const dateButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const speech = useSpeech(captureLanguage(locale), setText);
  const [panel, setPanel] = useState<'date' | 'more' | 'lists' | 'tags' | 'templates' | null>(null);
  const [date, setDate] = useState<DateDraft | null>(null);
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high' | undefined>();
  const [project, setProject] = useState<string | null>(null);
  const [tags, setTags] = useState<string[] | null>(null);
  const [kind, setKind] = useState<'task' | 'note'>('task');
  const [content, setContent] = useState('');
  const [details, setDetails] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ fingerprint: string; mutation: ReturnType<typeof newMutation> } | null>(
    null,
  );
  const continuation = useRef<{ id: string; uploaded: number } | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const zone = account.data?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const tagQuery = useQuery({ queryKey: ['tags'], queryFn: collectTags });
  const request = useMemo(
    () =>
      quickAddRequest({
        text,
        language: captureLanguage(locale),
        now: new Date().toISOString(),
        timeZone: zone,
        viewDay,
        defaultProjectId,
      }),
    [text, locale, zone, viewDay, defaultProjectId],
  );
  const dateValue = useMemo<DateDraft>(
    () =>
      date ?? {
        dueDate: request.parsed.start?.date ?? request.parsed.due?.date ?? request.dueDate,
        allDay: request.parsed.start?.isAllDay ?? request.parsed.due?.isAllDay ?? true,
        durationMinutes: request.parsed.durationMinutes ?? null,
        reminder: request.parsed.reminderTrigger,
        reminderTouched: false,
        repeatRule: request.parsed.repeatRule,
      },
    [date, request],
  );
  const tagIds =
    tags ??
    tagQuery.data?.items
      .filter((tag) =>
        request.parsed.tagNames.some(
          (name) => name.toLocaleLowerCase() === tag.name.toLocaleLowerCase(),
        ),
      )
      .map((tag) => tag.id) ??
    [];
  const chosenPriority = priority ?? request.parsed.priority ?? 'none';
  const lists = projects.data?.items ?? [];
  const chosenList =
    lists.find((item) => item.id === (project ?? defaultProjectId)) ??
    lists.find((item) => item.is_inbox);
  const listLabel =
    project !== null
      ? (chosenList?.name ?? messages.smartInbox)
      : (request.parsed.listName ??
        (chosenList?.is_inbox ? messages.smartInbox : (chosenList?.name ?? messages.smartInbox)));
  const dateLabel =
    dateValue.dueDate === null
      ? messages.noDate
      : formatDueChip(dateValue.dueDate, zone, dateValue.allDay, new Date(), locale, {
          empty: messages.noDate,
          today: messages.dateToday,
        }).text;
  const priorities = {
    high: messages.priorityHigh,
    medium: messages.priorityMedium,
    low: messages.priorityLow,
    none: messages.priorityNone,
  };
  const segments = textSegments(text, request.parsed.spans);
  const labels = useComposerCopy();
  function close() {
    setPanel(null);
    field.current?.focus();
  }
  async function submit() {
    if (lock.current || request.parsed.title.trim().length === 0) return;
    if (files.length && !navigator.onLine) {
      setError(labels.filesOnline);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    setStatus('');
    setPanel(null);
    try {
      let queued = false;
      let notice: CaptureNotice = { title: request.parsed.title, warnings: [] };
      if (continuation.current === null) {
        const body = {
          ...request.body,
          raw_text: text,
          ...(tags === null ? {} : { tag_ids: tags }),
          kind,
          content,
          ...(project === null ? {} : { project_id: project }),
          ...(priority === undefined ? {} : { priority }),
          ...(date === null
            ? {}
            : {
                due_date: date.dueDate,
                is_all_day: date.allDay,
                time_zone: zone,
                duration_minutes: date.durationMinutes,
                repeat_rule: date.repeatRule,
                ...(date.reminderTouched ? { reminder_trigger: date.reminder } : {}),
              }),
        } as unknown as CreateTaskBody;
        const fingerprint = JSON.stringify(body);
        if (attempt.current?.fingerprint !== fingerprint)
          attempt.current = {
            fingerprint,
            mutation: newMutation('create', crypto.randomUUID(), { ...body }),
          };
        const mutation = attempt.current.mutation;
        const result =
          files.length > 0
            ? { queued: false, result: await api.createTask(body, mutation.idempotencyKey) }
            : await runOrQueue(mutation, (key) => api.createTask(body, key));

        queued = result.queued;
        if (result.result) {
          continuation.current = { id: result.result.id, uploaded: 0 };
          notice = { title: result.result.title, warnings: noticesFrom(result.result.warnings) };
          useCaptureNotice.getState().setNotice(notice);
        }
      }
      const saved = continuation.current;
      if (saved) {
        for (let i = saved.uploaded; i < files.length; i++) {
          const file = files[i];
          if (file) await api.uploadAttachment(saved.id, file, file.name);
          saved.uploaded = i + 1;
        }
      }
      setText('');
      setDate(null);
      setPriority(undefined);
      setProject(null);
      setTags(null);
      setContent('');
      setFiles([]);
      setKind('task');
      setDetails(false);
      continuation.current = null;
      attempt.current = null;
      setStatus(queued ? labels.queued : messages.created);
      await refreshTaskSurfaces(cache);
      onCreated?.();
      onCaptured?.(notice);
    } catch {
      setError(continuation.current ? labels.uploadRetry : messages.createFailed);
    } finally {
      lock.current = false;
      setBusy(false);
      field.current?.focus();
    }
  }
  const frozen = busy || continuation.current !== null;
  return (
    <div className="task-composer">
      <form
        className="quick-add task-composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          runAction(submit());
        }}
      >
        <div className={text.trim().length > 0 ? 'composer-main has-draft' : 'composer-main'}>
          <Plus size={17} className="composer-plus" aria-hidden="true" />
          <div className="quick-add-field composer-field">
            <div ref={mirror} className="quick-add-mirror" aria-hidden="true">
              {segments.map((segment) =>
                segment.kind === null ? (
                  <span key={segment.start}>{segment.text}</span>
                ) : (
                  <mark key={segment.start}>{segment.text}</mark>
                ),
              )}
            </div>
            <input
              ref={field}
              autoFocus={autoFocus}
              name="title"
              aria-label={messages.addTask}
              className={text ? 'is-mirroring' : ''}
              value={text}
              disabled={frozen}
              placeholder={fill(messages.addTaskTo, listLabel)}
              autoComplete="off"
              onChange={(event) => {
                setText(event.target.value);
                setStatus('');
              }}
              onScroll={(event) => {
                if (mirror.current) mirror.current.scrollLeft = event.currentTarget.scrollLeft;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  if (panel) close();
                  else if (onDismiss) onDismiss();
                  else field.current?.blur();
                }
                if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>
          <button
            ref={dateButton}
            className="composer-date"
            type="button"
            aria-label={messages.kindDate}
            aria-expanded={panel === 'date'}
            disabled={frozen}
            onClick={() => {
              setPanel(panel === 'date' ? null : 'date');
            }}
          >
            <CalendarDays size={15} aria-hidden="true" />
            <span>{dateLabel}</span>
          </button>
          <button
            ref={menuButton}
            className="composer-options"
            type="button"
            aria-label={labels.options}
            aria-expanded={panel !== null && panel !== 'date'}
            disabled={frozen}
            onClick={() => {
              setPanel(panel === 'more' ? null : 'more');
            }}
          >
            {chosenPriority !== 'none' ? (
              <Flag size={15} color={`var(--prio-${chosenPriority})`} aria-hidden="true" />
            ) : (
              <ChevronDown size={17} aria-hidden="true" />
            )}
          </button>
          <button
            className="composer-submit"
            type="submit"
            aria-label={messages.confirm}
            disabled={busy || !request.parsed.title.trim()}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
        {details ? (
          <textarea
            className="composer-content"
            aria-label={messages.addDescription}
            value={content}
            disabled={frozen}
            onChange={(event) => {
              setContent(event.target.value);
            }}
          />
        ) : null}
        {tagIds.length || files.length || kind === 'note' ? (
          <div className="composer-chips">
            {tagIds.map((id) => (
              <button
                key={id}
                disabled={frozen}
                type="button"
                onClick={() => {
                  setTags((old) => (old ?? tagIds).filter((tag) => tag !== id));
                }}
              >
                #{tagQuery.data?.items.find((tag) => tag.id === id)?.name} ×
              </button>
            ))}
            {files.map((file, i) => (
              <button
                key={i}
                type="button"
                disabled={frozen}
                onClick={() => {
                  setFiles((old) => old.filter((_, index) => index !== i));
                }}
              >
                <Paperclip size={12} />
                {file.name} ×
              </button>
            ))}
            {kind === 'note' ? <span>{messages.noteBadge}</span> : null}
          </div>
        ) : null}
      </form>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          setFiles((old) => [...old, ...Array.from(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      {panel === 'date' ? (
        <DatePopover
          open
          anchor={dateButton}
          value={dateValue}
          timeZone={zone}
          onClose={close}
          onApply={setDate}
        />
      ) : null}
      <Popover
        open={panel !== null && panel !== 'date'}
        anchor={menuButton}
        label={labels.options}
        onClose={close}
        className="popover composer-menu"
      >
        {panel === 'more' ? (
          <>
            <p className="popover-label">{messages.kindPriority}</p>
            <div className="composer-priorities">
              {(['high', 'medium', 'low', 'none'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={priorities[p]}
                  aria-pressed={chosenPriority === p}
                  onClick={() => {
                    setPriority(p);
                    close();
                  }}
                >
                  <Flag size={19} color={`var(--prio-${p})`} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="popover-row"
              onClick={() => {
                setPanel('lists');
              }}
            >
              <Inbox size={16} />
              <span>{listLabel}</span>
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              className="popover-row"
              onClick={() => {
                setPanel('tags');
              }}
            >
              <Tag size={16} />
              {messages.kindTag}
            </button>
            <button
              type="button"
              className="popover-row"
              onClick={() => {
                setPanel(null);
                fileInput.current?.click();
              }}
            >
              <Paperclip size={16} />
              {messages.attachments}
            </button>
            <button
              type="button"
              className="popover-row"
              onClick={() => {
                setPanel('templates');
              }}
            >
              <Layers size={16} />
              {labels.templates}
            </button>
            <button
              type="button"
              className="popover-row"
              onClick={() => {
                setKind(kind === 'task' ? 'note' : 'task');
                close();
              }}
            >
              <FileText size={16} />
              {kind === 'task' ? messages.convertNote : messages.addTask}
            </button>
            <button
              type="button"
              className="popover-row"
              onClick={() => {
                setDetails(true);
                close();
              }}
            >
              <FileText size={16} />
              {messages.addDescription}
            </button>
            <button
              type="button"
              className="popover-row"
              disabled={!speech.supported}
              aria-pressed={speech.listening}
              onClick={() => {
                speech.toggle(text);
                close();
              }}
            >
              <Mic size={16} />
              {speech.listening ? messages.voiceStop : messages.voice}
            </button>
          </>
        ) : panel === 'lists' ? (
          <>
            <p className="popover-label">{messages.kindList}</p>
            {projects.isError ? (
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  runAction(projects.refetch());
                }}
              >
                {messages.retry}
              </button>
            ) : (
              lists
                .filter((item) => !item.closed && item.kind !== 'NOTE')
                .map((item) => (
                  <button
                    type="button"
                    className="popover-row"
                    key={item.id}
                    onClick={() => {
                      setProject(item.id);
                      close();
                    }}
                  >
                    <Inbox size={16} />
                    <span>{item.is_inbox ? messages.smartInbox : item.name}</span>
                    {chosenList?.id === item.id ? <Check size={14} /> : null}
                  </button>
                ))
            )}
          </>
        ) : panel === 'tags' ? (
          <>
            <p className="popover-label">{messages.kindTag}</p>
            {tagQuery.data?.items.map((tag) => (
              <label key={tag.id} className="popover-row">
                <input
                  type="checkbox"
                  checked={tagIds.includes(tag.id)}
                  onChange={(event) => {
                    setTags((old) =>
                      event.target.checked
                        ? [...(old ?? tagIds), tag.id]
                        : (old ?? tagIds).filter((id) => id !== tag.id),
                    );
                  }}
                />
                <TagIcon color={tag.color} />
                {tag.name}
              </label>
            ))}
            <button type="button" className="popover-row" onClick={close}>
              <Check size={16} />
              {messages.dateOk}
            </button>
          </>
        ) : panel === 'templates' ? (
          <>
            <p className="popover-label">{labels.templates}</p>
            {readTemplates().length === 0 ? (
              <p className="popover-label">{labels.noTemplates}</p>
            ) : (
              readTemplates().map((template, i) => (
                <button
                  type="button"
                  key={i}
                  className="popover-row"
                  onClick={() => {
                    setText(template.title);
                    setContent(template.content);
                    setDetails(true);
                    setPriority(template.priority);
                    close();
                  }}
                >
                  {template.title}
                </button>
              ))
            )}
          </>
        ) : null}
      </Popover>
      {busy ? (
        <p className="composer-status" role="status">
          {messages.saving}
        </p>
      ) : status ? (
        <p className="composer-status" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="composer-error">
          {error}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              runAction(submit());
            }}
          >
            {messages.retry}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function readTemplates(): {
  title: string;
  content: string;
  priority: 'none' | 'low' | 'medium' | 'high';
}[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('tick-tack-done.templates') ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null) return [];
      const row = item as Record<string, unknown>;
      if (typeof row.title !== 'string' || typeof row.content !== 'string') return [];
      return [
        {
          title: row.title,
          content: row.content,
          priority:
            row.priority === 'high' || row.priority === 'medium' || row.priority === 'low'
              ? row.priority
              : 'none',
        },
      ];
    });
  } catch {
    return [];
  }
}
