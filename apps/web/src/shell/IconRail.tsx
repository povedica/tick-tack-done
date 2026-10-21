import { runAction } from '../components/run-action';
import { ControlChip } from '../features/statistics/ControlSummary';
import { displayTitle } from '../features/tasks/displayTitle';
import { MODULES, moduleEnabled } from './modules';
import { useTickyFlags } from '../features/ticky/useTickyFlags';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, ListTodo, PanelLeft, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { AccountMenu } from './AccountMenu';
import { useFeatures } from '../features/settings/feature-flags';
import { useMessages } from '../i18n';
import { RailSectionLink } from './RailSectionLink';
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
  const ticky = useTickyFlags();
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
  const overdueLabel = overdue.isError
    ? `${messages.overdueLoadFailed} ${messages.retry}`
    : messages.overdueTitle;
  const focusLabel =
    focus === null
      ? messages.navFocus
      : `${messages.focusMini} ${formatClock(focus.remaining)}${task.data?.title ? ` · ${displayTitle(task.data.title)}` : ''}`;

  return (
    <nav className="icon-rail" aria-label={messages.appName}>
      <AccountMenu />
      <RailSectionLink to="/today" label={messages.navTasks} icon={ListTodo} tasks />
      {flags.navigation_order
        .filter((key) =>
          moduleEnabled(key, flags, ticky.isSuccess && ticky.data.ui && !ticky.data.kill),
        )
        .map((key) => {
          const module = MODULES[key];
          const Icon = module.icon;
          const label = key === 'focus' ? focusLabel : messages[module.label];
          return <RailSectionLink key={key} to={module.to} label={label} icon={Icon} />;
        })}
      {collapsed ? <ControlChip compact /> : null}
      <span className="rail-spacer" />
      <button
        type="button"
        className="rail-bell"
        aria-label={overdueLabel}
        data-rail-tooltip={overdueLabel}
        aria-busy={overdue.isFetching}
        onClick={() => {
          if (overdue.isError) {
            runAction(overdue.refetch());
            return;
          }
          runAction(Promise.resolve(navigate('/today', { state: { scrollTo: 'overdue' } })));
          window.setTimeout(() => {
            document
              .getElementById('overdue')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }}
      >
        <AlertTriangle size={20} aria-hidden="true" />
        {overdue.isError ? (
          <span className="rail-badge" aria-hidden="true">
            !
          </span>
        ) : overdue.isPending ? (
          <span className="rail-badge" aria-hidden="true">
            …
          </span>
        ) : badge > 0 ? (
          <span className="rail-badge">{badge > 99 ? '99+' : String(badge)}</span>
        ) : null}
      </button>
      <RailSectionLink to="/settings/shortcuts" label={messages.navHelp} icon={HelpCircle} />
      <button
        type="button"
        className="rail-add"
        aria-label={messages.fab}
        data-rail-tooltip={messages.fab}
        onClick={onCapture}
      >
        <Plus size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rail-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
        data-rail-tooltip={collapsed ? messages.expandSidebar : messages.collapseSidebar}
        onClick={onToggleCollapsed}
      >
        <PanelLeft size={20} aria-hidden="true" />
      </button>
    </nav>
  );
}
