import type { Task } from '@reflexionia/sdk';
import { CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { eventDayRange, eventSpan } from './event-span';
import { chipStyle, type ExternalEventView } from '../calendar/ExternalEvent';
import { CalendarTaskMark } from '../calendar/CalendarTaskMark';
import type { Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { calendarTaskLabel, tasksOnCell } from './month';
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  HOUR_PX,
  hourBlock,
  minutesInZone,
  layoutHourItems,
} from './hour';

export function HourGrid({
  days,
  tasks,
  events,
  colors,
  messages,
  onOpenEvent,
}: {
  days: readonly Date[];
  tasks: readonly Task[];
  events: readonly ExternalEventView[];
  colors: ReadonlyMap<string, string>;
  messages: Messages;
  onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale();
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, index) => GRID_START_HOUR + index,
  );
  const today = localKey(new Date());
  const columns = { gridTemplateColumns: `3.5rem repeat(${String(days.length)},minmax(0,1fr))` };
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  return (
    <div
      className="hour-board"
      data-columns={days.length}
      tabIndex={0}
      aria-label={messages.calendarTitle}
    >
      <div className="hour-headers" style={columns}>
        <span />
        {days.map((day) => (
          <h2 key={localKey(day)} className={localKey(day) === today ? 'is-today' : undefined}>
            <small>{day.toLocaleDateString(locale, { weekday: 'short' })}</small>
            <span>{day.getDate()}</span>
          </h2>
        ))}
      </div>
      <div className="hour-allday" style={columns}>
        <span className="hour-allday-label">{messages.calAllDay}</span>
        {days.map((day, index) => (
          <div key={localKey(day)} className="hour-allday-cell" style={{ gridColumn: index + 2 }}>
            {tasksOnCell(tasks, day)
              .filter((task) => task.is_all_day)
              .map((task) => (
                <div
                  key={task.id}
                  className="calendar-cell-task"
                  style={chipStyle(colors.get(task.project_id))}
                >
                  <CalendarTaskMark task={task} />
                  <Link className="cal-pill" to={`/list/${task.project_id}?task=${task.id}`}>
                    {calendarTaskLabel(
                      task.title,
                      task.due_date,
                      task.time_zone,
                      messages.untitled,
                    )}
                  </Link>
                </div>
              ))}
          </div>
        ))}
        {events
          .filter((event) => event.is_all_day)
          .map((event) => {
            const position = eventSpan(event, days);
            return position ? (
              <button
                key={event.id}
                type="button"
                className="cal-pill hour-span"
                style={{
                  ...chipStyle(event.color),
                  gridColumn: `${String(position.column)} / span ${String(position.span)}`,
                }}
                onClick={() => {
                  onOpenEvent(event);
                }}
              >
                <CalendarDays size={13} className="calendar-event-mark" aria-hidden="true" />
                {event.title}
              </button>
            ) : null;
          })}
      </div>
      <div className="hour-scroll">
        <div className="hour-grid" style={columns}>
          <div className="hour-gutter">
            {hours.map((hour) => (
              <span key={hour} style={{ height: HOUR_PX }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((day) => {
            const key = localKey(day);
            const dayTasks = tasksOnCell(tasks, day).filter(
              (task) => !task.is_all_day && task.due_date !== null,
            );
            const dayEvents = events.filter((event) => {
              const range = eventDayRange(event);
              return !event.is_all_day && key >= range.start && key <= range.end;
            });
            const timed = [
              ...dayTasks.map((task) => {
                const start = minutesInZone(task.due_date ?? '', task.time_zone);
                return { id: `task:${task.id}`, start, end: start + (task.duration_minutes ?? 30) };
              }),
              ...dayEvents.map((event) => {
                const range = eventDayRange(event);
                const zone = event.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
                const start = key > range.start ? 0 : minutesInZone(event.starts_at, zone);
                let end =
                  key < range.end
                    ? 1440
                    : event.ends_at
                      ? minutesInZone(event.ends_at, zone)
                      : start + 60;
                if (end === 0 || end <= start) end = 1440;
                return { id: `event:${event.id}`, start, end };
              }),
            ];
            const layout = layoutHourItems(timed);
            const style = (id: string) => {
              const item = layout.find((item) => item.id === id);
              return item
                ? {
                    top: hourBlock(item.start, item.end).top,
                    minHeight: hourBlock(item.start, item.end).height,
                    left: `${String((item.lane / item.lanes) * 100)}%`,
                    width: `${String(100 / item.lanes)}%`,
                  }
                : {};
            };
            return (
              <section
                key={key}
                className={key === today ? 'hour-col is-today' : 'hour-col'}
                style={{ height: HOUR_PX * hours.length }}
              >
                {hours.map((hour) => (
                  <i key={hour} style={{ top: (hour - GRID_START_HOUR) * HOUR_PX }} />
                ))}
                {key === today ? <NowLine /> : null}
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="hour-block calendar-hour-task"
                    style={{
                      ...chipStyle(colors.get(task.project_id)),
                      ...style(`task:${task.id}`),
                    }}
                  >
                    <CalendarTaskMark task={task} />
                    <Link to={`/list/${task.project_id}?task=${task.id}`}>
                      <small>{clock(task.due_date ?? '')}</small>
                      {calendarTaskLabel(
                        task.title,
                        task.due_date,
                        task.time_zone,
                        messages.untitled,
                      )}
                    </Link>
                  </div>
                ))}
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="hour-block"
                    style={{ ...chipStyle(event.color), ...style(`event:${event.id}`) }}
                    onClick={() => {
                      onOpenEvent(event);
                    }}
                  >
                    <CalendarDays size={13} className="calendar-event-mark" aria-hidden="true" />
                    <span>
                      <small>
                        {key > eventDayRange(event).start ? '00:00' : clock(event.starts_at)}
                      </small>
                      {event.title}
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <span
      className="hour-now"
      style={{
        top: hourBlock(
          minutesInZone(now.toISOString(), zone),
          minutesInZone(now.toISOString(), zone) + 1,
        ).top,
      }}
      aria-hidden="true"
    />
  );
}
function localKey(day: Date): string {
  return `${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
