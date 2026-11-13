import { dateTimeFormat } from '../../../lib/dates/formatters';
import { CalendarDays } from 'lucide-react';
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { Task } from '@reflexionia/sdk';
import { TodayMark } from '../../../components/period/TodayMark';
import { useCalendarToday } from '../../../components/period/useCalendarToday';
import { useVerticalCalendarNavigation } from '../useVerticalCalendarNavigation';
import { useWtAMessages } from '../i18n-wt-a';
import { CalendarTaskMark } from '../CalendarTaskMark';
import { chipStyle, type ExternalEventView } from '../ExternalEvent';
import { allDaySlot, type CalendarSlot, type SlotAnchor } from '../../capture/calendar-slot';
import { taskQueryHref } from '../../../shell/use-open-task';
import { formatDueTime } from '../../today/groups';
import type { Messages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { useCalendarDrag } from '../../places/use-calendar-drag';
import type { CalendarTaskChange } from '../../places/use-calendar-task-change';
import { eventDayRange, eventSpan } from '../../places/event-span';
import { calendarTaskLabel, isCalendarOverdue, isoWeek, overflowHref } from '../../places/month';
import { buildCalendarDayIndex, eventsForDay, tasksForDay } from '../data/day-index';
import { chipLabel, clockLabel, localKey, mixChips } from '../data/chips';

export const MonthView = memo(function MonthView({
  onTaskChange,
  days,
  columns,
  tasks,
  events = [],
  colors = new Map<string, string>(),
  onOpenEvent,
  messages,
  cursor,
  outsideMonth,
  onNavigate,
  onPick,
  dots = false,
  monthView = false,
  onCreateAt,
  draftingDay,
  timeZone = 'Europe/Madrid',
}: {
  readonly onTaskChange?: CalendarTaskChange | undefined;
  readonly onCreateAt?: ((slot: CalendarSlot, anchor: SlotAnchor) => void) | undefined;
  readonly draftingDay?: string | null;
  readonly timeZone?: string;
  readonly days: readonly Date[];
  readonly columns: number;
  readonly tasks: readonly Task[];
  readonly events?: readonly ExternalEventView[];
  readonly colors?: ReadonlyMap<string, string>;
  readonly onOpenEvent?: (event: ExternalEventView) => void;
  readonly messages: Messages;
  readonly cursor: Date;
  readonly outsideMonth: boolean;
  readonly onNavigate?: ((delta: number) => void) | undefined;
  readonly onPick?: (dayKey: string, anchor?: HTMLElement) => void;
  readonly dots?: boolean;
  readonly monthView?: boolean;
}) {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => {
      setNarrow(media.matches);
    };
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, []);
  const compact = dots || (monthView && narrow);
  const dotLimit = monthView ? 3 : 4;
  const location = useLocation();
  const locale = useAppLocale();
  const own = useWtAMessages();
  const verticalNavigation = useVerticalCalendarNavigation(onNavigate);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useCalendarDrag(grid, timeZone, onTaskChange);
  const [overflow, setOverflow] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const counts: Record<string, number> = {};
      const barSpace = new Map<number, number>();
      const hiddenBars = new Map<string, number>();
      const visibleBars = new Map<string, number>();
      for (const bar of node.querySelectorAll<HTMLElement>('.calendar-month-span')) {
        const week = Number(bar.dataset.week);
        const cell = node.querySelector<HTMLElement>(`[data-week="${String(week)}"].cal-cell`);
        const offset = barSpace.get(week) ?? 0;
        const height = bar.getBoundingClientRect().height;
        const covered = [
          ...node.querySelectorAll<HTMLElement>(`.cal-cell[data-week="${String(week)}"]`),
        ].filter((cell) => {
          const col = Number(cell.dataset.column);
          return (
            col >= Number(bar.dataset.column) &&
            col < Number(bar.dataset.column) + Number(bar.dataset.span)
          );
        });
        const visible =
          !!cell &&
          offset + height <= cell.clientHeight * 0.5 &&
          (!monthView ||
            covered.every((cell) => (visibleBars.get(cell.dataset.day ?? '') ?? 0) < 3));
        bar.style.marginTop = `${String(32 + offset)}px`;
        bar.style.visibility = visible ? 'visible' : 'hidden';
        bar.inert = !visible;
        bar.setAttribute('aria-hidden', String(!visible));
        if (visible) {
          barSpace.set(week, offset + height + 3);
          for (const cell of covered) {
            const key = cell.dataset.day ?? '';
            visibleBars.set(key, (visibleBars.get(key) ?? 0) + 1);
          }
        } else
          for (const cell of node.querySelectorAll<HTMLElement>(
            `.cal-cell[data-week="${String(week)}"]`,
          )) {
            const col = Number(cell.dataset.column);
            if (
              col >= Number(bar.dataset.column) &&
              col < Number(bar.dataset.column) + Number(bar.dataset.span)
            ) {
              const key = cell.dataset.day ?? '';
              hiddenBars.set(key, (hiddenBars.get(key) ?? 0) + 1);
            }
          }
      }
      for (const cell of node.querySelectorAll<HTMLElement>('.cal-cell')) {
        const key = cell.dataset.day ?? '';
        const list = cell.querySelector<HTMLElement>('.calendar-cell-items');
        if (!list) continue;
        const space = window.innerWidth <= 700 ? 0 : (barSpace.get(Number(cell.dataset.week)) ?? 0);
        list.style.marginTop = `${String(space)}px`;
        const children = [...list.children] as HTMLElement[];
        const room = cell.clientHeight - list.offsetTop - 4;
        const heights = children.map((child) => child.offsetHeight + 3);
        const total = heights.reduce((sum, height) => sum + height, 0);
        const maxItems = monthView
          ? Math.max(0, 3 - (visibleBars.get(key) ?? 0))
          : node.closest('.calendar-two-weeks')
            ? 5
            : Number.POSITIVE_INFINITY;
        const reserve = total > room || children.length > maxItems || hiddenBars.has(key) ? 26 : 0;
        let used = 0;
        let hidden = hiddenBars.get(key) ?? 0;
        children.forEach((child, index) => {
          used += heights[index] ?? 0;
          const visible = index < maxItems && used <= room - reserve;
          child.style.visibility = visible ? 'visible' : 'hidden';
          child.inert = !visible;
          child.setAttribute('aria-hidden', String(!visible));
          if (!visible) hidden++;
        });
        counts[key] = hidden;
      }
      setOverflow((previous) =>
        JSON.stringify(previous) === JSON.stringify(counts) ? previous : counts,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    node
      .querySelectorAll('.cal-cell, .calendar-cell-items > *, .calendar-month-span')
      .forEach((child) => {
        observer.observe(child);
      });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [days, tasks, events, monthView]);
  const todayKey = useCalendarToday();
  const dayIndex = useMemo(() => buildCalendarDayIndex(tasks, events), [tasks, events]);
  const weekday = dateTimeFormat(locale, { weekday: 'short' });
  const heads = Array.from({ length: columns }, (_, index) =>
    weekday.format(days[index] ?? cursor),
  );
  const weeks = Array.from({ length: Math.ceil(days.length / columns) }, (_, index) =>
    days.slice(index * columns, (index + 1) * columns),
  );
  const bars = weeks.flatMap((week, weekIndex) =>
    events
      .filter(
        (event) => event.is_all_day && eventDayRange(event).start !== eventDayRange(event).end,
      )
      .flatMap((event) => {
        const position = eventSpan(event, week);
        return position ? [{ event, position, weekIndex }] : [];
      }),
  );
  return (
    <div
      ref={grid}
      {...verticalNavigation}
      className={compact ? 'cal-month is-dots' : 'cal-month'}
      style={{
        gridTemplateColumns: `${compact ? '' : '2rem '}repeat(${String(columns)}, minmax(0, 1fr))`,
      }}
    >
      <span id={drag.helpId} className="sr-only">
        {messages.calendarDragHelp}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
      {!compact ? (
        <div
          className="cal-head"
          aria-label={messages.calWeekNumber}
          title={messages.calWeekNumber}
        >
          {own.calWeekShort}
        </div>
      ) : null}
      {heads.map((label, index) => (
        <div key={`${label}-${String(index)}`} className="cal-head">
          {label}
        </div>
      ))}
      {days.map((day, index) => {
        const key = localKey(day);
        const items = tasksForDay(dayIndex, key);
        const dayEvents = eventsForDay(dayIndex, key);
        const chips = mixChips(items, dayEvents);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const outside = outsideMonth && day.getMonth() !== cursor.getMonth();
        const href = overflowHref(day);
        const classes = [
          'cal-cell',
          key === draftingDay ? 'is-drafting' : '',
          weekend ? 'is-weekend' : '',
          key === todayKey ? 'is-today' : '',
          outside ? 'is-outside' : '',
        ]
          .filter((item) => item.length > 0)
          .join(' ');
        return (
          <Fragment key={key}>
            {!compact && index % columns === 0 ? (
              <span
                className="cal-week-number"
                style={{ gridColumn: 1, gridRow: Math.floor(index / columns) + 2 }}
              >
                {isoWeek(day)}
              </span>
            ) : null}
            <div
              className={classes}
              tabIndex={onCreateAt ? 0 : undefined}
              role={onCreateAt ? 'gridcell' : undefined}
              aria-label={
                onCreateAt
                  ? messages.calendarQuickCreateAt.replace(
                      '{name}',
                      day.toLocaleDateString(locale, { dateStyle: 'full' }),
                    )
                  : undefined
              }
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  !event.target.closest('button, a, input, .calendar-cell-task')
                )
                  onCreateAt?.(allDaySlot(key, timeZone), {
                    x: event.clientX,
                    y: event.clientY,
                    element: event.currentTarget,
                  });
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  onCreateAt?.(allDaySlot(key, timeZone), {
                    x: box.right,
                    y: box.top,
                    element: event.currentTarget,
                  });
                }
              }}
              data-calendar-drop-day={key}
              data-calendar-drop-kind="day"
              data-day={key}
              data-week={Math.floor(index / columns)}
              data-column={(index % columns) + 2}
              style={{
                gridColumn: (index % columns) + (compact ? 1 : 2),
                gridRow: Math.floor(index / columns) + 2,
              }}
              title={
                compact
                  ? chips
                      .map((chip) => (chip.kind === 'task' ? chip.task.title : chip.event.title))
                      .join(' · ')
                  : undefined
              }
            >
              <strong>
                {onPick !== undefined ? (
                  <button
                    type="button"
                    aria-label={`${day.toLocaleDateString(locale, { dateStyle: 'full' })}, ${String(chips.length)} ${chips.length === 1 ? messages.calendarItem : messages.calendarItems}`}
                    aria-current={key === todayKey ? 'date' : undefined}
                    onClick={(event) => {
                      onPick(key, event.currentTarget);
                    }}
                  >
                    <TodayMark today={key === todayKey}>{day.getDate()}</TodayMark>
                  </button>
                ) : (
                  <Link to={href}>
                    <TodayMark today={key === todayKey}>{day.getDate()}</TodayMark>
                  </Link>
                )}
              </strong>
              <span className="cal-dots" aria-hidden="true">
                {(compact ? chips.slice(0, dotLimit) : chips).map((chip) => (
                  <i
                    key={chip.kind === 'task' ? chip.task.id : chip.event.id}
                    style={{
                      background:
                        chip.kind === 'task'
                          ? (colors.get(chip.task.project_id) ?? 'var(--accent)')
                          : (chip.event.color ?? 'var(--accent)'),
                    }}
                  />
                ))}
              </span>
              <div className="calendar-cell-items">
                {compact
                  ? null
                  : chips
                      .filter(
                        (chip) =>
                          chip.kind === 'task' ||
                          !chip.event.is_all_day ||
                          eventDayRange(chip.event).start === eventDayRange(chip.event).end,
                      )
                      .map((chip) =>
                        chip.kind === 'task' ? (
                          <div
                            key={chip.task.id}
                            {...drag.bindTask(chip.task, true)}
                            className="calendar-cell-task calendar-chip"
                            style={chipStyle(colors.get(chip.task.project_id))}
                          >
                            <CalendarTaskMark task={chip.task} />
                            <Link
                              title={chipLabel(chip.task, messages.untitled, locale)}
                              className={
                                isCalendarOverdue(
                                  chip.task.due_date,
                                  chip.task.time_zone,
                                  new Date(),
                                  chip.task.start_date,
                                )
                                  ? 'cal-pill is-overdue'
                                  : 'cal-pill'
                              }
                              to={taskQueryHref(location.pathname, location.search, chip.task.id)}
                            >
                              {calendarTaskLabel(
                                chip.task.title,
                                chip.task.due_date,
                                chip.task.time_zone,
                                messages.untitled,
                              )}
                            </Link>
                            {!chip.task.is_all_day && chip.task.due_date ? (
                              <time dateTime={chip.task.due_date}>
                                {formatDueTime(chip.task.due_date, chip.task.time_zone, locale)}
                              </time>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            key={chip.event.id}
                            {...drag.external}
                            title={chip.event.title}
                            type="button"
                            className="cal-pill calendar-chip"
                            style={chipStyle(chip.event.color)}
                            onClick={() => {
                              onOpenEvent?.(chip.event);
                            }}
                          >
                            <CalendarDays
                              size={13}
                              aria-hidden="true"
                              className="calendar-event-mark"
                            />
                            <span>{chip.event.title}</span>
                            {!chip.event.is_all_day ? (
                              <time dateTime={chip.event.starts_at}>
                                {localKey(day) > eventDayRange(chip.event).start
                                  ? '00:00'
                                  : clockLabel(chip.event.starts_at, locale)}
                              </time>
                            ) : null}
                          </button>
                        ),
                      )}
              </div>
              {(compact ? chips.length - dotLimit : (overflow[key] ?? 0)) > 0 ? (
                <button
                  type="button"
                  className="calendar-overflow"
                  onClick={(event) => onPick?.(key, event.currentTarget)}
                >
                  +{compact ? chips.length - dotLimit : overflow[key]}{' '}
                  {compact && !monthView
                    ? null
                    : messages.calendarMoreViews.toLocaleLowerCase(locale)}
                </button>
              ) : null}
            </div>
          </Fragment>
        );
      })}
      {!dots
        ? bars.map((bar) => {
            return (
              <button
                key={`${bar.event.id}-${String(bar.weekIndex)}`}
                {...drag.external}
                type="button"
                className="cal-pill calendar-month-span calendar-chip"
                aria-label={bar.event.title}
                title={bar.event.title}
                data-week={bar.weekIndex}
                data-column={bar.position.column}
                data-span={bar.position.span}
                style={{
                  ...chipStyle(bar.event.color),
                  gridColumn: `${String(bar.position.column - (compact ? 1 : 0))} / span ${String(bar.position.span)}`,
                  gridRow: bar.weekIndex + 2,
                }}
                onClick={() => {
                  onOpenEvent?.(bar.event);
                }}
              >
                <CalendarDays size={13} aria-hidden="true" />
                <span>{bar.event.title}</span>
              </button>
            );
          })
        : null}
    </div>
  );
});
