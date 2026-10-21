import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from '../../components/Popover';
import { useAppLocale } from '../../i18n/locale';
import { useMessages } from '../../i18n';
import { dayFromParam, localDateParam, monthCells } from '../places/month';
import { usePreferences } from '../../theme/preferences';

export function CalendarMenu({
  label,
  children,
  className = '',
  trigger,
}: {
  label: string;
  className?: string;
  trigger?: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    anchor.current?.focus();
  };
  return (
    <div className={className}>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        {trigger ?? label}
      </button>
      <Popover
        open={open}
        anchor={anchor}
        label={label}
        onClose={close}
        className="calendar-popover"
      >
        {children(close)}
      </Popover>
    </div>
  );
}

export function CalendarPeriod({
  title,
  date,
  onPick,
}: {
  title: string;
  date: Date;
  onPick: (date: Date) => void;
}) {
  const messages = useMessages();
  return (
    <CalendarMenu
      className="calendar-period"
      label={title}
      trigger={
        <>
          <h1>{title}</h1>
          <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <CalendarJump
          date={date}
          onPick={(next) => {
            onPick(next);
            close();
          }}
          label={messages.dateSet}
        />
      )}
    </CalendarMenu>
  );
}
function CalendarJump({
  date,
  onPick,
  label,
}: {
  date: Date;
  onPick: (date: Date) => void;
  label: string;
}) {
  const locale = useAppLocale();
  const messages = useMessages();
  const weekStart = usePreferences((state) => state.weekStart);
  const [month, setMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const cells = monthCells(month, weekStart);
  const today = localDateParam(new Date());
  const fullDate = (day: Date) => day.toLocaleDateString(locale, { dateStyle: 'full' });
  return (
    <div className="calendar-jump">
      <div className="calendar-jump-heading">
        <button
          type="button"
          aria-label={messages.calPrev}
          onClick={() => {
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
          }}
        >
          ‹
        </button>
        <strong aria-live="polite">
          {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </strong>
        <button
          type="button"
          aria-label={messages.calNext}
          onClick={() => {
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
          }}
        >
          ›
        </button>
      </div>
      <div className="calendar-jump-grid">
        {cells.slice(0, 7).map((day) => (
          <span key={localDateParam(day)}>
            {day.toLocaleDateString(locale, { weekday: 'narrow' })}
          </span>
        ))}
        {cells.map((day) => (
          <button
            type="button"
            key={localDateParam(day)}
            aria-label={fullDate(day)}
            aria-current={localDateParam(day) === today ? 'date' : undefined}
            aria-pressed={localDateParam(day) === localDateParam(date)}
            className={day.getMonth() !== month.getMonth() ? 'is-outside' : undefined}
            onKeyDown={(event) => {
              const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
              if (offset === undefined) return;
              event.preventDefault();
              const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset);
              const root = event.currentTarget.parentElement;
              const target = root?.querySelector<HTMLButtonElement>(
                `button[data-date="${localDateParam(next)}"]`,
              );
              if (target) target.focus();
              else {
                setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
                requestAnimationFrame(() =>
                  root
                    ?.querySelector<HTMLButtonElement>(
                      `button[data-date="${localDateParam(next)}"]`,
                    )
                    ?.focus(),
                );
              }
            }}
            data-date={localDateParam(day)}
            onClick={() => {
              onPick(day);
            }}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
      <label>
        {label}
        <input
          type="date"
          value={localDateParam(date)}
          onChange={(event) => {
            const next = dayFromParam(event.target.value);
            if (next) onPick(next);
          }}
        />
      </label>
    </div>
  );
}
