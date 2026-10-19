import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMessages } from '../i18n';
import { useAppLocale } from '../i18n/locale';
import { calendarDay, shiftDayKey, zonedWallTime } from '../features/today/groups';
import { usePreferences } from '../theme/preferences';
import { Popover } from './Popover';

export interface DateDraft {
  readonly dueDate: string | null;
  readonly allDay: boolean;
  readonly durationMinutes: number | null;
  readonly reminder: string | null;
  readonly repeatRule: string | null;
}

const REMINDERS = [
  ['', 'none'],
  ['TRIGGER:-PT30M', 'reminder30'],
  ['TRIGGER:-PT1H', 'reminderHour'],
  ['TRIGGER:-P1D', 'reminderDay'],
] as const;

export function DatePopover({
  open,
  value,
  timeZone,
  onClose,
  onApply,
}: {
  readonly open: boolean;
  readonly value: DateDraft;
  readonly timeZone: string;
  readonly onClose: () => void;
  readonly onApply: (next: DateDraft) => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const weekStart = usePreferences((state) => state.weekStart);
  const [tab, setTab] = useState<'date' | 'duration'>('date');
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(() => monthOf(value.dueDate, timeZone));
  const [sub, setSub] = useState<'time' | 'reminder' | 'repeat' | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(value);
    setCursor(monthOf(value.dueDate, timeZone));
    setSub(null);
    setTab('date');
  }, [open, timeZone, value]);

  const dayKey = draft.dueDate === null ? '' : calendarDay(draft.dueDate, timeZone);
  const time =
    draft.dueDate !== null && !draft.allDay ? wallClock(draft.dueDate, timeZone) : '09:00';
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const shift = (start.getDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(index - shift + 1);
    return date;
  });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const heads = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 0, weekStart === 'monday' ? 5 + index : 4 + index);
    return weekday.format(date);
  });
  const todayKey = calendarDay(new Date().toISOString(), timeZone);

  function setDay(key: string, allDay: boolean, clock = time): void {
    const [hour, minute] = clock.split(':').map(Number);
    const instant = zonedWallTime(
      key,
      allDay ? 0 : (hour ?? 9),
      allDay ? 0 : (minute ?? 0),
      timeZone,
    );
    setDraft((current) => ({
      ...current,
      dueDate: instant,
      allDay,
    }));
  }

  return (
    <Popover
      open={open}
      label={messages.dateSet}
      onClose={onClose}
      className="popover date-popover"
    >
      <div className="popover-tabs" role="tablist">
        <button
          type="button"
          aria-selected={tab === 'date'}
          onClick={() => {
            setTab('date');
          }}
        >
          {messages.dateTab}
        </button>
        <button
          type="button"
          aria-selected={tab === 'duration'}
          onClick={() => {
            setTab('duration');
          }}
        >
          {messages.durationTab}
        </button>
      </div>
      {tab === 'duration' ? (
        <label className="popover-field">
          {messages.durationMinutes}
          <input
            type="number"
            min={0}
            value={draft.durationMinutes ?? 0}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDraft((current) => ({
                ...current,
                durationMinutes: Number.isFinite(next) ? next : null,
              }));
            }}
          />
        </label>
      ) : (
        <>
          <div className="date-shortcuts">
            <button
              type="button"
              onClick={() => {
                setDay(todayKey, draft.allDay);
              }}
            >
              {messages.dateToday}
            </button>
            <button
              type="button"
              onClick={() => {
                setDay(shiftDayKey(todayKey, 1), draft.allDay);
              }}
            >
              {messages.dateTomorrow}
            </button>
            <button
              type="button"
              onClick={() => {
                setDay(shiftDayKey(todayKey, 7), draft.allDay);
              }}
            >
              {messages.dateIn7}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft((current) => ({ ...current, dueDate: null, allDay: true }));
              }}
            >
              {messages.noDate}
            </button>
          </div>
          <div className="cal-toolbar">
            <button
              type="button"
              aria-label={messages.calPrev}
              onClick={() => {
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
              }}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong>
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)}
            </strong>
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
          <div className="cal-grid">
            {heads.map((head) => (
              <span key={head} className="cal-head">
                {head}
              </span>
            ))}
            {cells.map((date) => {
              const key = localKey(date);
              const selected = key === dayKey;
              return (
                <button
                  key={key}
                  type="button"
                  className={selected ? 'cal-day is-selected' : 'cal-day'}
                  onClick={() => {
                    setDay(key, draft.allDay);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="popover-row"
            onClick={() => {
              setSub(sub === 'time' ? null : 'time');
            }}
          >
            <span>{messages.dueTime}</span>
            <span>{draft.allDay || draft.dueDate === null ? messages.noDate : time}</span>
          </button>
          {sub === 'time' ? (
            <input
              type="time"
              value={time}
              aria-label={messages.dueTime}
              onChange={(event) => {
                const key = dayKey.length === 0 ? todayKey : dayKey;
                setDay(key, false, event.target.value);
              }}
            />
          ) : null}
          <button
            type="button"
            className="popover-row"
            onClick={() => {
              setSub(sub === 'reminder' ? null : 'reminder');
            }}
          >
            <span>{messages.reminderRow}</span>
            <span>{reminderLabel(draft.reminder, messages)}</span>
          </button>
          {sub === 'reminder'
            ? REMINDERS.map(([trigger, key]) => (
                <button
                  key={trigger.length === 0 ? 'none' : trigger}
                  type="button"
                  className="popover-row"
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      reminder: trigger.length === 0 ? null : trigger,
                    }));
                    setSub(null);
                  }}
                >
                  {key === 'none' ? messages.noReminder : messages[key]}
                </button>
              ))
            : null}
          <button
            type="button"
            className="popover-row"
            onClick={() => {
              setSub(sub === 'repeat' ? null : 'repeat');
            }}
          >
            <span>{messages.repeatRow}</span>
            <span>{repeatLabel(draft.repeatRule, messages)}</span>
          </button>
          {sub === 'repeat' ? (
            <>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  setDraft((current) => ({ ...current, repeatRule: null }));
                }}
              >
                {messages.noRecurrence}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  setDraft((current) => ({ ...current, repeatRule: 'RRULE:FREQ=DAILY' }));
                }}
              >
                {messages.repeatDaily}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  setDraft((current) => ({ ...current, repeatRule: 'RRULE:FREQ=WEEKLY' }));
                }}
              >
                {messages.repeatWeekly}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  setDraft((current) => ({ ...current, repeatRule: 'RRULE:FREQ=MONTHLY' }));
                }}
              >
                {messages.repeatMonthly}
              </button>
            </>
          ) : null}
        </>
      )}
      <div className="popover-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onApply({ ...draft, dueDate: null, allDay: true, reminder: null, repeatRule: null });
            onClose();
          }}
        >
          {messages.clearDate}
        </button>
        <button
          type="button"
          className="ui-button is-primary is-sm"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          {messages.dateOk}
        </button>
      </div>
    </Popover>
  );
}

function reminderLabel(trigger: string | null, messages: ReturnType<typeof useMessages>): string {
  if (trigger === null) {
    return messages.noReminder;
  }
  if (trigger === 'TRIGGER:-PT30M') {
    return messages.reminder30;
  }
  if (trigger === 'TRIGGER:-PT1H') {
    return messages.reminderHour;
  }
  if (trigger === 'TRIGGER:-P1D') {
    return messages.reminderDay;
  }
  return trigger;
}

function repeatLabel(rule: string | null, messages: ReturnType<typeof useMessages>): string {
  if (rule === null) {
    return messages.noRecurrence;
  }
  if (rule.includes('DAILY')) {
    return messages.repeatDaily;
  }
  if (rule.includes('WEEKLY')) {
    return messages.repeatWeekly;
  }
  if (rule.includes('MONTHLY')) {
    return messages.repeatMonthly;
  }
  return rule;
}

function monthOf(due: string | null, timeZone: string): Date {
  if (due === null) {
    return new Date();
  }
  const key = calendarDay(due, timeZone);
  const [year, month] = key.split('-').map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, 1);
}

function wallClock(due: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(due));
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '09';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function localKey(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
