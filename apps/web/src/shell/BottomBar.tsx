import { useQueryClient } from '@tanstack/react-query';
import { composerContextFor } from '../features/capture/context';
import { CalendarDays, List, MoreHorizontal, Plus, Sun } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { openTaskComposer } from '../features/capture/notice';
import { useMessages } from '../i18n';

const CALENDAR_VIEW_KEY = 'tick-tack-done.calendar.view';

export function lastCalendarPath(): string {
  try {
    const previous = window.localStorage.getItem(CALENDAR_VIEW_KEY);
    const stored = previous === 'multi-week' ? 'two-weeks' : previous;
    if (
      stored === 'day' ||
      stored === 'week' ||
      stored === 'month' ||
      stored === 'agenda' ||
      stored === 'year' ||
      stored === 'quarter' ||
      stored === 'two-weeks' ||
      stored === 'multi-day'
    ) {
      return `/calendar/${stored}`;
    }
  } catch {
    /* ignore */
  }
  return '/calendar/month';
}

export function rememberCalendarView(view: string): void {
  try {
    window.localStorage.setItem(CALENDAR_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

export function BottomBar({
  onOpenLists,
  onOpenMore,
  openSection,
}: {
  readonly onOpenLists: () => void;
  readonly onOpenMore: () => void;
  readonly openSection: 'lists' | 'more' | null;
}) {
  const messages = useMessages();
  const composerClient = useQueryClient();
  const location = useLocation();
  const calendarActive = location.pathname.startsWith('/calendar');

  return (
    <nav className="bottom-bar" aria-label={messages.navLists}>
      <NavLink to="/today" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
        <Sun size={20} aria-hidden="true" />
        {messages.navToday}
      </NavLink>
      <NavLink to={lastCalendarPath()} className={calendarActive ? 'is-active' : ''}>
        <CalendarDays size={20} aria-hidden="true" />
        {messages.navCalendar}
      </NavLink>
      <button
        type="button"
        className="fab-slot"
        aria-label={messages.fab}
        aria-keyshortcuts="N"
        onClick={() => {
          openTaskComposer(composerContextFor(window.location, { cache: composerClient }));
        }}
      >
        <Plus size={22} aria-hidden="true" />
      </button>
      <button type="button" aria-expanded={openSection === 'lists'} onClick={onOpenLists}>
        <List size={20} aria-hidden="true" />
        {messages.navLists}
      </button>
      <button
        type="button"
        data-more-toggle=""
        aria-expanded={openSection === 'more'}
        onClick={onOpenMore}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
        {messages.navMore}
      </button>
    </nav>
  );
}
