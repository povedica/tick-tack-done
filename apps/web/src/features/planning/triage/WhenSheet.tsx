import { Modal, Button } from '../../../components/ui';
import { DatePopover } from '../../../components/DatePopover';
import { useState } from 'react';
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
  days,
}: {
  readonly date: string;
  readonly time: string;
  readonly duration: number;
  readonly slots: readonly string[];
  readonly onDate: (d: string) => void;
  readonly onTime: (t: string) => void;
  readonly onDuration: (n: number) => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly days: ReactNode;
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
    <Modal title={m.when} onClose={onClose}>
      <div className="plan-when">
        {days}
        <Button variant="ghost" onClick={() => setCalendar(true)}>
          {m.chooseDate}
        </Button>
        <label>{m.time}</label>
        <TimeSelect value={time} slots={slots} onChange={onTime} />
        <label>{m.duration}</label>
        <DurationChips value={duration} onChange={onDuration} />
        <Button variant="primary" onClick={onConfirm}>
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
          timeZone="UTC"
          onClose={() => setCalendar(false)}
          onApply={(draft) => {
            if (draft.dueDate) onDate(draft.dueDate.slice(0, 10));
            setCalendar(false);
          }}
        />
      ) : null}
    </Modal>
  );
}
