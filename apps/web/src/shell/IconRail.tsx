import { CalendarDays, ListTodo, PanelLeft, Plus, Repeat, Search } from 'lucide-react';
import { NavLink } from 'react-router';
import { useMessages } from '../i18n';

export function IconRail({
  collapsed,
  onToggleCollapsed,
  onCapture,
}: {
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onCapture: () => void;
}) {
  const messages = useMessages();

  return (
    <nav className="icon-rail" aria-label={messages.appName}>
      <NavLink className="rail-avatar" to="/settings/appearance" aria-label={messages.navSettings}>
        t
      </NavLink>
      <NavLink to="/today" end aria-label={messages.navToday}>
        <ListTodo size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/calendar/month" aria-label={messages.navCalendar}>
        <CalendarDays size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/search" aria-label={messages.navSearch}>
        <Search size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/habits" end aria-label={messages.navHabits}>
        <Repeat size={20} aria-hidden="true" />
      </NavLink>
      <button type="button" className="rail-add" aria-label={messages.fab} onClick={onCapture}>
        <Plus size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rail-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
        onClick={onToggleCollapsed}
      >
        <PanelLeft size={20} aria-hidden="true" />
      </button>
    </nav>
  );
}
