import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Inbox,
  LayoutDashboard,
  ListTodo,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
  Sparkles,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router';
import { api } from '../api';
import { Badge } from '../components/ui';
import { useMessages, type Messages } from '../i18n';
import { usePreferences } from '../theme/preferences';
import { nextTheme, type ThemePreference } from '../theme/preference';
import { useThemePreference } from '../theme/store';
import { smartPath } from '../features/tasks/model';

const SMART_ICONS: Record<string, LucideIcon> = {
  today: Sun,
  tomorrow: CalendarDays,
  next_7_days: CalendarRange,
  all: ListTodo,
  inbox: Inbox,
  assigned_to_me: UserRound,
  completed: CheckCircle2,
  no_date: CalendarDays,
  recently_added: Sparkles,
};

export function Sidebar({
  collapsed,
  concealed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly concealed?: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onNavigate: () => void;
}) {
  const messages = useMessages();
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
  const showCounters = usePreferences((state) => state.showCounters);
  const queryClient = useQueryClient();
  const smart = useQuery({ queryKey: ['smart-lists'], queryFn: () => api.listSmartLists() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => api.listFilters() });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.listTags() });
  const [draft, setDraft] = useState('');
  const location = useLocation();
  const [confirmTrash, setConfirmTrash] = useState(false);
  const themeLabel = themeName(messages, preference);
  const lists = [...(smart.data?.items ?? [])].sort((left, right) =>
    left.sort_order.localeCompare(right.sort_order),
  );

  return (
    <aside
      aria-hidden={concealed ? true : undefined}
      aria-label={messages.appName}
      className="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      inert={concealed ? true : undefined}
    >
      <NavLink className="brand" to="/today" onClick={onNavigate}>
        <span className="brand-name">{messages.appName}</span>
      </NavLink>
      {smart.isPending ? (
        <div className="ui-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {smart.isError ? (
        <p>
          {messages.sidebarError}{' '}
          <button
            type="button"
            onClick={() => {
              void smart.refetch();
            }}
          >
            {messages.retry}
          </button>
        </p>
      ) : null}
      <nav>
        <p className="nav-section">{messages.smartListsTitle}</p>
        <ul className="nav-list">
          {lists
            .filter((item) => item.enabled && item.key !== 'trash')
            .map((item) => (
              <li key={item.id}>
                <SideLink to={smartPath(item.key)} onNavigate={onNavigate}>
                  <SmartIcon name={item.key} />
                  <span className="nav-label">{smartLabel(messages, item.key)}</span>
                  {showCounters ? <Badge value={item.task_count} /> : null}
                </SideLink>
              </li>
            ))}
        </ul>
        <p className="nav-section">{messages.filtersTitle}</p>
        <ul className="nav-list">
          {(filters.data?.items ?? []).map((filter) => (
            <li key={filter.id}>
              <SideLink to={`/filter/${filter.id}`} section onNavigate={onNavigate}>
                <span
                  className="color-dot"
                  style={filter.color === null ? undefined : { background: filter.color }}
                />
                <span className="nav-label">{filter.name}</span>
                {showCounters ? <Badge value={filter.task_count} /> : null}
              </SideLink>
            </li>
          ))}
        </ul>
        <p className="nav-section">{messages.listsTitle}</p>
        <ul className="nav-list">
          {(projects.data?.items ?? [])
            .filter((project) => !project.closed)
            .map((project) => (
              <li key={project.id}>
                <SideLink to={`/list/${project.id}`} section onNavigate={onNavigate}>
                  <span
                    className="color-dot"
                    style={project.color === null ? undefined : { background: project.color }}
                  />
                  <span className="nav-label">{project.name}</span>
                  {showCounters ? <Badge value={project.active_task_count} /> : null}
                </SideLink>
              </li>
            ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.trim();
            if (name.length === 0) {
              return;
            }
            void api.createProject({ name, color: '#4772fa' }, crypto.randomUUID()).then(() => {
              setDraft('');
              void queryClient.invalidateQueries({ queryKey: ['projects'] });
            });
          }}
        >
          <input
            value={draft}
            aria-label={messages.newList}
            placeholder={messages.newList}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
        </form>
        <p className="nav-section">{messages.tagsTitle}</p>
        <ul className="nav-list">
          {(tags.data?.items ?? []).map((tag) => {
            const href = `/search?q=${encodeURIComponent(`#${tag.name}`)}`;
            const current = `${location.pathname}${location.search}` === href;
            return (
              <li key={tag.id}>
                <Link
                  aria-current={current ? 'page' : undefined}
                  className={current ? 'nav-link is-active is-section' : 'nav-link is-section'}
                  data-selected={current ? 'true' : undefined}
                  to={href}
                  onClick={onNavigate}
                >
                  <span className="nav-label">{tag.name}</span>
                  {showCounters ? <Badge value={tag.active_task_count} /> : null}
                  <MoreHorizontal className="nav-more" size={16} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="nav-section">{messages.navMore}</p>
        <ul className="nav-list">
          <Item
            to="/calendar/month"
            label={messages.navCalendar}
            onNavigate={onNavigate}
            icon={CalendarDays}
          />
          <Item to="/matrix" label={messages.navMatrix} onNavigate={onNavigate} />
          <Item
            to="/dashboard"
            label={messages.navDashboard}
            onNavigate={onNavigate}
            icon={LayoutDashboard}
          />
          <Item to="/reports/weekly" label={messages.navReports} onNavigate={onNavigate} />
          <Item to="/review/weekly" label={messages.navReview} onNavigate={onNavigate} />
          <Item to="/focus" label={messages.navFocus} onNavigate={onNavigate} />
          <Item to="/habits" label={messages.navHabits} onNavigate={onNavigate} icon={Repeat} />
          <Item to="/settings/appearance" label={messages.navSettings} onNavigate={onNavigate} />
        </ul>
        <p className="nav-section">{messages.smartTrash}</p>
        <SideLink to="/smart/trash" onNavigate={onNavigate}>
          <span className="nav-label">{messages.smartTrash}</span>
        </SideLink>
        <p className="ui-muted">{messages.trashHint}</p>
        {confirmTrash ? (
          <div>
            <p>{messages.emptyTrashBody}</p>
            <button
              type="button"
              onClick={() => {
                void api.emptyTrash().then(() => {
                  setConfirmTrash(false);
                });
              }}
            >
              {messages.confirmEmpty}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmTrash(true);
            }}
          >
            {messages.emptyTrash}
          </button>
        )}
      </nav>
      <div className="sidebar-footer">
        <button
          type="button"
          className="theme-cycle"
          aria-label={`${messages.themeLabel}: ${themeLabel}`}
          onClick={() => {
            setPreference(nextTheme(preference));
          }}
        >
          <span>
            {messages.themeLabel}: {themeLabel}
          </span>
        </button>
        <button
          type="button"
          className="collapse-button"
          aria-keyshortcuts="["
          aria-expanded={!collapsed}
          aria-label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={18} aria-hidden="true" />
          )}
          <span>{collapsed ? messages.expandSidebar : messages.collapseSidebar}</span>
        </button>
      </div>
    </aside>
  );
}

