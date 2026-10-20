import type { Task } from '@reflexionia/sdk';
import { calendarDateKey } from '@reflexionia/domain';
import { Link } from 'react-router';
import { chipStyle, type ExternalEventView } from '../calendar/ExternalEvent';
import type { Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { calendarTaskLabel, tasksOnCell } from './month';
import { GRID_END_HOUR, GRID_START_HOUR, HOUR_PX, hourBlock, minutesInZone } from './hour';

export function HourGrid({
  days,
  tasks,
  events,
  messages,
  onOpenEvent,
}: {
  readonly days: readonly Date[];
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly messages: Messages;
  readonly onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale();
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, index) => GRID_START_HOUR + index,
  );
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' });
  const todayKey = localKey(new Date());
  return (
    <div className="hour-board">
      <div
        className="hour-headers"
        style={{ gridTemplateColumns: `4rem repeat(${String(days.length)}, minmax(0, 1fr))` }}
      >
        <span className="hour-allday-label">{messages.calAllDay}</span>
        {days.map((day) => {
          const key = localKey(day);
          return (
            <h2 key={key} className={key === todayKey ? 'is-today' : undefined}>
              {weekday.format(day)}
            </h2>
          );
        })}
      </div>
      <div
        className="hour-allday"
        style={{ gridTemplateColumns: `4rem repeat(${String(days.length)}, minmax(0, 1fr))` }}
      >
        <span />
        {days.map((day) => (
          <div key={localKey(day)} className="hour-allday-cell">
            {tasksOnCell(tasks, day)
              .filter((task) => task.is_all_day)
              .map((task) => {
                const label = calendarTaskLabel(
                  task.title,
                  task.due_date,
                  task.time_zone,
                  messages.untitled,
                );
                return (
                  <Link
                    key={task.id}
                    className="cal-pill"
                    title={label}
                    to={`/list/${task.project_id}?task=${task.id}`}
                  >
                    {label}
                  </Link>
                );
              })}
            {eventsOnDay(events, day)
              .filter((event) => event.is_all_day)
              .map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="cal-pill"
                  title={event.title}
                  style={chipStyle(event.color)}
                  onClick={() => {
                    onOpenEvent(event);
                  }}
                >
                  {event.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="hour-scroll">
        <div
          className="hour-grid"
          style={{ gridTemplateColumns: `4rem repeat(${String(days.length)}, minmax(0, 1fr))` }}
        >
          <div className="hour-gutter">
            {hours.map((hour) => (
              <span key={hour} style={{ height: HOUR_PX }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((day) => {
            const key = localKey(day);
            return (
              <section
                key={key}
                className={key === todayKey ? 'hour-col is-today' : 'hour-col'}
                style={{ height: HOUR_PX * hours.length }}
              >
                {hours.map((hour) => (
                  <i key={hour} style={{ top: (hour - GRID_START_HOUR) * HOUR_PX }} />
                ))}
                {key === todayKey ? <NowLine /> : null}
                {tasksOnCell(tasks, day)
                  .filter((task) => !task.is_all_day && task.due_date !== null)
                  .map((task) => {
                    const zone = task.time_zone.length > 0 ? task.time_zone : 'Europe/Madrid';
                    const start = minutesInZone(task.due_date ?? '', zone);
                    const box = hourBlock(start, start + 30);
                    const label = calendarTaskLabel(
                      task.title,
                      task.due_date,
                      task.time_zone,
                      messages.untitled,
                    );
                    return (
                      <Link
                        key={task.id}
                        className="hour-block"
                        title={label}
                        style={{ top: box.top, height: box.height }}
                        to={`/list/${task.project_id}?task=${task.id}`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                {eventsOnDay(events, day)
                  .filter((event) => !event.is_all_day)
                  .map((event) => {
                    const zone = event.time_zone ?? 'Europe/Madrid';
                    const start = minutesInZone(event.starts_at, zone);
                    const end =
                      event.ends_at === null ? start + 60 : minutesInZone(event.ends_at, zone);
                    const box = hourBlock(start, end);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        className="hour-block"
                        title={event.title}
                        style={{ ...chipStyle(event.color), top: box.top, height: box.height }}
                        onClick={() => {
                          onOpenEvent(event);
                        }}
                      >
                        {event.title}
                      </button>
                    );
                  })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minutes = minutesInZone(new Date().toISOString(), zone);
  const box = hourBlock(minutes, minutes + 1);
  return <span className="hour-now" style={{ top: box.top }} aria-hidden="true" />;
}

function localKey(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${String(day.getFullYear())}-${month}-${date}`;
}

function eventsOnDay(events: readonly ExternalEventView[], day: Date): ExternalEventView[] {
  const key = localKey(day);
  return events.filter((event) => {
    const zone = event.time_zone ?? 'Europe/Madrid';
    const start = calendarDateKey(event.starts_at, zone);
    const end = calendarDateKey(event.ends_at ?? event.starts_at, zone);
    return key >= start && key <= end;
  });
}
