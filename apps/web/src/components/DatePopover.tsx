import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { fill, useMessages } from '../i18n';
import { useAppLocale } from '../i18n/locale';
import { calendarDay, shiftDayKey, zonedWallTime } from '../features/today/groups';
import { usePreferences } from '../theme/preferences';
import { Button } from './ui';
import { Popover } from './Popover';
import './inline-time.css';

export interface DateDraft {
  readonly dueDate: string | null;
  readonly allDay: boolean;
  readonly durationMinutes: number | null;
  readonly reminder: string | null;
  /** True only after the user picks a reminder, including none. */
  readonly reminderTouched: boolean;
  readonly repeatRule: string | null;
}

const REMINDERS = [
  ['', 'none'],
  ['TRIGGER:-PT0M', 'at'],
  ['TRIGGER:-PT5M', 'm5'],
  ['TRIGGER:-PT15M', 'm15'],
  ['TRIGGER:-PT30M', 'm30'],
  ['TRIGGER:-PT1H', 'hour'],
  ['TRIGGER:-P1D', 'day'],
] as const;

export function DatePopover({
  open,
  value,
  timeZone,
  onClose,
  onApply,
  onNotice,
  onEvening,
  onSomeday,
  anchor,
}: {
  readonly anchor?: RefObject<HTMLElement | null> | undefined;
  readonly open: boolean;
  readonly value: DateDraft;
  readonly timeZone: string;
  readonly onClose: () => void;
  readonly onApply: (next: DateDraft) => void;
  readonly onNotice?: (text: string) => void;
  readonly onEvening?: () => void;
  readonly onSomeday?: () => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const weekStart = usePreferences((state) => state.weekStart);
  const [tab, setTab] = useState<'date' | 'duration'>('date');
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(() => monthOf(value.dueDate, timeZone));
  const [sub, setSub] = useState<'reminder' | 'repeat' | null>(null);
  const [everyDays, setEveryDays] = useState(2);
  const [everyWeeks, setEveryWeeks] = useState(2);
  const [end, setEnd] = useState<'never' | 'date' | 'count'>('never');
  const [until, setUntil] = useState('');
  const [count, setCount] = useState(10);
  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft({ ...value, reminderTouched: false });
    setCursor(monthOf(value.dueDate, timeZone));
    setSub(null);
    setTab('date');
  }, [open, timeZone, value]);

  const dayKey = draft.dueDate === null ? '' : calendarDay(draft.dueDate, timeZone);
  const time =
    draft.dueDate !== null && !draft.allDay ? wallClock(draft.dueDate, timeZone) : '09:00';
  const endTime =
    draft.dueDate !== null && !draft.allDay && draft.durationMinutes !== null
      ? wallClock(
          new Date(Date.parse(draft.dueDate) + draft.durationMinutes * 60_000).toISOString(),
          timeZone,
        )
      : '';
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
  const timeLang = locale.toLowerCase().startsWith('en') ? 'en-GB' : 'es-ES';

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

  /** TTD-AUD-03: picking only a day on a dateless task is all-day; keep clock if it already had one. */
  function pickDay(key: string): void {
    const allDay = value.dueDate === null ? true : draft.allDay;
    setDay(key, allDay);
  }

  function applyRepeat(base: string): void {
    setDraft((current) => ({ ...current, repeatRule: withEnd(base, end, until, count) }));
    setSub(null);
  }

  function commit(next: DateDraft): void {
    let draftNext = next;
    if (draftNext.repeatRule !== null && draftNext.dueDate === null) {
      const instant = zonedWallTime(todayKey, 0, 0, timeZone);
      draftNext = { ...draftNext, dueDate: instant, allDay: true };
      onNotice?.(messages.dateSetToday);
    }
    onApply(draftNext);
    onClose();
  }

  return (
    <Popover
      open={open}
      anchor={anchor}
      offsetX={16}
      offsetY={-16}
      label={messages.dateSet}
      onClose={onClose}
      className="popover date-popover"
    >
      <div className="popover-tabs" role="tablist">
        <Button
          type="button"
          size="sm"
          variant={tab === 'date' ? 'primary' : 'ghost'}
          aria-selected={tab === 'date'}
          role="tab"
          onClick={() => {
            setTab('date');
          }}
        >
          {messages.dateTab}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'duration' ? 'primary' : 'ghost'}
          aria-selected={tab === 'duration'}
          role="tab"
          onClick={() => {
            setTab('duration');
          }}
        >
          {messages.durationTab}
        </Button>
        {onEvening !== undefined ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onEvening();
              onClose();
            }}
          >
            {messages.thisEveningOption}
          </Button>
        ) : null}
      </div>
      {tab === 'duration' ? (
        <label className="popover-field">
          {messages.durationMinutes}
          <span className="date-shortcuts">
            {[15, 30, 45, 60, 90].map((minutes) => (
              <Button
                key={minutes}
                type="button"
                size="sm"
                variant={draft.durationMinutes === minutes ? 'primary' : 'ghost'}
                onClick={() => {
                  setDraft((current) => ({ ...current, durationMinutes: minutes }));
                }}
              >
                {minutes} min
              </Button>
            ))}
          </span>
          <input
            type="number"
            min={5}
            max={480}
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                pickDay(todayKey);
              }}
            >
              {messages.dateToday}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                pickDay(shiftDayKey(todayKey, 1));
              }}
            >
              {messages.dateTomorrow}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                pickDay(shiftDayKey(todayKey, 7));
              }}
            >
              {messages.dateIn7}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft((current) => ({ ...current, dueDate: null, allDay: true }));
              }}
            >
              {messages.noDate}
            </Button>
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
            {heads.map((head, index) => (
              <span key={index} className="cal-head">
                {head}
              </span>
            ))}
            {cells.map((date) => {
              const key = localKey(date);
              const selected = key === dayKey;
              const today = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'cal-day',
                    date.getMonth() !== cursor.getMonth() ? 'is-outside' : '',
                    selected ? 'is-selected' : '',
                    today ? 'is-today' : '',
                  ]
                    .filter((item) => item.length > 0)
                    .join(' ')}
                  onClick={() => {
                    pickDay(key);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <InlineTime
            label={messages.dueTime}
            emptyLabel={messages.noTime}
            value={draft.allDay || draft.dueDate === null ? '' : time}
            onClear={() => {
              if (dayKey) setDay(dayKey, true);
              setDraft((current) => ({ ...current, durationMinutes: null, allDay: true }));
            }}
            onChange={(clock) => {
              setDay(dayKey || todayKey, false, clock);
              setDraft((current) => ({
                ...current,
                durationMinutes: current.durationMinutes ?? 30,
              }));
            }}
          />
          {draft.dueDate !== null && !draft.allDay ? (
            <InlineTime
              label={messages.endTime}
              emptyLabel={messages.noTime}
              value={endTime}
              onClear={() => {
                setDraft((current) => ({ ...current, durationMinutes: null }));
              }}
              onChange={(clock) => {
                const [startH, startM] = time.split(':').map(Number);
                const [endH, endM] = clock.split(':').map(Number);
                const startMin = (startH ?? 0) * 60 + (startM ?? 0);
                let endMin = (endH ?? 0) * 60 + (endM ?? 0);
                if (endMin <= startMin) endMin = startMin + 15;
                setDraft((current) => ({
                  ...current,
                  durationMinutes: endMin - startMin,
                  allDay: false,
                }));
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
                      reminderTouched: true,
                    }));
                    setSub(null);
                  }}
                >
                  {reminderChoice(key, messages)}
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
                  setSub(null);
                }}
              >
                {messages.noRecurrence}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  applyRepeat('RRULE:FREQ=DAILY');
                }}
              >
                {messages.repeatDaily}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  applyRepeat('RRULE:FREQ=WEEKLY');
                }}
              >
                {messages.repeatWeekly}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  applyRepeat('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
                }}
              >
                {messages.repeatWeekdays}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  applyRepeat('RRULE:FREQ=MONTHLY');
                }}
              >
                {messages.repeatMonthly}
              </button>
              <button
                type="button"
                className="popover-row"
                onClick={() => {
                  applyRepeat('RRULE:FREQ=YEARLY');
                }}
              >
                {messages.repeatYearly}
              </button>
              <label className="popover-field">
                {messages.repeatEveryDays.replace('{name}', '')}
                <input
                  type="number"
                  min={2}
                  value={everyDays}
                  aria-label={messages.repeatEveryDays}
                  onChange={(event) => {
                    setEveryDays(Number(event.target.value) || 2);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    applyRepeat(`RRULE:FREQ=DAILY;INTERVAL=${String(Math.max(2, everyDays))}`);
                  }}
                >
                  {fill(messages.repeatEveryDays, String(everyDays))}
                </button>
              </label>
              <label className="popover-field">
                <input
                  type="number"
                  min={2}
                  value={everyWeeks}
                  aria-label={messages.repeatEveryWeeks}
                  onChange={(event) => {
                    setEveryWeeks(Number(event.target.value) || 2);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    applyRepeat(`RRULE:FREQ=WEEKLY;INTERVAL=${String(Math.max(2, everyWeeks))}`);
                  }}
                >
                  {fill(messages.repeatEveryWeeks, String(everyWeeks))}
                </button>
              </label>
              <div className="date-shortcuts">
                <Button
                  type="button"
                  size="sm"
                  variant={end === 'never' ? 'primary' : 'ghost'}
                  onClick={() => {
                    setEnd('never');
                  }}
                >
                  {messages.repeatEndNever}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={end === 'date' ? 'primary' : 'ghost'}
                  onClick={() => {
                    setEnd('date');
                  }}
                >
                  {messages.repeatEndDate}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={end === 'count' ? 'primary' : 'ghost'}
                  onClick={() => {
                    setEnd('count');
                  }}
                >
                  {messages.repeatEndCount}
                </Button>
              </div>
              {end === 'date' ? (
                <input
                  type="date"
                  lang={timeLang}
                  value={until}
                  aria-label={messages.repeatEndDate}
                  onChange={(event) => {
                    setUntil(event.target.value);
                  }}
                />
              ) : null}
              {end === 'count' ? (
                <input
                  type="number"
                  min={1}
                  value={count}
                  aria-label={messages.repeatCount}
                  onChange={(event) => {
                    setCount(Number(event.target.value) || 1);
                  }}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
      {onSomeday === undefined ? null : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onSomeday();
            onClose();
          }}
        >
          {messages.somedayAction}
        </Button>
      )}
      <div className="popover-actions">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            commit({
              ...draft,
              dueDate: null,
              allDay: true,
              reminder: null,
              reminderTouched: true,
              repeatRule: null,
            });
          }}
        >
          {messages.clearDate}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={() => {
            commit(draft);
          }}
        >
          {messages.dateOk}
        </Button>
      </div>
    </Popover>
  );
}

