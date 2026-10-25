import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useWtFMessages } from '../i18n-wt-f';
import { useAppLocale } from '../../../i18n/locale';
import type { LoadDay } from '../api';
import { loadPhrase } from './projectPlan';
export function DayRail({
  days,
  selected,
  onSelect,
}: {
  readonly days: readonly LoadDay[];
  readonly selected: string;
  readonly onSelect: (date: string) => void;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const [offset, setOffset] = useState(0);
  const index = Math.max(
    0,
    days.findIndex((d) => d.date === selected),
  );
  useEffect(() => {
    if (index < offset) setOffset(index);
    else if (index > offset + 4) setOffset(Math.min(Math.max(0, days.length - 5), index - 4));
  }, [index, offset, days.length]);
  function shift(delta: number) {
    const next = Math.max(0, Math.min(days.length - 1, index + delta));
    const date = days[next]?.date;
    if (date) onSelect(date);
  }
  return (
    <div className="sp-rail">
      <button
        type="button"
        aria-label={m.previousDay}
        disabled={index === 0}
        onClick={() => shift(-1)}
      >
        <ChevronLeft size={15} />
      </button>
      <div className="sp-days" role="tablist" aria-label={m.when}>
        {days.slice(offset, offset + 5).map((day) => {
          const i = days.indexOf(day);
          const name =
            i === 0
              ? m.today
              : i === 1
                ? m.tomorrow
                : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
                    new Date(`${day.date}T12:00Z`),
                  );
          return (
            <button
              type="button"
              role="tab"
              aria-selected={day.date === selected}
              aria-label={`${name} ${day.date.slice(8)}: ${loadPhrase(day, m)}`}
              key={day.date}
              data-plan-day={day.date}
              className={`sp-day ${day.date === selected ? 'is-on' : ''} is-${day.available_minutes === null ? 'off' : day.status === 'overload' ? 'over' : day.status}`}
              onClick={() => onSelect(day.date)}
            >
              <span>{name}</span>
              <b>{day.date.slice(8)}</b>
              <i />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={m.nextDayRail}
        disabled={index === days.length - 1}
        onClick={() => shift(1)}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
