import { Calendar, ChevronDown, Flag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DatePopover, type DateDraft } from '../../components/DatePopover';
import { PriorityMenu, type PriorityValue } from '../../components/PriorityMenu';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { useCaptureOpen } from '../capture/notice';
import { calendarDay, formatDueChip, shiftDayKey } from '../today/groups';

export interface QuickPreview {
  readonly date: string | null;
  readonly priority: PriorityValue | null;
  readonly tags: readonly string[];
  readonly summary: string;
}

export function QuickAddTools({
  draft,
  preview,
  onDraft,
}: {
  readonly draft: string;
  readonly preview?: QuickPreview | null;
  readonly onDraft: (value: string) => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const [dateOpen, setDateOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const value = useMemo<DateDraft>(
    () => ({
      dueDate: null,
      allDay: true,
      durationMinutes: null,
      reminder: null,
      repeatRule: null,
    }),
    [],
  );

  return (
    <span className={dateOpen || priorityOpen ? 'quick-add-tools is-open' : 'quick-add-tools'}>
      {preview?.date !== null && preview?.date !== undefined ? (
        <span className="qa-chip is-date">{preview.date}</span>
      ) : null}
      {preview?.priority !== null && preview?.priority !== undefined ? (
        <span className={`qa-chip prio-${preview.priority}`}>
          {priorityLabel(preview.priority, messages)}
        </span>
      ) : null}
      {preview?.tags.map((tag) => (
        <span key={tag} className="ui-tag">
          {tag}
        </span>
      ))}
      <button
        type="button"
        aria-label={messages.kindDate}
        aria-expanded={dateOpen}
        onMouseDown={keepFieldFocus}
        onClick={() => {
          setDateOpen((current) => !current);
        }}
      >
        <Calendar size={16} aria-hidden="true" />
      </button>
      {dateOpen ? (
        <DatePopover
          open
          value={value}
          timeZone={timeZone}
          onClose={() => {
            setDateOpen(false);
          }}
          onApply={(next) => {
            onDraft(withDateToken(draft, dateToken(next, locale, timeZone)));
          }}
        />
      ) : null}
      <button
        type="button"
        aria-label={messages.kindPriority}
        aria-expanded={priorityOpen}
        onMouseDown={keepFieldFocus}
        onClick={() => {
          setPriorityOpen((current) => !current);
        }}
      >
        <Flag size={16} aria-hidden="true" />
      </button>
      <PriorityMenu
        open={priorityOpen}
        value={preview?.priority ?? 'none'}
        onClose={() => {
          setPriorityOpen(false);
        }}
        onChange={(priority) => {
          onDraft(withPriorityToken(draft, priority, locale));
        }}
      />
      <button
        type="button"
        aria-label={messages.openDetail}
        onMouseDown={keepFieldFocus}
        onClick={() => {
          useCaptureOpen.getState().show(draft.trim());
        }}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </span>
  );
}

function priorityLabel(priority: PriorityValue, messages: ReturnType<typeof useMessages>): string {
  switch (priority) {
    case 'high':
      return messages.priorityHigh;
    case 'medium':
      return messages.priorityMedium;
    case 'low':
      return messages.priorityLow;
    default:
      return messages.priorityNone;
  }
}

function keepFieldFocus(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

function withDateToken(draft: string, token: string): string {
  const stripped = draft
    .replace(/\s+(hoy|mañana|today|tomorrow|\d{1,2}\/\d{1,2})(?:\s+\d{1,2}:\d{2})?\s*$/i, '')
    .trim();
  if (token.length === 0) {
    return stripped;
  }
  return stripped.length === 0 ? token : `${stripped} ${token}`;
}

function withPriorityToken(draft: string, priority: PriorityValue, locale: string): string {
  const stripped = draft
    .replace(/\s*(!(alta|media|baja|high|medium|low|[123])|p[123])\b/gi, ' ')
    .trim();
  if (priority === 'none') {
    return stripped;
  }
  const english = locale.toLowerCase().startsWith('en');
  const token =
    priority === 'high'
      ? english
        ? '!high'
        : '!alta'
      : priority === 'medium'
        ? english
          ? '!medium'
          : '!media'
        : english
          ? '!low'
          : '!baja';
  return stripped.length === 0 ? token : `${stripped} ${token}`;
}

function dateToken(next: DateDraft, locale: string, timeZone: string): string {
  if (next.dueDate === null) {
    return '';
  }
  const english = locale.toLowerCase().startsWith('en');
  const key = calendarDay(next.dueDate, timeZone);
  const today = calendarDay(new Date().toISOString(), timeZone);
  let day = '';
  if (key === today) {
    day = english ? 'today' : 'hoy';
  } else if (key === shiftDayKey(today, 1)) {
    day = english ? 'tomorrow' : 'mañana';
  } else {
    const parts = key.split('-');
    const dayNumber = parts[2] ?? '1';
    const monthNumber = parts[1] ?? '1';
    day = `${dayNumber}/${monthNumber}`;
  }
  if (next.allDay) {
    return day;
  }
  const label = formatDueChip(next.dueDate, timeZone, false, new Date(), locale, {
    empty: '',
    today: '',
  }).text;
  const matched = /(\d{2}:\d{2})/.exec(label)?.[1];
  return matched === undefined ? day : `${day} ${matched}`;
}
