import { CalendarDays, List, MoreHorizontal, Plus, Sun } from 'lucide-react';
import { NavLink } from 'react-router';
import { openTaskComposer } from '../features/capture/notice';
import { useMessages } from '../i18n';

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

  return (
    <nav className="bottom-bar" aria-label={messages.navLists}>
      <NavLink to="/today" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
        <Sun size={20} aria-hidden="true" />
        {messages.navToday}
      </NavLink>
      <NavLink
        to="/calendar/agenda"
        className={({ isActive }) => (isActive ? 'is-active' : undefined)}
      >
        <CalendarDays size={20} aria-hidden="true" />
        {messages.navCalendar}
      </NavLink>
      <button
        type="button"
        className="fab-slot"
        aria-label={messages.fab}
        aria-keyshortcuts="N"
        onClick={() => {
          openTaskComposer();
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
