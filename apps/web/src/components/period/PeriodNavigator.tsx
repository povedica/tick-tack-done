import { formatPeriodDate } from './period-date';
import { useAppLocale } from '../../i18n/locale';
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DatePopover } from '../DatePopover';
import { localDateParam } from '../../features/places/month';
import { calendarDay, zonedWallTime } from '../../features/today/groups';

/** Calendar and weekly report deliberately share the same project date selector. */
export function PeriodNavigator({
  title,
  date,
  onPick,
  className = 'calendar-period',
  label,
}: {
  readonly title: string;
  readonly date: Date;
  readonly onPick: (date: Date) => void;
  readonly className?: string;
  readonly label?: string;
}) {
  const locale = useAppLocale();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className={className}>
      <button
        type="button"
        ref={anchor}
        aria-label={`${label ?? title}, ${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span>{formatPeriodDate(date, locale)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <DatePopover
        mode="date-only"
        open={open}
        anchor={anchor}
        value={{
          dueDate: zonedWallTime(localDateParam(date), 0, 0, timeZone),
          allDay: true,
          durationMinutes: null,
          reminder: null,
          reminderTouched: false,
          repeatRule: null,
        }}
        timeZone={timeZone}
        onClose={() => {
          setOpen(false);
        }}
        onApply={(next) => {
          if (next.dueDate) onPick(new Date(`${calendarDay(next.dueDate, timeZone)}T12:00:00`));
          setOpen(false);
        }}
      />
    </div>
  );
}