function Item({
  to,
  label,
  onNavigate,
  icon: Icon,
}: {
  readonly to: string;
  readonly label: string;
  readonly onNavigate: () => void;
  readonly icon?: LucideIcon | undefined;
}) {
  return (
    <li>
      <SideLink to={to} section onNavigate={onNavigate}>
        {Icon !== undefined ? <Icon size={20} aria-hidden="true" /> : null}
        <span className="nav-label">{label}</span>
      </SideLink>
    </li>
  );
}

function SideLink({
  to,
  onNavigate,
  section = false,
  children,
}: {
  readonly to: string;
  readonly onNavigate: () => void;
  readonly section?: boolean;
  readonly children: ReactNode;
}) {
  const match = useMatch({ path: to, end: true });
  const selected = match !== null;
  const sectionClass = section ? ' is-section' : '';
  return (
    <NavLink
      to={to}
      data-selected={selected ? 'true' : undefined}
      className={selected ? `nav-link is-active${sectionClass}` : `nav-link${sectionClass}`}
      onClick={onNavigate}
    >
      {children}
      <MoreHorizontal className="nav-more" size={16} aria-hidden="true" />
    </NavLink>
  );
}

function SmartIcon({ name }: { readonly name: string }) {
  const Icon = SMART_ICONS[name] ?? ListTodo;
  return <Icon size={20} aria-hidden="true" />;
}

function smartLabel(messages: Messages, key: string): string {
  switch (key) {
    case 'today':
      return messages.smartToday;
    case 'tomorrow':
      return messages.smartTomorrow;
    case 'next_7_days':
      return messages.smartNext7;
    case 'all':
      return messages.smartAll;
    case 'inbox':
      return messages.smartInbox;
    case 'assigned_to_me':
      return messages.smartAssigned;
    case 'completed':
      return messages.smartCompleted;
    case 'trash':
      return messages.smartTrash;
    case 'no_date':
      return messages.smartNoDate;
    case 'recently_added':
      return messages.smartRecent;
    default:
      return key;
  }
}

function themeName(messages: Messages, preference: ThemePreference): string {
  switch (preference) {
    case 'light':
      return messages.themeLight;
    case 'dark':
      return messages.themeDark;
    case 'auto':
      return messages.themeAuto;
  }
}
