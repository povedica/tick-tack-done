import { dateTimeFormat } from '../../lib/dates/formatters';
import { memo, useMemo, Fragment } from 'react';
import { Link } from 'react-router';
import type { Task } from '@reflexionia/sdk';
import { useAppLocale } from '../../i18n/locale';
import { useMessages } from '../../i18n';
import { TodayMark } from '../../components/period/TodayMark';
import { useCalendarToday } from '../../components/period/useCalendarToday';
import { useVerticalCalendarNavigation } from '../calendar/useVerticalCalendarNavigation';
import type { ExternalEventView } from '../calendar/ExternalEvent';
import type { SlotAnchor } from '../capture/calendar-slot';
import { isoWeek, localDateParam, monthCells } from './month';
import { buildDayIndex, type DaySummary } from './year-index';

const FULL_YEAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const EMPTY_DAY: DaySummary = { count: 0, colors: [] };

export function YearBoard({
  year,
  onMove,
  months,
  events = [],
  tasks,
  weekStart,
  colors,
  onOpen,
  onCreateDay,
}: {
  readonly onCreateDay?: ((day: string, anchor: SlotAnchor) => void) | undefined;
  readonly year: number;
  readonly onMove?: (delta: number) => void;
  readonly months?: readonly number[];
  readonly events?: readonly ExternalEventView[];
  readonly tasks: readonly Task[];
  readonly weekStart: 'monday' | 'sunday';
  readonly colors: ReadonlyMap<string, string>;
  readonly onOpen: (month: number) => void;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const todayKey = useCalendarToday();
  const verticalNavigation = useVerticalCalendarNavigation(onMove);
  const shown = months ?? FULL_YEAR;
  const showWeekNumbers = shown.length === 3;
  const monthName = useMemo(() => dateTimeFormat(locale, { month: 'long' }), [locale]);
  const whenFormat = useMemo(
    () => dateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
    [locale],
  );
  const heads = useMemo(() => {
    const weekday = dateTimeFormat(locale, { weekday: 'narrow' });
    return monthCells(new Date(year, 0, 1), weekStart)
      .slice(0, 7)
      .map((day) => weekday.format(day));
  }, [locale, year, weekStart]);
  const dayIndex = useMemo(
    () => buildDayIndex(tasks, events, colors, { fallbackZone: 'Europe/Madrid' }),
    [tasks, events, colors],
  );
  return (
    <div
      className={showWeekNumbers ? 'year-board is-quarter' : 'year-board'}
      tabIndex={onMove ? 0 : undefined}
      onKeyDown={(event) => {
        if (
          !onMove ||
          event.target !== event.currentTarget ||
          !['PageUp', 'PageDown'].includes(event.key)
        )
          return;
        event.preventDefault();
        onMove(event.key === 'PageDown' ? 1 : -1);
      }}
      {...verticalNavigation}
    >
      {shown.map((month) => (
        <MonthCard
          key={month}
          year={year}
          month={month}
          weekStart={weekStart}
          todayKey={monthTouchesDay(year, month, weekStart, todayKey) ? todayKey : null}
          index={dayIndex}
          heads={heads}
          showWeekNumbers={showWeekNumbers}
          monthLabel={monthName.format(new Date(year, month, 1))}
          whenFormat={whenFormat}
          itemLabel={messages.calendarItem}
          itemsLabel={messages.calendarItems}
          onOpen={onOpen}
          {...(onCreateDay === undefined ? {} : { onCreateDay })}
        />
      ))}
    </div>
  );
}

const MonthCard = memo(function MonthCard({
  year,
  month,
  weekStart,
  todayKey,
  index,
  heads,
  showWeekNumbers,
  monthLabel,
  whenFormat,
  itemLabel,
  itemsLabel,
  onOpen,
  onCreateDay,
}: {
  readonly year: number;
  readonly month: number;
  readonly weekStart: 'monday' | 'sunday';
  readonly todayKey: string | null;
  readonly index: ReadonlyMap<string, DaySummary>;
  readonly heads: readonly string[];
  readonly showWeekNumbers: boolean;
  readonly monthLabel: string;
  readonly whenFormat: Intl.DateTimeFormat;
  readonly itemLabel: string;
  readonly itemsLabel: string;
  readonly onOpen: (month: number) => void;
  readonly onCreateDay?: (day: string, anchor: SlotAnchor) => void;
}) {
  const cells = monthCells(new Date(year, month, 1), weekStart);
  return (
    <section className="year-card">
      <button
        type="button"
        className="year-month"
        onClick={() => {
          onOpen(month);
        }}
      >
        {monthLabel}
      </button>
      <div
        className="year-mini"
        style={
          showWeekNumbers ? { gridTemplateColumns: '1.5rem repeat(7,minmax(0,1fr))' } : undefined
        }
      >
        {showWeekNumbers ? <span className="year-dow">S</span> : null}
        {heads.map((label, headIndex) => (
          <span key={`${label}-${String(headIndex)}`} className="year-dow">
            {label}
          </span>
        ))}
        {cells.map((day, cellIndex) => {
          const key = localDateParam(day);
          const inside = day.getMonth() === month;
          const today = key === todayKey;
          const summary = inside ? (index.get(key) ?? EMPTY_DAY) : EMPTY_DAY;
          return (
            <Fragment key={key}>
              {showWeekNumbers && cellIndex % 7 === 0 ? (
                <span className="year-week-number">{isoWeek(day)}</span>
              ) : null}
              {inside ? (
                <Link
                  className={dayClass(true, today)}
                  onClick={(event) => {
                    if (
                      onCreateDay === undefined ||
                      (event.target instanceof Element && event.target.closest('.year-num'))
                    )
                      return;
                    event.preventDefault();
                    onCreateDay(key, {
                      element: event.currentTarget,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  to={`/calendar/day?date=${key}`}
                  aria-current={today ? 'date' : undefined}
                  aria-label={`${whenFormat.format(day)}, ${String(summary.count)} ${summary.count === 1 ? itemLabel : itemsLabel}`}
                >
                  <TodayMark className="year-num" today={today}>
                    {day.getDate()}
                  </TodayMark>
                  <span className="year-marks" aria-hidden="true">
                    {summary.colors.map((color, markIndex) => (
                      <i key={`${color}-${String(markIndex)}`} style={{ background: color }} />
                    ))}
                  </span>
                </Link>
              ) : (
                <span className={dayClass(false, today)} aria-hidden="true">
                  <TodayMark className="year-num" today={today}>
                    {day.getDate()}
                  </TodayMark>
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
});

function dayClass(inside: boolean, today: boolean): string {
  return ['year-day', inside ? '' : 'is-outside', today ? 'is-today' : '']
    .filter((item) => item.length > 0)
    .join(' ');
}

function monthTouchesDay(
  year: number,
  month: number,
  weekStart: 'monday' | 'sunday',
  todayKey: string,
): boolean {
  const cells = monthCells(new Date(year, month, 1), weekStart);
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (first === undefined || last === undefined) {
    return false;
  }
  const start = localDateParam(first);
  const end = localDateParam(last);
  return todayKey >= start && todayKey <= end;
}
