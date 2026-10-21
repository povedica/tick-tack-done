import { TodayMark } from '../../components/period/TodayMark';
import { useCalendarToday } from '../../components/period/useCalendarToday';
import {
  allDaySlot,
  slotFromPoint,
  snapToSlot,
  type CalendarSlot,
  type SlotAnchor,
} from '../capture/calendar-slot';
import { calendarDay } from '../today/groups';
import type { Task } from '@reflexionia/sdk';
import { CalendarDays } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router';
import { eventDayRange } from './event-span';
import { chipStyle, type ExternalEventView } from '../calendar/ExternalEvent';
import { CalendarTaskMark } from '../calendar/CalendarTaskMark';
import type { Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { taskQueryHref } from '../../shell/use-open-task';
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
  onOpenDay,
  onCreateAt,
  draftSlot,
  timeZone = 'Europe/Madrid',
}: {
  readonly onOpenDay?: ((day: string) => void) | undefined;
  readonly onCreateAt?: ((slot: CalendarSlot, anchor: SlotAnchor) => void) | undefined;
  readonly draftSlot?: CalendarSlot | null | undefined;
  readonly timeZone?: string;
  days: readonly Date[];
  tasks: readonly Task[];
  events: readonly ExternalEventView[];
  colors: ReadonlyMap<string, string>;
  messages: Messages;
  onOpenEvent: (event: ExternalEventView) => void;
}) {
  const [selection, setSelection] = useState<CalendarSlot | null>(null);
  const [keyboardMinute, setKeyboardMinute] = useState(9 * 60);
  const dragging = useRef<{
    day: string;
    y: number;
    x: number;
    top: number;
    node: HTMLElement;
    moved: boolean;
    active: boolean;
    timer: number;
    touch: boolean;
  } | null>(null);
  useEffect(
    () => () => {
      if (dragging.current) window.clearTimeout(dragging.current.timer);
    },
    [],
  );
  const ghost = selection ?? draftSlot;
  const interactive = (target: EventTarget) =>
    target instanceof Element &&
    target.closest('a, button, input, textarea, select, .hour-block, .calendar-cell-task');
  const location = useLocation();
  const board = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = board.current;
    const holdDrag = (event: TouchEvent) => {
      if (dragging.current?.active) event.preventDefault();
    };
    node?.addEventListener('touchmove', holdDrag, { passive: false });
    return () => {
      node?.removeEventListener('touchmove', holdDrag);
    };
  }, []);
  const periodKey = days.map(localKey).join(',');
  useLayoutEffect(() => {
    const node = board.current;
    const head = header.current;
    if (!node || !head) return;
    const measure = () => {
      node.style.setProperty('--hour-header-height', `${String(head.offsetHeight)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(head);
    // Choose a stable entry hour before paint; remote results never reset manual scrolling.
    const now = new Date();
    const hour = periodKey.includes(calendarDay(now.toISOString(), timeZone))
      ? Math.max(0, Math.floor(minutesInZone(now.toISOString(), timeZone) / 60) - 1)
      : 8;
    node.scrollTop = hour * HOUR_PX;
    return () => {
      observer.disconnect();
    };
  }, [periodKey, timeZone]);
  const locale = useAppLocale();
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, index) => GRID_START_HOUR + index,
  );
  const today = useCalendarToday(timeZone);
  const widths = days.map((day) => {
    const key = localKey(day);
    const intervals = [
      ...tasksOnCell(tasks, day)
        .filter((task) => !task.is_all_day && (task.start_date ?? task.due_date))
        .map((task) => {
          const start = minutesInZone(task.start_date ?? task.due_date ?? '', task.time_zone);
          return { id: task.id, start, end: start + (task.duration_minutes ?? 30) };
        }),
      ...events
        .filter(
          (event) =>
            !event.is_all_day &&
            key >= eventDayRange(event).start &&
            key <= eventDayRange(event).end,
        )
        .map((event) => {
          const range = eventDayRange(event);
          const zone = timeZone;
          const start = key > range.start ? 0 : minutesInZone(event.starts_at, zone);
          const end =
            key < range.end
              ? 1440
              : event.ends_at
                ? minutesInZone(event.ends_at, zone) || 1440
                : start + 60;
          return { id: event.id, start, end };
        }),
    ];
    const lanes = Math.max(1, ...layoutHourItems(intervals).map((item) => item.lanes));
    return days.length === 1 ? 0 : Math.max(92, lanes * 72);
  });
  const columns = {
    gridTemplateColumns: `var(--hour-columns, var(--calendar-hour-gutter-width) repeat(${String(days.length)},minmax(0,1fr)))`,
  };
  const mobileStyle = {
    '--hour-mobile-columns': `var(--calendar-hour-gutter-width) ${widths.map((width) => `minmax(${String(width)}px,1fr)`).join(' ')}`,
    '--hour-mobile-width': `calc(var(--calendar-hour-gutter-width) + ${String(widths.reduce((sum, width) => sum + width, 0))}px)`,
  } as CSSProperties;
  const allDayTasks = (day: Date) => tasksOnCell(tasks, day).filter((task) => task.is_all_day);
  const allDayEvents = (day: Date) =>
    events.filter(
      (event) =>
        event.is_all_day &&
        localKey(day) >= eventDayRange(event).start &&
        localKey(day) <= eventDayRange(event).end,
    );
  return (
    <div
      ref={board}
      style={mobileStyle}
      className="hour-board"
      data-columns={days.length}
      data-scroll-hint={`${messages.calendarSwipe} ↔`}
      tabIndex={0}
      aria-label={messages.calendarTitle}
    >
      <div ref={header} className="hour-headers" style={columns}>
        <span />
        {days.map((day) => (
          <h2
            key={localKey(day)}
            className={localKey(day) === today ? 'is-today' : undefined}
            aria-label={
              localKey(day) === today
                ? messages.calendarTodayLabel.replace(
                    '{date}',
                    day.toLocaleDateString(locale, { dateStyle: 'full' }),
                  )
                : undefined
            }
          >
            <small>{day.toLocaleDateString(locale, { weekday: 'short' })}</small>
            <TodayMark today={localKey(day) === today}>{day.getDate()}</TodayMark>
          </h2>
        ))}
      </div>
      <div className="hour-allday" style={columns}>
        <span className="hour-allday-label">{messages.calAllDay}</span>
        {days.map((day, index) => (
          <Fragment key={localKey(day)}>
            <div
              className={`hour-allday-cell${allDayTasks(day).length + allDayEvents(day).length > 2 ? ' has-overflow' : ''}`}
              style={{ gridColumn: index + 2, gridRow: '1 / span 2' }}
              data-day={localKey(day)}
              tabIndex={onCreateAt ? 0 : undefined}
              role={onCreateAt ? 'gridcell' : undefined}
              aria-label={
                onCreateAt
                  ? messages.calendarQuickCreateAt.replace(
                      '{name}',
                      day.toLocaleDateString(locale, { dateStyle: 'full' }) +
                        ' · ' +
                        messages.calAllDay,
                    )
                  : undefined
              }
              onClick={(event) => {
                if (!interactive(event.target))
                  onCreateAt?.(allDaySlot(localKey(day), timeZone), {
                    x: event.clientX,
                    y: event.clientY,
                    element: event.currentTarget,
                  });
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  onCreateAt?.(allDaySlot(localKey(day), timeZone), {
                    x: box.left,
                    y: box.bottom,
                    element: event.currentTarget,
                  });
                }
              }}
            >
              {allDayTasks(day)
                .slice(0, 2)
                .map((task) => (
                  <div
                    key={task.id}
                    className="calendar-cell-task"
                    style={chipStyle(colors.get(task.project_id))}
                  >
                    <CalendarTaskMark task={task} />
                    <Link
                      className="cal-pill"
                      to={taskQueryHref(location.pathname, location.search, task.id)}
                    >
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
            {allDayTasks(day).length + allDayEvents(day).length > 2 ? (
              <button
                type="button"
                className="hour-allday-more"
                style={{ gridRow: '1 / span 2', gridColumn: index + 2 }}
                aria-label={`${messages.calendarMoreViews}: ${day.toLocaleDateString(locale, { dateStyle: 'full' })}`}
                onClick={() => {
                  onOpenDay?.(localKey(day));
                }}
              >
                +{allDayTasks(day).length + allDayEvents(day).length - 2}
              </button>
            ) : null}
          </Fragment>
        ))}
        {events
          .filter((event) => event.is_all_day)
          .flatMap((event) => {
            const indexes = days.flatMap((day, index) =>
              allDayTasks(day).length +
                allDayEvents(day).findIndex((item) => item.id === event.id) <
                2 && allDayEvents(day).some((item) => item.id === event.id)
                ? [index]
                : [],
            );
            const runs: { start: number; end: number }[] = [];
            for (const index of indexes) {
              const last = runs.at(-1);
              if (
                last?.end === index - 1 &&
                !days
                  .slice(last.end, index + 1)
                  .some((day) => allDayTasks(day).length + allDayEvents(day).length > 2)
              )
                last.end = index;
              else runs.push({ start: index, end: index });
            }
            return runs.map((run) => (
              <button
                key={`${event.id}-${String(run.start)}`}
                type="button"
                className="cal-pill hour-span"
                style={{
                  ...chipStyle(event.color),
                  width: days
                    .slice(run.start, run.end + 1)
                    .some((day) => allDayTasks(day).length + allDayEvents(day).length > 2)
                    ? 'calc(100% - var(--calendar-allday-more-width))'
                    : undefined,
                  gridColumn: `${String(run.start + 2)} / span ${String(run.end - run.start + 1)}`,
                  gridRow:
                    1 +
                    Math.max(
                      ...days
                        .slice(run.start, run.end + 1)
                        .map(
                          (day) =>
                            allDayTasks(day).length +
                            allDayEvents(day).findIndex((item) => item.id === event.id),
                        ),
                    ),
                }}
                onClick={() => {
                  onOpenEvent(event);
                }}
              >
                <CalendarDays size={13} className="calendar-event-mark" aria-hidden="true" />
                {event.title}
              </button>
            ));
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
              (task) => !task.is_all_day && (task.start_date ?? task.due_date) !== null,
            );
            const dayEvents = events.filter((event) => {
              const range = eventDayRange(event);
              return !event.is_all_day && key >= range.start && key <= range.end;
            });
            const timed = [
              ...dayTasks.map((task) => {
                const start = minutesInZone(task.start_date ?? task.due_date ?? '', task.time_zone);
                return { id: `task:${task.id}`, start, end: start + (task.duration_minutes ?? 30) };
              }),
              ...dayEvents.map((event) => {
                const range = eventDayRange(event);
                const zone = timeZone;
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
                    height: hourBlock(item.start, item.end).height,
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
                data-day={key}
                tabIndex={onCreateAt ? 0 : undefined}
                role={onCreateAt ? 'gridcell' : undefined}
                aria-label={
                  onCreateAt
                    ? messages.calendarQuickCreateAt.replace(
                        '{name}',
                        day.toLocaleDateString(locale, { dateStyle: 'full' }) +
                          ' ' +
                          String(Math.floor(keyboardMinute / 60)).padStart(2, '0') +
                          ':' +
                          String(keyboardMinute % 60).padStart(2, '0'),
                      )
                    : undefined
                }
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || !onCreateAt) return;
                  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    setKeyboardMinute(
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 1410
                          : snapToSlot(keyboardMinute + (event.key === 'ArrowDown' ? 30 : -30)),
                    );
                  }
                  if (['Enter', ' '].includes(event.key)) {
                    event.preventDefault();
                    const box = event.currentTarget.getBoundingClientRect();
                    const y = box.top + (keyboardMinute / 60) * HOUR_PX;
                    onCreateAt(slotFromPoint({ day: key, clientY: y, top: box.top, timeZone }), {
                      x: box.left + box.width / 2,
                      y,
                      element: event.currentTarget,
                    });
                  }
                }}
                onContextMenu={(event) => {
                  if (dragging.current?.active) event.preventDefault();
                }}
                onPointerDown={(event) => {
                  if (!onCreateAt || event.button !== 0 || interactive(event.target)) return;
                  const node = event.currentTarget;
                  node.focus({ preventScroll: true });
                  const touch = event.pointerType === 'touch';
                  const id = event.pointerId;
                  const state = {
                    day: key,
                    y: event.clientY,
                    x: event.clientX,
                    top: node.getBoundingClientRect().top,
                    node,
                    moved: false,
                    active: !touch,
                    timer: 0,
                    touch,
                  };
                  dragging.current = state;
                  if (!touch) node.setPointerCapture(id);
                  else
                    state.timer = window.setTimeout(() => {
                      if (dragging.current === state) {
                        state.active = true;
                        node.setPointerCapture(id);
                        setSelection(
                          slotFromPoint({ day: key, clientY: state.y, top: state.top, timeZone }),
                        );
                      }
                    }, 350);
                }}
                onPointerMove={(event) => {
                  const drag = dragging.current;
                  if (!drag) return;
                  if (Math.hypot(event.clientY - drag.y, event.clientX - drag.x) < 6) return;
                  if (!drag.active) {
                    window.clearTimeout(drag.timer);
                    dragging.current = null;
                    return;
                  }
                  drag.moved = true;
                  setSelection(
                    slotFromPoint({
                      day: drag.day,
                      clientY: drag.y,
                      endY: event.clientY,
                      top: drag.top,
                      timeZone,
                    }),
                  );
                }}
                onPointerUp={(event) => {
                  const drag = dragging.current;
                  if (!drag) return;
                  window.clearTimeout(drag.timer);
                  dragging.current = null;
                  setSelection(null);
                  if (drag.node.hasPointerCapture(event.pointerId))
                    drag.node.releasePointerCapture(event.pointerId);
                  const slot = slotFromPoint({
                    day: drag.day,
                    clientY: drag.y,
                    top: drag.top,
                    timeZone,
                    ...(drag.moved ? { endY: event.clientY } : {}),
                  });
                  onCreateAt?.(slot, { x: event.clientX, y: event.clientY, element: drag.node });
                }}
                onPointerCancel={() => {
                  if (dragging.current) window.clearTimeout(dragging.current.timer);
                  dragging.current = null;
                  setSelection(null);
                }}
              >
                {hours.map((hour) => (
                  <i key={hour} style={{ top: (hour - GRID_START_HOUR) * HOUR_PX }} />
                ))}
                {key === today ? <NowLine timeZone={timeZone} /> : null}
                {ghost && !ghost.allDay && calendarDay(ghost.start, timeZone) === key ? (
                  <div
                    className="hour-ghost"
                    style={hourBlock(
                      minutesInZone(ghost.start, timeZone),
                      ghost.end && calendarDay(ghost.end, timeZone) === key
                        ? minutesInZone(ghost.end, timeZone)
                        : 1440,
                    )}
                  >
                    {new Date(ghost.start).toLocaleTimeString(locale, {
                      timeZone,
                      hour: '2-digit',
                      minute: '2-digit',
                      hourCycle: 'h23',
                    })}
                    –
                    {ghost.end
                      ? new Date(ghost.end).toLocaleTimeString(locale, {
                          timeZone,
                          hour: '2-digit',
                          minute: '2-digit',
                          hourCycle: 'h23',
                        })
                      : ''}
                  </div>
                ) : null}
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="hour-block calendar-hour-task"
                    style={{
                      ...chipStyle(colors.get(task.project_id)),
                      ...style(`task:${task.id}`),
                      height: 'auto',
                      maxHeight: style(`task:${task.id}`).height,
                    }}
                  >
                    <CalendarTaskMark task={task} />
                    <Link to={taskQueryHref(location.pathname, location.search, task.id)}>
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
                    <span>{event.title}</span>
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
function NowLine({ timeZone }: { readonly timeZone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return (
    <span
      className="hour-now"
      style={{
        top: hourBlock(
          minutesInZone(now.toISOString(), timeZone),
          minutesInZone(now.toISOString(), timeZone) + 1,
        ).top,
      }}
      aria-hidden="true"
    />
  );
}
function localKey(day: Date): string {
  return `${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
