import { useWtAMessages } from './i18n-wt-a';
import './calendar-wt-a.css';
import { createPortal } from 'react-dom';
import { useRef, useState, type ReactNode } from 'react';
import { Popover } from '../../components/Popover';

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
  const own = useWtAMessages();
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
      {open && (className === 'calendar-mobile-views' || className === 'calendar-filter-menu')
        ? createPortal(
            <div
              className="calendar-views-backdrop"
              aria-hidden="true"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
            />,
            document.body,
          )
        : null}
      <Popover
        sheetHeader={
          className === 'calendar-filter-menu' ? (
            <>
              <strong>{own.calendarFilterTitle}</strong>
              <button type="button" onClick={close}>
                {own.calendarFilterDone}
              </button>
            </>
          ) : undefined
        }
        mobileSheet={className === 'calendar-filter-menu'}
        open={open}
        anchor={anchor}
        label={label}
        onClose={close}
        className={
          className === 'calendar-filter-menu'
            ? 'calendar-popover calendar-filter-popover'
            : 'calendar-popover'
        }
      >
        {children(close)}
      </Popover>
    </div>
  );
}

export { PeriodNavigator as CalendarPeriod } from '../../components/period/PeriodNavigator';
