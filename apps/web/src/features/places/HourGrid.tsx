import { calendarRepeatedHour, calendarAxisMinute, calendarDragPatch } from '@reflexionia/domain';
import { useCalendarDrag } from './use-calendar-drag';
import type { CalendarTaskChange } from './use-calendar-task-change';
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
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link, useLocation } from 'react-router';
import { eventDayRange } from './event-span';
import { chipStyle, type ExternalEventView } from '../calendar/ExternalEvent';
import { CalendarTaskMark } from '../calendar/CalendarTaskMark';
import type { Messages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { taskQueryHref } from '../../shell/use-open-task';
import { calendarTaskLabel, isCalendarOverdue, tasksOnCell, isoWeek } from './month';
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  HOUR_PX,
  hourBlock,
  layoutHourItems,
  limitHourLanes,
} from './hour';

export function HourGrid({
  days,
  tasks,
  events,
  colors,
  messages,
  onOpenEvent,
  onOpenDay,
  onTaskChange,
  onCreateAt,
  draftSlot,
  timeZone = 'Europe/Madrid',
}: {
  readonly onTaskChange?: CalendarTaskChange | undefined;
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

  const interactive = (target: EventTarget) =>
    target instanceof Element &&
    target.closest('a, button, input, textarea, select, .hour-block, .calendar-cell-task');
  const location = useLocation();
  const board = useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const node = board.current;
    if (!node) return;
    const measure = () => {
      const next = Object.fromEntries(
        [...node.querySelectorAll<HTMLElement>('.hour-col')].map((column) => [
          column.dataset.day ?? '',
          column.getBoundingClientRect().width,
        ]),
      );
      setColumnWidths((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.querySelectorAll('.hour-col').forEach((column) => { observer.observe(column); });
    measure();
    return () => { observer.disconnect(); };
  }, [days.map((day) => localKey(day)).join(',')]);
  const drag = useCalendarDrag(board, timeZone, onTaskChange);
  const moved = drag.preview?.patch;
  const ghost = moved
    ? {
        start: moved.start_date ?? moved.due_date ?? '',
        end: moved.start_date ? (moved.due_date ?? null) : null,
        allDay: !!moved.is_all_day,
        timeZone,
      }
    : (selection ?? draftSlot);
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
      ? Math.max(
          0,
          Math.floor(calendarAxisMinute(now.toISOString(), timeZone, repeatedHour) / 60) - 1,
        )
      : 8;
    node.scrollTop = hour * HOUR_PX;
    return () => {
      observer.disconnect();
    };
  }, [periodKey, timeZone]);
  const locale = useAppLocale();
  const repeatedHour = useMemo(
    () =>
      days
        .map((day) => calendarRepeatedHour(localKey(day), timeZone))
        .find((hour) => hour !== null) ?? null,
    [periodKey, timeZone],
  );
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, index) => index,
  ).flatMap((hour) => (hour === repeatedHour ? [hour, hour] : [hour]));
  const repeatedZoneLabel = (later: boolean) => {
    const day = days.find(
      (item) => calendarRepeatedHour(localKey(item), timeZone) === repeatedHour,
    );
    if (!day || repeatedHour === null) return '';
    const first = calendarDragPatch(
      { start_date: null, due_date: null, is_all_day: false, duration_minutes: 60 },
      { day: localKey(day), minute: repeatedHour * 60, laterOccurrence: later },
      timeZone,
    ).start_date;
    return first
      ? (new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
          .formatToParts(new Date(first))
          .find((part) => part.type === 'timeZoneName')?.value ?? '')
      : '';
  };
  const axis = (iso: string) => calendarAxisMinute(iso, timeZone, repeatedHour);
  const block = (start: number, end: number) => hourBlock(start, end, hours.length * 60);
  const today = useCalendarToday(timeZone);
  const widths = days.map((day) => {
    const key = localKey(day);
    const intervals = [
      ...tasksOnCell(tasks, day)
        .filter((task) => !task.is_all_day && (task.start_date ?? task.due_date))
        .map((task) => {
          const start = axis(task.start_date ?? task.due_date ?? '');
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
          const start = key > range.start ? 0 : axis(event.starts_at);
          const end =
            key < range.end
              ? hours.length * 60
              : event.ends_at
                ? axis(event.ends_at) || 1440
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
      data-calendar-repeated-hour={repeatedHour ?? undefined}
      data-scroll-hint={`${messages.calendarSwipe} ↔`}
      tabIndex={0}
      aria-label={messages.calendarTitle}
    >
      <span id={drag.helpId} className="sr-only">
        {messages.calendarDragHelp}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
      <div ref={header} className="hour-headers" style={columns}>
        <span className="hour-week-number">
          {days.length === 1 ? `S${String(isoWeek(days[0] ?? new Date()))}` : ''}
        </span>
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
              data-calendar-drop-day={localKey(day)}
              data-calendar-drop-kind="allday"
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
                    {...drag.bindTask(task)}
                    className="calendar-cell-task calendar-chip"
                    style={chipStyle(colors.get(task.project_id))}
                  >
                    <CalendarTaskMark task={task} />
                    <Link
                      title={task.title}
                      aria-label={task.title}
                      className={
                        isCalendarOverdue(task.due_date, task.time_zone, new Date())
                          ? 'cal-pill is-overdue'
                          : 'cal-pill'
                      }
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
                {...drag.external}
                className="cal-pill hour-span calendar-chip"
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
                <span>{event.title}</span>
              </button>
            ));
          })}
      </div>
      <div className="hour-scroll">
        <div className="hour-grid" style={columns}>
          <div className="hour-gutter">
            {hours.map((hour, index) => (
              <span key={index} style={{ height: HOUR_PX }}>
                {String(hour).padStart(2, '0')}:00
                {hour === repeatedHour ? ` ${repeatedZoneLabel(index !== hour)}` : ''}
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
                const start = axis(task.start_date ?? task.due_date ?? '');
                const endInstant = new Date(
                  Date.parse(task.start_date ?? task.due_date ?? '') +
                    (task.duration_minutes ?? 30) * 60000,
                ).toISOString();
                return {
                  id: `task:${task.id}`,
                  start,
                  end:
                    calendarDay(endInstant, timeZone) === key
                      ? axis(endInstant)
                      : hours.length * 60,
                };
              }),
              ...dayEvents.map((event) => {
                const range = eventDayRange(event);
                const start = key > range.start ? 0 : axis(event.starts_at);
                let end =
                  key < range.end
                    ? hours.length * 60
                    : event.ends_at
                      ? axis(event.ends_at)
                      : start + 60;
                if (end === 0 || end <= start) end = 1440;
                return { id: `event:${event.id}`, start, end };
              }),
            ];
            const limited = limitHourLanes(layoutHourItems(timed), days.length === 1 ? (columnWidths[key] ?? 10000) : 10000);
            const layout = limited.visible;
            const style = (id: string) => {
              const item = layout.find((item) => item.id === id);
              return item
                ? {
                    top: block(item.start, item.end).top,
                    height: block(item.start, item.end).height,
                    left: `${String((item.lane / item.lanes) * 100)}%`,
                    width: `calc(${String(100 / item.lanes)}% - var(--cal-block-gap) * ${String((item.lanes - 1) / item.lanes)})`,
                    marginLeft: `calc(var(--cal-block-gap) * ${String(item.lane / item.lanes)})`,
                  }
                : {};
            };
            return (
              <section
                key={key}
                className={key === today ? 'hour-col is-today' : 'hour-col'}
                style={{ height: HOUR_PX * hours.length }}
                data-day={key}
                data-calendar-drop-day={key}
                data-calendar-drop-kind="hour"
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
                    const axisMinute =
                      repeatedHour !== null && keyboardMinute >= (repeatedHour + 1) * 60
                        ? keyboardMinute + 60
                        : keyboardMinute;
                    const y = box.top + (axisMinute / 60) * HOUR_PX;
                    onCreateAt(
                      slotFromPoint({ day: key, clientY: y, top: box.top, timeZone, repeatedHour }),
                      {
                        x: box.left + box.width / 2,
                        y,
                        element: event.currentTarget,
                      },
                    );
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
                          slotFromPoint({
                            day: key,
                            clientY: state.y,
                            top: state.top,
                            timeZone,
                            repeatedHour,
                          }),
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
                      repeatedHour,
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
                    repeatedHour,
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
                {hours.map((hour, index) => (
                  <i key={index} style={{ top: index * HOUR_PX }} />
                ))}
                {key === today ? <NowLine timeZone={timeZone} repeatedHour={repeatedHour} /> : null}
                {ghost && !ghost.allDay && calendarDay(ghost.start, timeZone) === key ? (
                  <div
                    className="hour-ghost"
                    style={block(
                      axis(ghost.start),
                      ghost.end && calendarDay(ghost.end, timeZone) === key
                        ? axis(ghost.end)
                        : hours.length * 60,
                    )}
                  >
                    {new Date(ghost.start).toLocaleTimeString(locale, {
                      timeZone,
                      hour: '2-digit',
                      minute: '2-digit',
                      hourCycle: 'h23',
                      ...(moved ? { timeZoneName: 'short' as const } : {}),
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
                {limited.overflow.map((item, index) => (
                  <button
                    key={`overflow-${String(index)}`}
                    type="button"
                    className="hour-block hour-overflow"
                    style={{
                      top: block(item.start, item.end).top,
                      height: block(item.start, item.end).height,
                      left: `${String((item.lane / item.lanes) * 100)}%`,
                      width: `calc(${String(100 / item.lanes)}% - 2px)`,
                    }}
                    onClick={() => onOpenDay?.(key)}
                  >
                    +{item.count}
                  </button>
                ))}
                {dayTasks
                  .filter((task) => layout.some((item) => item.id === `task:${task.id}`))
                  .map((task) => (
                    <div
                      key={task.id}
                      {...drag.bindTask(task)}
                      className="hour-block calendar-hour-task calendar-chip"
                      data-task-id={task.id}
                      data-block-size={
                        Number(style(`task:${task.id}`).height) < 18
                          ? 'tiny'
                          : Number(style(`task:${task.id}`).height) < 32
                            ? 'compact'
                            : 'regular'
                      }
                      style={
                        {
                          ...chipStyle(colors.get(task.project_id)),
                          ...style(`task:${task.id}`),

                          '--calendar-task-duration-height': `${String(style(`task:${task.id}`).height ?? 24)}px`,
                        } as CSSProperties & { '--calendar-task-duration-height': string }
                      }
                    >
                      <CalendarTaskMark task={task} />
                      <Link
                        title={task.title}
                        aria-label={task.title}
                        className={
                          isCalendarOverdue(task.due_date, task.time_zone, new Date())
                            ? 'is-overdue'
                            : undefined
                        }
                        to={taskQueryHref(location.pathname, location.search, task.id)}
                      >
                        {calendarTaskLabel(
                          task.title,
                          task.due_date,
                          task.time_zone,
                          messages.untitled,
                        )}
                        {Number(style(`task:${task.id}`).height) >= 18 ? (
                          <time className="hour-task-time">
                            {' '}
                            ·{' '}
                            {new Intl.DateTimeFormat(locale, {
                              timeZone,
                              hour: '2-digit',
                              minute: '2-digit',
                              hourCycle: 'h23',
                            }).format(new Date(task.start_date ?? task.due_date ?? ''))}
                          </time>
                        ) : null}
                      </Link>
                      <button
                        type="button"
                        data-calendar-resize
                        className="calendar-resize-handle"
                        aria-label={messages.calendarResize}
                      />
                    </div>
                  ))}
                {dayEvents
                  .filter((event) => layout.some((item) => item.id === `event:${event.id}`))
                  .map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      {...drag.external}
                      className="hour-block calendar-chip"
                      title={event.title}
                      aria-label={event.title}
                      data-block-size={
                        Number(style(`event:${event.id}`).height) < 18
                          ? 'tiny'
                          : Number(style(`event:${event.id}`).height) < 32
                            ? 'compact'
                            : 'regular'
                      }
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
function NowLine({
  timeZone,
  repeatedHour,
}: {
  readonly timeZone: string;
  readonly repeatedHour: number | null;
}) {
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
          calendarAxisMinute(now.toISOString(), timeZone, repeatedHour),
          calendarAxisMinute(now.toISOString(), timeZone, repeatedHour) + 1,
          repeatedHour === null ? 1440 : 1500,
        ).top,
      }}
      aria-hidden="true"
    />
  );
}
function localKey(day: Date): string {
  return `${String(day.getFullYear())}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
