import { TodayMark } from '../components/period/TodayMark';
import { useCalendarToday } from '../components/period/useCalendarToday';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMessages } from '../i18n';
import { useAppLocale } from '../i18n/locale';
import { usePreferences } from '../theme/preferences';
import { localDateParam, monthCells } from '../features/places/month';
import { CalendarSources } from '../features/calendar/CalendarSources';

/**
 * TTD-AUD-61: calendar-specific secondary sidebar with mini-month.
 * Source checkboxes can move here from the calendar ⋯ menu in a later pass.
 */
export function CalendarSidebar({
  collapsed,
  concealed,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly concealed: boolean;
  readonly onNavigate?: () => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const weekStart = usePreferences((state) => state.weekStart);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const cells = useMemo(() => monthCells(cursor, weekStart), [cursor, weekStart]);
  const todayKey = useCalendarToday();
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    cursor,
  );
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const heads = Array.from({ length: 7 }, (_, index) => {
    const sample = cells[index] ?? cursor;
    return weekday.format(sample);
  });
  return (
    <aside
      id="section-sidebar"
      className="sidebar calendar-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-concealed={concealed ? 'true' : 'false'}
      aria-label={messages.calendarSidebarTitle}
      aria-hidden={concealed ? true : undefined}
      inert={concealed ? true : undefined}
    >
      <div className="sidebar-block calendar-mini">
        <div className="calendar-mini-nav">
          <button
            type="button"
            aria-label={messages.calPrev}
            onClick={() => {
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
            }}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            aria-label={messages.calNext}
            onClick={() => {
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
            }}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="calendar-mini-grid" role="grid" aria-label={monthLabel}>
          {heads.map((label, index) => (
            <span key={`${label}-${String(index)}`} className="calendar-mini-head">
              {label}
            </span>
          ))}
          {cells.map((day) => {
            const key = localDateParam(day);
            const outside = day.getMonth() !== cursor.getMonth();
            return (
              <Link
                key={key}
                aria-current={key === todayKey ? 'date' : undefined}
                to={`/calendar/day?date=${key}`}
                className={[
                  'calendar-mini-day',
                  outside ? 'is-outside' : '',
                  key === todayKey ? 'is-today' : '',
                ]
                  .filter((item) => item.length > 0)
                  .join(' ')}
                onClick={() => {
                  onNavigate?.();
                }}
              >
                <TodayMark today={key === todayKey}>{day.getDate()}</TodayMark>
              </Link>
            );
          })}
        </div>
      </div>
      <CalendarSources />
    </aside>
  );
}
