import { ControlChip } from '../features/statistics/ControlSummary';
import { displayTitle } from '../features/tasks/displayTitle';
import { MODULES, moduleEnabled } from './modules';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, ListTodo, PanelLeft, Plus } from 'lucide-react';
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
      for (;;) {
        const batch = await api.listTasks({
          status: 'active',
          overdue: true,
          flat: true,
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        });
        total += batch.items.length;
        if (batch.next_cursor === null) {
          break;
        }
        if (batch.next_cursor === cursor) throw new Error('Overdue pagination did not advance');
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
      : `${messages.focusMini} ${formatClock(focus.remaining)}${task.data?.title ? ` · ${displayTitle(task.data.title)}` : ''}`;

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
      {flags.navigation_order
        .filter((key) => moduleEnabled(key, flags))
        .map((key) => {
          const module = MODULES[key];
          const Icon = module.icon;
          const label = key === 'focus' ? focusLabel : messages[module.label];
          return (
            <NavLink key={key} to={module.to} aria-label={label} title={label}>
              <Icon size={20} aria-hidden="true" />
            </NavLink>
          );
        })}
      {collapsed ? <ControlChip compact /> : null}
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
