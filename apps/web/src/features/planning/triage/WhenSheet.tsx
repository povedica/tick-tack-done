import { Popover } from '../../../components/Popover';
import { Button } from '../../../components/ui';
import { DatePopover } from '../../../components/DatePopover';
import { CloudSun } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { useWtFMessages } from '../i18n-wt-f';
import { useAppLocale } from '../../../i18n/locale';
import { DurationChips } from './DurationChips';
import { TimeSelect } from './TimeSelect';
import type { ReactNode } from 'react';
export function WhenSheet({
  date,
  time,
  duration,
  slots,
  onDate,
  onTime,
  onDuration,
  onClose,
  onConfirm,
  onSomeday,
  days,
  anchor,
  busy = false,
  error,
}: {
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly date: string;
  readonly time: string;
  readonly duration: number;
  readonly slots: readonly string[];
  readonly onDate: (d: string) => void;
  readonly onTime: (t: string) => void;
  readonly onDuration: (n: number) => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly onSomeday: () => void;
  readonly days: ReactNode;
  readonly anchor?: RefObject<HTMLElement | null>;
}) {
  const m = useWtFMessages(),
    locale = useAppLocale();
  const [calendar, setCalendar] = useState(false);
  const label = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
  return (
    <Popover
      open
      label={m.when}
      closeLabel={m.close}
      onClose={onClose}
      mobileSheet
      anchor={anchor}
      width={390}
      className="popover plan-when-popover"
      headingAction={
        <button type="button" className="plan-when-someday" disabled={busy} onClick={onSomeday}>
          <CloudSun size={16} aria-hidden="true" />
          {m.someday}
        </button>
      }
    >
      <div className="plan-when">
        {days}
        <Button
          variant="ghost"
          onClick={() => {
            setCalendar(true);
          }}
        >
          {m.chooseDate}
        </Button>
        <TimeSelect value={time} slots={slots} onChange={onTime} />
        <DurationChips value={duration} onChange={onDuration} />
        {error ? <p role="alert">{error}</p> : null}
        <Button
          variant="primary"
          disabled={busy || (time !== '' && !slots.includes(time))}
          onClick={onConfirm}
        >
          {m.schedule} {label}
          {time ? ` ${m.at} ${time}` : ''}
        </Button>
      </div>
      {calendar ? (
        <DatePopover
          open
          value={{
            dueDate: `${date}T12:00:00Z`,
            allDay: true,
            durationMinutes: null,
            reminder: null,
            reminderTouched: false,
            repeatRule: null,
          }}
          mode="date-only"
          closeLabel={m.close}
          timeZone="UTC"
          onClose={() => {
            setCalendar(false);
          }}
          onApply={(draft) => {
            if (draft.dueDate) onDate(draft.dueDate.slice(0, 10));
            setCalendar(false);
          }}
        />
      ) : null}
    </Popover>
  );
}
