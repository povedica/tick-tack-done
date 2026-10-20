import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CircleDot,
  Grid2x2,
  HelpCircle,
  Hourglass,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  PanelLeft,
  Plus,
  Search,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { api } from '../api';
import { BrandMark } from '../components/BrandMark';
import { useFeatures } from '../features/settings/feature-flags';
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
  const navigate = useNavigate();
  const flags = useFeatures((state) => state.flags);
  const focus = useActiveFocus();
  const task = useQuery({
    queryKey: ['task', focus?.taskId],
    queryFn: () => api.taskDetail(focus?.taskId ?? ''),
    enabled: focus?.taskId !== null && focus?.taskId !== undefined,
  });
  const overdue = useQuery({
    queryKey: ['overdue-count'],
    queryFn: async () => {
      let total = 0;
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const batch = await api.listTasks({
          status: 'active',
          overdue: true,
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        });
        total += batch.items.length;
        if (batch.next_cursor === null) {
          break;
        }
        cursor = batch.next_cursor;
      }
      return total;
    },
    staleTime: 60_000,
  });
  const badge = overdue.data ?? 0;
  const focusLabel =
    focus === null
      ? messages.navFocus
      : `${messages.focusMini} ${formatClock(focus.remaining)}${task.data?.title ? ` · ${task.data.title}` : ''}`;

  return (
    <nav className="icon-rail" aria-label={messages.appName}>
      <NavLink
        className="rail-avatar"
        to="/settings/appearance"
        aria-label={messages.navSettings}
        title={messages.navSettings}
      >
        <BrandMark size={28} />
      </NavLink>
      <NavLink to="/today" end aria-label={messages.navToday} title={messages.navToday}>
        <ListTodo size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/calendar/month" aria-label={messages.navCalendar} title={messages.navCalendar}>
        <CalendarDays size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/dashboard" aria-label={messages.navDashboard} title={messages.navDashboard}>
        <LayoutDashboard size={20} aria-hidden="true" />
      </NavLink>
      {flags.matrix ? (
        <NavLink to="/matrix" aria-label={messages.navMatrix} title={messages.navMatrix}>
          <Grid2x2 size={20} aria-hidden="true" />
        </NavLink>
      ) : null}
      {flags.countdowns ? (
        <NavLink
          to="/countdowns"
          aria-label={messages.navCountdowns}
          title={messages.navCountdowns}
        >
          <Hourglass size={20} aria-hidden="true" />
        </NavLink>
      ) : null}
      {flags.focus ? (
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
      ) : null}
      <NavLink to="/habits" end aria-label={messages.navHabits} title={messages.navHabits}>
        <CalendarCheck size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/ticky" end aria-label={messages.navTicky} title={messages.navTicky}>
        <MessageSquare size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/statistics" aria-label={messages.navStatistics} title={messages.navStatistics}>
        <BarChart3 size={20} aria-hidden="true" />
      </NavLink>
      <NavLink to="/search" aria-label={messages.navSearch} title={messages.navSearch}>
        <Search size={20} aria-hidden="true" />
      </NavLink>
      <span className="rail-spacer" />
      <button
        type="button"
        className="rail-bell"
        aria-label={messages.overdueTitle}
        title={messages.overdueTitle}
        onClick={() => {
          void navigate('/today', { state: { scrollTo: 'overdue' } });
          window.setTimeout(() => {
            document
              .getElementById('overdue')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }}
      >
        <AlertTriangle size={20} aria-hidden="true" />
        {badge > 0 ? (
          <span className="rail-badge">{badge > 99 ? '99+' : String(badge)}</span>
        ) : null}
      </button>
      <NavLink to="/settings/shortcuts" aria-label={messages.navHelp} title={messages.navHelp}>
        <HelpCircle size={20} aria-hidden="true" />
      </NavLink>
      <button
        type="button"
        className="rail-add"
        aria-label={messages.fab}
        title={messages.fab}
        onClick={onCapture}
      >
        <Plus size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rail-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
        title={collapsed ? messages.expandSidebar : messages.collapseSidebar}
        onClick={onToggleCollapsed}
      >
        <PanelLeft size={20} aria-hidden="true" />
      </button>
    </nav>
  );
}
