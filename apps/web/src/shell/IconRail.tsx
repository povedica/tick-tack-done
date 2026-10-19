import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  CircleDot,
  Grid2x2,
  HelpCircle,
  ListTodo,
  PanelLeft,
  Plus,
  Search,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { api } from '../api';
import { BrandMark } from '../components/BrandMark';
import { useMessages } from '../i18n';
import { formatClock, useActiveFocus } from './useActiveFocus';

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
  const focus = useActiveFocus();
  const task = useQuery({
    queryKey: ['task', focus?.taskId],
    queryFn: () => api.taskDetail(focus?.taskId ?? ''),
    enabled: focus?.taskId !== null && focus?.taskId !== undefined,
  });
  const overdue = useQuery({
    queryKey: ['overdue-count'],
    queryFn: () => api.listTasks({ status: 'active', overdue: true, limit: 100 }),
    staleTime: 60_000,
  });
  const badge = overdue.data?.items.length ?? 0;
  const focusLabel =
    focus === null
      ? messages.navFocus
      : `${messages.focusMini} ${formatClock(focus.remaining)}${task.data?.title ? ` · ${task.data.title}` : ''}`;

  return (
    <nav className="icon-rail" aria-label={messages.appName}>
      <NavLink className="rail-avatar" to="/settings/appearance" aria-label={messages.navSettings}>
        <BrandMark size={28} />
      </NavLink>
      <NavLink to="/today" end aria-label={messages.navToday}>
        <ListTodo size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/calendar/month" aria-label={messages.navCalendar}>
        <CalendarDays size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/matrix" aria-label={messages.navMatrix}>
        <Grid2x2 size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/focus" aria-label={focusLabel} title={focusLabel} className="rail-focus">
        {focus !== null ? (
          <svg className="focus-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" />
            <circle
              cx="18"
              cy="18"
              r="15"
              style={{ strokeDashoffset: String(94 - 94 * focus.progress) }}
            />
          </svg>
        ) : null}
        <CircleDot size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/habits" end aria-label={messages.navHabits}>
        <CalendarCheck size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/search" aria-label={messages.navSearch}>
        <Search size={20} aria-hidden="true" />
      </NavLink>
      <span className="rail-spacer" />
      <NavLink
        to="/today"
        aria-label={messages.navBell}
        title={messages.navBell}
        className="rail-bell"
      >
        <Bell size={20} aria-hidden="true" />
        {badge > 0 ? (
          <span className="rail-badge">{badge > 99 ? '99+' : String(badge)}</span>
        ) : null}
      </NavLink>
      <NavLink to="/settings/shortcuts" aria-label={messages.navHelp} title={messages.navHelp}>
        <HelpCircle size={20} aria-hidden="true" />
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