function reminderChoice(
  key: (typeof REMINDERS)[number][1],
  messages: ReturnType<typeof useMessages>,
): string {
  switch (key) {
    case 'none':
      return messages.noReminder;
    case 'at':
      return messages.reminderAtDue;
    case 'm5':
      return messages.reminder5;
    case 'm15':
      return messages.reminder15;
    case 'm30':
      return messages.reminder30;
    case 'hour':
      return messages.reminderHour;
    case 'day':
      return messages.reminderDay;
    default:
      return messages.noReminder;
  }
}

export function reminderLabel(
  trigger: string | null,
  messages: ReturnType<typeof useMessages>,
): string {
  if (trigger === null || trigger.length === 0) {
    return messages.noReminder;
  }
  const minutes = triggerMinutes(trigger);
  if (minutes === 0) {
    return messages.reminderAtDue;
  }
  if (minutes === 5) {
    return messages.reminder5;
  }
  if (minutes === 15) {
    return messages.reminder15;
  }
  if (minutes === 30) {
    return messages.reminder30;
  }
  if (minutes === 60) {
    return messages.reminderHour;
  }
  if (minutes === 1440) {
    return messages.reminderDay;
  }
  if (minutes !== null) {
    return fill(messages.reminderMinutes, String(minutes));
  }
  return messages.reminderRow;
}

