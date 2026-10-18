import { CalendarDays, List, Plus, Repeat, Search } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { messagesFor } from '../i18n';

export function BottomBar({ onOpenLists }: { readonly onOpenLists: () => void }) {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();

  return (
    <nav className="bottom-bar" aria-label={messages.navLists}>
      <NavLink to="/today" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
        <CalendarDays size={20} aria-hidden="true" />
        {messages.navToday}
      </NavLink>
      <button type="button" onClick={onOpenLists}>
        <List size={20} aria-hidden="true" />
        {messages.navLists}
      </button>
      <button
        type="button"
        className="fab-slot"
        aria-label={messages.fab}
        aria-keyshortcuts="N"
        onClick={() => {
          void navigate('/quick-add');
        }}
      >
        <Plus size={22} aria-hidden="true" />
      </button>
      <NavLink to="/search" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
        <Search size={20} aria-hidden="true" />
        {messages.navSearch}
      </NavLink>
      <NavLink to="/habits" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
        <Repeat size={20} aria-hidden="true" />
        {messages.navHabits}
      </NavLink>
    </nav>
  );
}
