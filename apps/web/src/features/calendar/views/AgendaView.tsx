import { dateTimeFormat } from '../../../lib/dates/formatters';
import { CalendarDays } from 'lucide-react';
import { Fragment, memo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '@reflexionia/sdk';
import { EmptyState } from '../../../components/ui';
import { PriorityCheck } from '../../../components/PriorityCheck';
import { useCalendarToday } from '../../../components/period/useCalendarToday';
import { fill, type Messages } from '../../../i18n';
import { taskQueryHref } from '../../../shell/use-open-task';
import { calendarDay } from '../../today/groups';
import { displayTitle } from '../../tasks/displayTitle';
import { completeBody } from '../../tasks/complete-body';
import { refreshTaskSurfaces } from '../../tasks/refresh';
import { api } from '../../../api';
import { dayFromParam } from '../../places/month';
import { eventDayRange } from '../../places/event-span';
import type { ExternalEventView } from '../ExternalEvent';
import type { SlotAnchor } from '../../capture/calendar-slot';
import { clockLabel, localKey } from '../data/chips';
import { createInDaySpace, createInDaySpaceWithKey } from './day-space';

export const AgendaView = memo(function AgendaView({
  days,
  anchorDay,
  showMonths = false,
  tasks,
  events,
  locale,
  messages,
  colors,
  onOpenEvent,
  onCreateDay,
}: {
  readonly onCreateDay?: ((day: string, anchor: SlotAnchor) => void) | undefined;
  readonly days?: readonly Date[];
  readonly anchorDay?: string;
  readonly showMonths?: boolean;
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly locale: string;
  readonly messages: Messages;
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const location = useLocation();
  const cache = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const todayKey = useCalendarToday();
  type Item =
    | { kind: 'task'; task: Task; time: string }
    | { kind: 'event'; event: ExternalEventView; time: string };
  const groups = new Map<string, Item[]>();
  if (anchorDay) groups.set(anchorDay, []);
  function add(key: string, item: Item): void {
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  for (const task of tasks) {
    if (task.due_date !== null)
      add(calendarDay(task.due_date, task.time_zone), {
        kind: 'task',
        task,
        time: task.is_all_day ? '' : task.due_date,
      });
  }
  for (const event of events) {
    const range = eventDayRange(event);
    const dates = days
      ? days.map(localKey).filter((key) => key >= range.start && key <= range.end)
      : [range.start];
    for (const key of dates)
      add(key, {
        kind: 'event',
        event,
        time: event.is_all_day ? '' : key > range.start ? `${key}T00:00` : event.starts_at,
      });
  }
  const emptyMonths = new Set<string>();
  if (showMonths) {
    const months = new Set((days ?? []).map((day) => localKey(day).slice(0, 7)));
    for (const month of months) {
      if (![...groups.keys()].some((key) => key.startsWith(month))) {
        const key = `${month}-01`;
        groups.set(key, []);
        emptyMonths.add(key);
      }
    }
  }
  const visibleKeys = days ? new Set(days.map(localKey)) : null;
  const forward = [...groups.entries()]
    .filter(([key]) => !visibleKeys || visibleKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const weekday = dateTimeFormat(locale, {
    weekday: 'short',
  });
  const monthName = dateTimeFormat(locale, { month: 'long', year: 'numeric' });
  if (forward.length === 0)
    return <EmptyState title={messages.calendarTitle} body={messages.calEmpty} />;
  return (
    <div className="agenda">
      {error !== null ? <p role="alert">{error}</p> : null}
      {forward.map(([key, bucket], index) => {
        const day = dayFromParam(key) ?? new Date();
        const previous = forward[index - 1]?.[0];
        const heading =
          key === todayKey ? `${messages.calToday} · ${weekday.format(day)}` : weekday.format(day);
        return (
          <Fragment key={key}>
            {previous?.slice(0, 7) !== key.slice(0, 7) ? (
              <h2 className="agenda-month" data-agenda-month={key.slice(0, 7)}>
                {monthName.format(day)}
              </h2>
            ) : null}
            {emptyMonths.has(key) ? (
              <p
                className="ui-muted"
                tabIndex={onCreateDay ? 0 : undefined}
                onKeyDown={(event) => {
                  createInDaySpaceWithKey(event, key, onCreateDay);
                }}
                onClick={(event) => {
                  createInDaySpace(event, key, onCreateDay);
                }}
              >
                {messages.calEmpty}
              </p>
            ) : (
              <section
                className="agenda-day"
                data-agenda-day={key}
                tabIndex={onCreateDay ? 0 : undefined}
                onKeyDown={(event) => {
                  createInDaySpaceWithKey(event, key, onCreateDay);
                }}
                onClick={(event) => {
                  createInDaySpace(event, key, onCreateDay);
                }}
              >
                <header
                  className={key === todayKey ? 'agenda-day-head is-today' : 'agenda-day-head'}
                >
                  <strong className="agenda-day-number">{day.getDate()}</strong>
                  <span>{heading}</span>
                </header>
                <ul>
                  {[...bucket]
                    .sort((left, right) => left.time.localeCompare(right.time))
                    .map((item) => {
                      if (item.kind === 'event') {
                        const event = item.event;
                        return (
                          <li key={`event-${event.id}`} className="agenda-row">
                            <time
                              className={
                                event.is_all_day ? 'agenda-time is-all-day' : 'agenda-time'
                              }
                            >
                              {event.is_all_day
                                ? messages.calAllDay
                                : `${key > eventDayRange(event).start ? '00:00' : clockLabel(event.starts_at, locale)}${event.ends_at ? ` – ${key < eventDayRange(event).end ? '24:00' : clockLabel(event.ends_at, locale)}` : ''}`}
                            </time>
                            <CalendarDays
                              className="calendar-event-mark"
                              size={17}
                              style={{ color: event.color ?? 'var(--accent)' }}
                              aria-hidden="true"
                            />
                            <button
                              type="button"
                              className="agenda-card"
                              title={event.title}
                              onClick={() => {
                                onOpenEvent(event);
                              }}
                            >
                              <span>{event.title}</span>
                            </button>
                          </li>
                        );
                      }
                      const task = item.task;
                      const title = displayTitle(task.title) || messages.untitled;
                      return (
                        <li key={`task-${task.id}`} className="agenda-row">
                          <time
                            className={task.is_all_day ? 'agenda-time is-all-day' : 'agenda-time'}
                          >
                            {task.is_all_day
                              ? messages.calAllDay
                              : clockLabel(task.due_date ?? '', locale)}
                          </time>
                          <PriorityCheck
                            priority={task.priority}
                            label={fill(messages.completeLabel, title)}
                            disabled={pending.has(task.id)}
                            onChange={() => {
                              setPending((ids) => new Set([...ids, task.id]));
                              setError(null);
                              void api
                                .completeTask(task.id, completeBody(), crypto.randomUUID())
                                .then(() => refreshTaskSurfaces(cache))
                                .catch(() => {
                                  setError(messages.saveFailed);
                                })
                                .finally(() => {
                                  setPending(
                                    (ids) => new Set([...ids].filter((id) => id !== task.id)),
                                  );
                                });
                            }}
                          />
                          <span
                            className="cal-dot"
                            style={{ background: colors.get(task.project_id) ?? 'var(--accent)' }}
                            aria-hidden="true"
                          />
                          <Link
                            className="agenda-card"
                            title={title}
                            to={taskQueryHref(location.pathname, location.search, task.id)}
                          >
                            <span>{title}</span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}
          </Fragment>
        );
      })}
    </div>
  );
});