function triggerMinutes(trigger: string): number | null {
  const match = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/u.exec(trigger);
  if (match === null) {
    return null;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return days * 1440 + hours * 60 + minutes;
}

function repeatLabel(rule: string | null, messages: ReturnType<typeof useMessages>): string {
  if (rule === null) {
    return messages.noRecurrence;
  }
  const interval = /INTERVAL=(\d+)/u.exec(rule);
  const every = interval === null ? 1 : Number(interval[1]);
  if (rule.includes('BYDAY=MO,TU,WE,TH,FR')) {
    return messages.repeatWeekdays;
  }
  if (rule.includes('YEARLY')) {
    return messages.repeatYearly;
  }
  if (rule.includes('MONTHLY')) {
    return messages.repeatMonthly;
  }
  if (rule.includes('WEEKLY') && every > 1) {
    return fill(messages.repeatEveryWeeks, String(every));
  }
  if (rule.includes('WEEKLY')) {
    return messages.repeatWeekly;
  }
  if (rule.includes('DAILY') && every > 1) {
    return fill(messages.repeatEveryDays, String(every));
  }
  if (rule.includes('DAILY')) {
    return messages.repeatDaily;
  }
  return messages.repeatRow;
}

function withEnd(
  base: string,
  end: 'never' | 'date' | 'count',
  until: string,
  count: number,
): string {
  const clean = base.replace(/;UNTIL=[^;]*/u, '').replace(/;COUNT=\d+/u, '');
  if (end === 'count') {
    return `${clean};COUNT=${String(Math.max(1, count))}`;
  }
  if (end === 'date' && /^\d{4}-\d{2}-\d{2}$/u.test(until)) {
    return `${clean};UNTIL=${until.replace(/-/gu, '')}T235959Z`;
  }
  return clean;
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

/** Native hour/minute controls live directly in the row. */
function InlineTime({
  label,
  emptyLabel,
  value,
  onChange,
  onClear,
}: {
  readonly label: string;
  readonly emptyLabel: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClear: () => void;
}) {
  const locale = useAppLocale();
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const valid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return (
    <div className="inline-time-row">
      <label>
        {label}
        <input
          type="time"
          lang={locale.startsWith('en') ? 'en-GB' : 'es-ES'}
          step={60}
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          placeholder="HH:mm"
          value={text}
          maxLength={5}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (valid(next)) onChange(next);
          }}
          onBlur={() => {
            if (!text) onClear();
            else if (!valid(text)) setText(value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      {value ? (
        <button type="button" aria-label={`${label}: ${emptyLabel}`} onClick={onClear}>
          <X size={14} aria-hidden="true" />
        </button>
      ) : (
        <span className="inline-time-clear-space" />
      )}
    </div>
  );
}
