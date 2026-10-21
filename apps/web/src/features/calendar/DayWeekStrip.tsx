import { useRef } from 'react';
import { useAppLocale } from '../../i18n/locale';
import { useMessages } from '../../i18n';
import { useCalendarToday } from '../../components/period/useCalendarToday';
import { localDateParam, spanDays, startOfWeek } from '../places/month';

export function DayWeekStrip({
  selected,
  weekStart,
  onSelect,
}: {
  readonly selected: Date;
  readonly weekStart: 'monday' | 'sunday';
  readonly onSelect: (day: Date) => void;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const today = useCalendarToday();
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(0);
  const days = spanDays(startOfWeek(selected, weekStart), 7);
  const shiftWeek = (delta: number) => {
    onSelect(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + delta * 7));
  };
  return (
    <div
      className="calendar-day-week-strip"
      role="group"
      aria-label={messages.calWeek}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !['PageUp', 'PageDown'].includes(event.key))
          return;
        event.preventDefault();
        shiftWeek(event.key === 'PageDown' ? 1 : -1);
      }}
      onPointerDown={(event) => {
        gesture.current =
          event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
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
        if (Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          suppressClick.current = Date.now() + 400;
          shiftWeek(dx < 0 ? 1 : -1);
        }
      }}
      onClickCapture={(event) => {
        if (Date.now() < suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {days.map((day) => {
        const key = localDateParam(day);
        const active = key === localDateParam(selected);
        return (
          <button
            key={key}
            type="button"
            className={active ? 'is-selected' : ''}
            aria-label={day.toLocaleDateString(locale, { dateStyle: 'full' })}
            aria-pressed={active}
            aria-current={key === today ? 'date' : undefined}
            onClick={() => {
              onSelect(day);
            }}
          >
            <span className="calendar-day-weekday">
              {day.toLocaleDateString(locale, { weekday: 'short' })}
            </span>
            <span className="calendar-day-number">{day.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
