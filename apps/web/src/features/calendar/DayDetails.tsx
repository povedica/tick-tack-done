import { dateTimeFormat } from '../../lib/dates/formatters';
import { useRef, useState, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { CalendarDays, Plus, X } from 'lucide-react';
import type { CreateTaskBody, Project, Task } from '@reflexionia/sdk';
import { api } from '../../api';
import { Popover } from '../../components/Popover';
import { TagChip } from '../../components/ui';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { taskQueryHref } from '../../shell/use-open-task';
import { collectTags } from '../tasks/collect';
import { minutesInZone } from '../places/hour';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { allDaySlot, slotToTaskBody } from '../capture/calendar-slot';
import { CalendarTaskMark } from './CalendarTaskMark';
import type { ExternalEventView } from './ExternalEvent';
import { useWtAMessages } from './i18n-wt-a';

/** Presentation only: keep the stored title and tag relationships unchanged. */
export function dayTaskLabel(title: string) {
  const tags: string[] = [];
  const text = title
    .replace(/(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu, (_, space: string, tag: string) => {
      tags.push(tag);
      return space;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { title: text, tags };
}

export function DayDetails({
  dayKey,
  anchor,
  onClose,
  tasks,
  events,
  projects,
  defaultProjectId,
  timeZone,
  onOpenEvent,
}: {
  readonly dayKey: string;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly projects: readonly Project[];
  readonly defaultProjectId?: string | undefined;
  readonly timeZone: string;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale(),
    m = useMessages(),
    own = useWtAMessages();
  const location = useLocation();
  const cache = useQueryClient();
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, staleTime: 5 * 60_000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const heading = dateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .formatToParts(new Date(`${dayKey}T12:00:00Z`))
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(' ');
  const clock = (iso: string) =>
    dateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
      new Date(iso),
    );
  const items = [
    ...tasks.map((task) => ({
      kind: 'task' as const,
      task,
      id: task.id,
      at: task.due_date ?? '',
      allDay: task.is_all_day,
    })),
    ...events.map((event) => ({
      kind: 'event' as const,
      event,
      id: event.id,
      at: event.starts_at,
      allDay: event.is_all_day || minutesInZone(event.starts_at, timeZone) === 0,
    })),
  ];
  const groups = [
    { title: m.calAllDay, items: items.filter((item) => item.allDay), timed: false },
    {
      title: own.calendarTimed,
      items: items.filter((item) => !item.allDay).sort((a, b) => a.at.localeCompare(b.at)),
      timed: true,
    },
  ];
  const header = (
    <header className="calendar-day-popover-header">
      <h2>{heading}</h2>
      <button type="button" className="calendar-day-close" aria-label={m.close} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
  const footer = (
    <form
      className="calendar-day-add"
      onSubmit={(event) => {
        event.preventDefault();
        const title = text.trim();
        const project = defaultProjectId ?? projects.find((p) => p.is_inbox)?.id;
        if (!title || !project || busy) return;
        setBusy(true);
        setError('');
        if (attempt.current?.text !== title)
          attempt.current = { text: title, key: crypto.randomUUID() };
        const body = {
          title,
          project_id: project,
          ...slotToTaskBody(allDaySlot(dayKey, timeZone), timeZone),
        } as unknown as CreateTaskBody;
        void api
          .createTask(body, attempt.current.key)
          .then(async () => {
            setText('');
            attempt.current = null;
            await refreshTaskSurfaces(cache);
          })
          .catch(() => {
            setError(m.saveFailed);
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <input
          aria-label={own.calendarAddToDay}
          placeholder={own.calendarAddToDay}
          value={text}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
          }}
          enterKeyHint="done"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={
            busy || !text.trim() || (!defaultProjectId && !projects.some((p) => p.is_inbox))
          }
          aria-label={m.addTask}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
  return (
    <Popover
      open
      anchor={anchor}
      width={640}
      centered
      mobileSheet
      mobileSheetMaxWidth={767}
      sheetHeader={header}
      sheetFooter={footer}
      label={heading}
      className="popover calendar-day-popover"
      onClose={onClose}
    >
      <div className="calendar-day-desktop-heading">{header}</div>
      <div className="calendar-day-layout">
        <aside className="calendar-day-identity" aria-hidden="true">
          <strong>{Number(dayKey.slice(8))}</strong>
          <span>
            {dateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
              new Date(`${dayKey}T12:00Z`),
            )}
          </span>
        </aside>
        <div className="calendar-day-items">
          {groups.map((group) =>
            group.items.length ? (
              <section key={group.title} aria-label={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.items.map((item) => {
                    if (item.kind === 'event')
                      return (
                        <li
                          key={`event-${item.id}`}
                          className={`calendar-day-row is-event${group.timed ? ' has-time' : ''}`}
                        >
                          <CalendarDays
                            className="calendar-day-event-icon"
                            size={17}
                            aria-hidden="true"
                          />
                          {group.timed ? <time dateTime={item.at}>{clock(item.at)}</time> : null}
                          <button
                            type="button"
                            className="calendar-day-event"
                            onClick={() => {
                              onClose();
                              onOpenEvent(item.event);
                            }}
                          >
                            <span className="calendar-day-title">{item.event.title}</span>
                            {item.event.summary ? <small>{item.event.summary}</small> : null}
                          </button>
                        </li>
                      );
                    const task = item.task;
                    const label = dayTaskLabel(task.title);
                    const assignedTags = (tags.data?.items ?? [])
                      .filter((tag) => task.tag_ids.includes(tag.id))
                      .map((tag) => tag.name.replace(/^#/, ''));
                    const names = [
                      ...new Map(
                        [...assignedTags, ...label.tags].map((name) => [
                          name.toLocaleLowerCase(locale),
                          name,
                        ]),
                      ).values(),
                    ];
                    const project = projects.find((p) => p.id === task.project_id);
                    return (
                      <li
                        key={`task-${item.id}`}
                        className={`calendar-day-row${group.timed ? ' has-time' : ''}`}
                      >
                        <CalendarTaskMark task={{ ...task, title: label.title || m.untitled }} />
                        {group.timed ? <time dateTime={item.at}>{clock(item.at)}</time> : null}
                        <div
                          className="calendar-day-task"
                          style={{ borderColor: project?.color ?? 'var(--accent)' }}
                        >
                          <Link
                            className="agenda-card calendar-day-title"
                            to={taskQueryHref(location.pathname, location.search, task.id)}
                            onClick={onClose}
                          >
                            {label.title || m.untitled}
                          </Link>
                          <div className="calendar-day-meta">
                            {project ? (
                              <span className="calendar-day-list">{project.name}</span>
                            ) : null}
                            {names.map((name) => (
                              <TagChip key={name} label={name} />
                            ))}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null,
          )}
          {!items.length ? <p className="calendar-day-empty">{own.calendarEmptyDay}</p> : null}
        </div>
      </div>
    </Popover>
  );
}
