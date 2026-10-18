import { Calendar, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useMessages } from '../../i18n';
import { useCaptureOpen } from '../capture/notice';

/** Date and expand controls that TickTick shows on the focused quick-add bar. */
export function QuickAddTools({
  draft,
  onDraft,
}: {
  readonly draft: string;
  readonly onDraft: (value: string) => void;
}) {
  const messages = useMessages();
  const [open, setOpen] = useState(false);
  const todayToken = messages.dateToday === 'Today' ? 'today' : 'hoy';
  const tomorrowToken = messages.dateTomorrow === 'Tomorrow' ? 'tomorrow' : 'mañana';

  function apply(token: string): void {
    onDraft(withDateToken(draft, token));
    setOpen(false);
  }

  return (
    <span className={open ? 'quick-add-tools is-open' : 'quick-add-tools'}>
      <button
        type="button"
        aria-label={messages.kindDate}
        aria-expanded={open}
        onMouseDown={keepFieldFocus}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Calendar size={16} aria-hidden="true" />
      </button>
      {open ? (
        <span className="quick-add-dates">
          <button
            type="button"
            onMouseDown={keepFieldFocus}
            onClick={() => {
              apply(todayToken);
            }}
          >
            {messages.dateToday}
          </button>
          <button
            type="button"
            onMouseDown={keepFieldFocus}
            onClick={() => {
              apply(tomorrowToken);
            }}
          >
            {messages.dateTomorrow}
          </button>
        </span>
      ) : null}
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

function keepFieldFocus(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

function withDateToken(draft: string, token: string): string {
  const stripped = draft.replace(/\s+(hoy|mañana|today|tomorrow)\s*$/i, '').trim();
  return stripped.length === 0 ? token : `${stripped} ${token}`;
}
