import { useState } from 'react';
import { useAppLocale } from '../../i18n/locale';
import { usePreferences } from '../../theme/preferences';

export function DueField({
  value,
  dateLabel,
  timeLabel,
  emptyLabel,
  clearLabel,
  previousLabel,
  nextLabel,
  onCommit,
}: {
  readonly value: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly emptyLabel: string;
  readonly clearLabel: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly onCommit: (next: string) => void;
}) {
  const weekStart = usePreferences((state) => state.weekStart);
  const locale = useAppLocale();
  const [open, setOpen] = useState(false);
  const day = value.length >= 10 ? value.slice(0, 10) : '';
  const time = value.length >= 16 ? value.slice(11, 16) : '09:00';
  const [cursor, setCursor] = useState(() => monthOf(day));
  const label = day.length === 0 ? emptyLabel : formatDue(value, locale);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const shift = (start.getDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(index - shift + 1);
    return date;
  });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const heads = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 0, weekStart === 'monday' ? 5 + index : 4 + index);
    return weekday.format(date);
  });
  const today = localKey(new Date());

  return (
    <div className="due-field">
      <span>{dateLabel}</span>
      <button
        type="button"
        className="due-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setCursor(monthOf(day));
          setOpen((current) => !current);
        }}
      >
        {label}
      </button>
      {open ? (
        <div className="due-pop" role="dialog" aria-label={dateLabel}>
          <div className="cal-toolbar">
            <button
              type="button"
              aria-label={previousLabel}
              onClick={() => {
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
              }}
            >
              ‹
            </button>
            <strong className="cal-title">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)}
            </strong>
            <button
              type="button"
              aria-label={nextLabel}
              onClick={() => {
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
              }}
            >
              ›
            </button>
          </div>
          <div className="cal-month">
            {heads.map((head) => (
              <div key={head} className="cal-head">
                {head}
              </div>
            ))}
            {cells.map((date) => {
              const key = localKey(date);
              const outside = date.getMonth() !== cursor.getMonth();
              const classes = [
                'cal-cell',
                key === today ? 'is-today' : '',
                key === day ? 'is-selected' : '',
                outside ? 'is-outside' : '',
              ]
                .filter((item) => item.length > 0)
                .join(' ');
              return (
                <div key={key} className={classes}>
                  <button
                    type="button"
                    onClick={() => {
                      onCommit(`${key}T${time}`);
                      setOpen(false);
                    }}
                  >
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
          <label className="due-time">
            {timeLabel}
            <input
              type="time"
              value={time}
              onChange={(event) => {
                const next = event.target.value;
                if (day.length === 0 || next.length === 0) {
                  return;
                }
                onCommit(`${day}T${next}`);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onCommit('');
              setOpen(false);
            }}
          >
            {clearLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function monthOf(day: string): Date {
  if (day.length >= 10) {
    const parsed = new Date(`${day}T00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function localKey(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDue(value: string, locale: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}
