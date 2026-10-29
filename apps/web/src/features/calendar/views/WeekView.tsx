import { CalendarDays } from 'lucide-react';
import { dateTimeFormat } from '../../../lib/dates/formatters';
import { memo, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import type { Task } from '@reflexionia/sdk';
import { TodayMark } from '../../../components/period/TodayMark';
import { useCalendarToday } from '../../../components/period/useCalendarToday';
import { CalendarTaskMark } from '../CalendarTaskMark';
import { chipStyle, type ExternalEventView } from '../ExternalEvent';
import type { SlotAnchor } from '../../capture/calendar-slot';
import { taskQueryHref } from '../../../shell/use-open-task';
import { useMessages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { useCalendarDrag } from '../../places/use-calendar-drag';
import type { CalendarTaskChange } from '../../places/use-calendar-task-change';
import { isCalendarOverdue, isoWeek, monthCells } from '../../places/month';
import { displayTitle } from '../../tasks/displayTitle';
import { buildCalendarDayIndex, eventsForDay, tasksForDay } from '../data/day-index';
import { mixChips } from '../data/chips';
import { createInDaySpace, createInDaySpaceWithKey } from './day-space';
import { localKey } from '../data/chips';

export const WeekView = memo(function WeekView({
  onTaskChange,
  days,
  cursor,
  tasks,
  events,
  colors,
  weekStart,
  timeZone,
  onMove,
  onOpenEvent,
  onCreateDay,
}: {
  readonly onTaskChange?: CalendarTaskChange | undefined;
  readonly onCreateDay?: ((day: string, anchor: SlotAnchor) => void) | undefined;
  days: readonly Date[];
  cursor: Date;
  tasks: readonly Task[];
  events: readonly ExternalEventView[];
  colors: ReadonlyMap<string, string>;
  weekStart: 'monday' | 'sunday';
  timeZone: string;
  onMove: (delta: number) => void;
  onOpenEvent: (event: ExternalEventView) => void;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const today = useCalendarToday();
  const location = useLocation();
  const board = useRef<HTMLDivElement>(null);
  const drag = useCalendarDrag(board, timeZone, onTaskChange);
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const suppressClick = useRef(0);
  const mini = monthCells(cursor, weekStart);
  const selected = new Set(days.map(localKey));
  const time = dateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone });
  const dayIndex = useMemo(
    () => buildCalendarDayIndex(tasks, events, timeZone, timeZone),
    [tasks, events, timeZone],
  );
  return (
    <div
      ref={board}
      className={`mobile-week-board${days.length === 5 ? ' is-workweek' : ''}`}
      tabIndex={0}
      aria-label={messages.calWeek}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          !['ArrowLeft', 'ArrowRight'].includes(event.key)
        )
          return;
        event.preventDefault();
        onMove(event.key === 'ArrowLeft' ? -1 : 1);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch' || !event.isPrimary) {
          gesture.current = null;
          return;
        }
        gesture.current = { x: event.clientX, y: event.clientY, at: Date.now() };
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (
          Date.now() - start.at < 700 &&
          Math.abs(dx) >= 65 &&
          Math.abs(dx) > Math.abs(dy) * 1.5
        ) {
          suppressClick.current = Date.now() + 400;
          onMove(dx < 0 ? 1 : -1);
        }
      }}
      onClickCapture={(event) => {
        if (Date.now() < suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <span id={drag.helpId} className="sr-only">
        {messages.calendarDragHelp}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
      <div className="mobile-week-mini" aria-label={messages.calendarSidebarTitle}>
        {mini.slice(0, 7).map((day) => (
          <span className="mobile-week-dow" key={localKey(day)}>
            {day.toLocaleDateString(locale, { weekday: 'narrow' })}
          </span>
        ))}
        {mini.map((day) => {
          const key = localKey(day);
          return (
            <Link
              key={key}
              to={`/calendar/week?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), date: key })}`}
              aria-label={day.toLocaleDateString(locale, { dateStyle: 'full' })}
              aria-current={key === today ? 'date' : undefined}
              className={`${selected.has(key) ? 'is-selected' : ''} ${day.getMonth() !== cursor.getMonth() ? 'is-outside' : ''}`}
            >
              <TodayMark today={key === today}>{day.getDate()}</TodayMark>
            </Link>
          );
        })}
      </div>
      {days.map((day, index) => {
        const key = localKey(day);
        const chips = mixChips(tasksForDay(dayIndex, key), eventsForDay(dayIndex, key));
        return (
          <section
            className="mobile-week-day"
            data-calendar-drop-day={key}
            data-calendar-drop-kind="day"
            tabIndex={onCreateDay ? 0 : undefined}
            onKeyDown={(event) => {
              createInDaySpaceWithKey(event, key, onCreateDay);
            }}
            onClick={(event) => {
              createInDaySpace(event, key, onCreateDay);
            }}
            key={key}
            aria-label={day.toLocaleDateString(locale, { dateStyle: 'full' })}
          >
            <header>
              <Link
                className="mobile-week-day-link"
                to={`/calendar/day?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), date: key })}`}
                aria-current={key === today ? 'date' : undefined}
              >
                {day.toLocaleDateString(locale, { weekday: 'short' })}{' '}
                <TodayMark today={key === today}>{day.getDate()}</TodayMark>
              </Link>
              {index === 0 ? <small>S{isoWeek(day)}</small> : null}
            </header>
            <div className="mobile-week-items">
              {chips.map((item) => {
                if (item.kind === 'event') {
                  const event = item.event;
                  return (
                    <button
                      type="button"
                      {...drag.external}
                      className="mobile-week-chip calendar-chip"
                      key={`event-${event.id}`}
                      style={chipStyle(event.color)}
                      onClick={() => {
                        onOpenEvent(event);
                      }}
                    >
                      <CalendarDays size={12} aria-hidden="true" />
                      <span>{event.title}</span>
                      {!event.is_all_day ? (
                        <time>{time.format(new Date(event.starts_at))}</time>
                      ) : null}
                    </button>
                  );
                }
                const task = item.task;
                return (
                  <div
                    {...drag.bindTask(task, true)}
                    className="mobile-week-chip calendar-chip"
                    key={task.id}
                    style={chipStyle(colors.get(task.project_id))}
                  >
                    <CalendarTaskMark task={task} />
                    <Link
                      className={
                        isCalendarOverdue(
                          task.due_date,
                          task.time_zone,
                          new Date(),
                          task.start_date,
                        )
                          ? 'is-overdue'
                          : undefined
                      }
                      to={taskQueryHref(location.pathname, location.search, task.id)}
                    >
                      {displayTitle(task.title)}
                    </Link>
                    {!task.is_all_day && task.due_date ? (
                      <time>{time.format(new Date(task.due_date))}</time>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
});
