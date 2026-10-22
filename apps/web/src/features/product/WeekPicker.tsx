import { TodayMark } from '../../components/period/TodayMark';
import { useCalendarToday } from '../../components/period/useCalendarToday';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { shiftDayKey } from '../today/groups';
import { useWeeklyCopy } from './weekly-text';

function monday(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDayKey(date, -(weekday === 0 ? 6 : weekday - 1));
}

export function WeekPicker({
  value,
  available,
  onSelect,
}: {
  readonly value: string;
  readonly available: readonly string[];
  readonly today: string;
  readonly onSelect: (week: string) => void;
}) {
  const copy = useWeeklyCopy();
  const today = useCalendarToday();
  const selected = value || monday(today);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected.slice(0, 7));
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(copy.locale, { ...options, timeZone: 'UTC' });
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  function pick(date: string) {
    onSelect(monday(date));
    close();
  }
  function moveMonth(offset: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(date.toISOString().slice(0, 7));
  }
  const first = monday(`${month}-01`);
  const days = Array.from({ length: 42 }, (_, i) => shiftDayKey(first, i));
  return (
    <>
      <div className="week-navigation">
        <Button
          variant="ghost"
          aria-label={copy.previousWeek}
          onClick={() => {
            onSelect(shiftDayKey(selected, -7));
          }}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </Button>
        <button
          ref={trigger}
          className="week-range"
          aria-label={`${copy.selectWeek}: ${label(selected, { day: 'numeric', month: 'long', year: 'numeric' })}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setMonth(selected.slice(0, 7));
            setOpen(true);
          }}
        >
          {label(selected, { day: 'numeric', month: 'short' })} –{' '}
          {label(shiftDayKey(selected, 6), { day: 'numeric', month: 'short' })}
        </button>
        <Button
          variant="ghost"
          aria-label={copy.nextWeek}
          onClick={() => {
            onSelect(shiftDayKey(selected, 7));
          }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </Button>
      </div>
      {open ? (
        <dialog
          className="week-calendar"
          ref={dialog}
          aria-label={copy.selectWeek}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="week-calendar-head">
            <h2>{copy.selectWeek}</h2>
            <Button variant="ghost" aria-label={copy.close} onClick={close}>
              <X size={18} aria-hidden="true" />
            </Button>
          </div>
          <div className="week-month-nav">
            <Button
              variant="ghost"
              aria-label={copy.previousMonth}
              onClick={() => {
                moveMonth(-1);
              }}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </Button>
            <strong aria-live="polite">
              {label(`${month}-01`, { month: 'long', year: 'numeric' })}
            </strong>
            <Button
              variant="ghost"
              aria-label={copy.nextMonth}
              onClick={() => {
                moveMonth(1);
              }}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
          </div>
          <div className="week-calendar-grid">
            {days.slice(0, 7).map((date) => (
              <span className="week-weekday" key={date} aria-hidden="true">
                {label(date, { weekday: 'narrow' })}
              </span>
            ))}
            {days.map((date) => (
              <button
                key={date}
                type="button"
                data-date={date}
                aria-label={label(date, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                aria-pressed={monday(date) === selected}
                aria-current={date === today ? 'date' : undefined}
                className={`${date.slice(0, 7) !== month ? 'is-outside' : ''} ${available.includes(monday(date)) ? 'has-report' : ''}`}
                onClick={() => {
                  pick(date);
                }}
                onKeyDown={(event) => {
                  const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
                    event.key
                  ];
                  if (offset !== undefined) {
                    event.preventDefault();
                    const next = shiftDayKey(date, offset);
                    dialog.current
                      ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
                      ?.focus();
                  }
                }}
              >
                <TodayMark today={date === today}>
                  {new Date(`${date}T12:00:00Z`).getUTCDate()}
                </TodayMark>
              </button>
            ))}
          </div>
          <footer>
            <Button
              variant="ghost"
              onClick={() => {
                pick(today);
              }}
            >
              {copy.thisWeek}
            </Button>
          </footer>
        </dialog>
      ) : null}
    </>
  );
}
