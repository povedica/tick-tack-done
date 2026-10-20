import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { displayTitle } from '../tasks/displayTitle';
import { calendarDay, type TodayTask } from './groups';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import {
  dotStyle,
  ExternalEventPopover,
  isExternalEvent,
  type ExternalEventView,
} from '../calendar/ExternalEvent';

/** RF-2542. Hidden when today has no external events. */
export function TodayAgenda({ tasks = [] }: { readonly tasks?: readonly TodayTask[] }) {
  const messages = useMessages();
  const locale = useAppLocale();
  const range = useMemo(() => todayRange(new Date()), []);
  const events = useQuery({
    queryKey: ['calendar-events', 'today', range.from, range.to],
    queryFn: () => api.calendarEvents(range.from, range.to),
  });
  const [open, setOpen] = useState<ExternalEventView | null>(null);
  const external = Array.isArray(events.data?.external)
    ? events.data.external.filter(isExternalEvent)
    : [];
  const todayTasks = tasks.filter(
    (task) =>
      task.dueDate !== null &&
      calendarDay(task.dueDate, task.timeZone) ===
        calendarDay(new Date().toISOString(), task.timeZone),
  );
  const sorted = [...external].sort((left, right) => {
    if (left.is_all_day !== right.is_all_day) {
      return left.is_all_day ? -1 : 1;
    }
    return left.starts_at.localeCompare(right.starts_at);
  });
  if (sorted.length === 0 && todayTasks.length === 0) {
    return null;
  }
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  return (
    <section className="today-agenda" aria-label={messages.todayAgenda}>
      <h2>{messages.todayAgenda}</h2>
      <ul>
        {todayTasks.map((task) => (
          <li key={task.id}>
            <Link className="today-agenda-row" to={`?task=${task.id}`}>
              <span className="cal-dot" aria-hidden="true" />
              <span>
                {task.allDay
                  ? messages.allDay
                  : new Intl.DateTimeFormat(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: task.timeZone,
                    }).format(new Date(task.dueDate ?? ''))}
              </span>
              <span>{displayTitle(task.title)}</span>
            </Link>
          </li>
        ))}
        {sorted.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              className="today-agenda-row"
              onClick={() => {
                setOpen(event);
              }}
            >
              <span className="cal-dot" style={dotStyle(event.color)} />
              <span>
                {event.is_all_day ? messages.allDay : time.format(new Date(event.starts_at))}
              </span>
              <span>{event.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? (
        <ExternalEventPopover
          event={open}
          messages={messages}
          locale={locale}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </section>
  );
}

function todayRange(now: Date): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
