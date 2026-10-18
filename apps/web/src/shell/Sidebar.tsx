import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Check,
  Clock,
  Inbox,
  List,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  Sun,
  Sunrise,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { viewsApi } from '../features/views/api';
import { messagesFor, type Messages } from '../i18n';
import { nextTheme, type ThemePreference } from '../theme/preference';
import { useThemePreference } from '../theme/store';
import { SIDEBAR_LINKS, type SidebarLink } from './navigation';
import {
  visibleFilters,
  visibleProjects,
  visibleSmartLists,
  type SidebarFilter,
  type SidebarProject,
  type SidebarSmartLink,
} from './sidebar-model';

const ICONS: Record<SidebarLink['labelKey'], LucideIcon> = {
  navToday: CalendarDays,
  navTomorrow: Sunrise,
  navNext7: CalendarRange,
  navAll: List,
  navInbox: Inbox,
  navNoDate: CalendarOff,
  navRecent: Clock,
  navCompleted: Check,
  navTrash: Trash2,
  navHabits: Repeat,
};

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  onCapture,
}: {
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onNavigate: () => void;
  readonly onCapture: () => void;
}) {
  const messages = messagesFor(navigator.language);
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
  const themeLabel = themeName(messages, preference);
  const smartLists = useQuery({
    queryKey: ['smart-lists'],
    queryFn: () => viewsApi.listSmartLists(),
    refetchOnWindowFocus: false,
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => viewsApi.listProjects(),
    refetchOnWindowFocus: false,
  });
  const filters = useQuery({
    queryKey: ['filters'],
    queryFn: () => viewsApi.listFilters(),
    refetchOnWindowFocus: false,
  });
  const waiting = smartLists.isPending || projects.isPending || filters.isPending;
  const smartLinks = smartLists.data
    ? visibleSmartLists(
        smartLists.data.items.map((item) => ({
          key: item.key,
          enabled: item.enabled,
          sortOrder: item.sort_order,
          taskCount: item.task_count,
        })),
      )
    : null;
  const projectLinks = projects.data
    ? visibleProjects(
        projects.data.items.map((item) => ({
          id: item.id,
          name: item.name,
          color: item.color,
          kind: item.kind,
          closed: item.closed,
          isInbox: item.is_inbox,
          sortOrder: item.sort_order,
          activeTaskCount: item.active_task_count,
        })),
      )
    : null;
  const filterLinks = filters.data
    ? visibleFilters(
        filters.data.items.map((item) => ({
          id: item.id,
          name: item.name,
          color: item.color,
          sortOrder: item.sort_order,
          taskCount: item.task_count,
        })),
      )
    : null;

  return (
    <aside className="sidebar" aria-label={messages.appName}>
      <div className="sidebar-head">
        <NavLink className="brand" to="/today" onClick={onNavigate}>
          <span className="brand-mark" aria-hidden="true">
            t
          </span>
          <span className="brand-name">{messages.appName}</span>
        </NavLink>
        <button
          type="button"
          className="icon-button sidebar-capture"
          aria-keyshortcuts="N"
          aria-label={messages.fab}
          onClick={onCapture}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <nav aria-busy={waiting}>
        {waiting ? (
          <ul className="nav-list" aria-hidden="true">
            {['a', 'b', 'c', 'd', 'e', 'f'].map((key) => (
              <li key={key} className="nav-skeleton" />
            ))}
          </ul>
        ) : (
          <>
            <ul className="nav-list">
              {smartLinks !== null
                ? smartLinks.map((link) => (
                    <SmartRow
                      key={link.key}
                      link={link}
                      messages={messages}
                      onNavigate={onNavigate}
                    />
                  ))
                : SIDEBAR_LINKS.filter((link) => link.labelKey !== 'navHabits').map((link) => (
                    <StaticRow
                      key={link.to}
                      link={link}
                      messages={messages}
                      onNavigate={onNavigate}
                    />
                  ))}
            </ul>
            {filterLinks !== null && filterLinks.length > 0 ? (
              <section>
                <h2 className="nav-section">{messages.filtersTitle}</h2>
                <ul className="nav-list">
                  {filterLinks.map((link) => (
                    <FilterRow key={link.id} link={link} onNavigate={onNavigate} />
                  ))}
                </ul>
              </section>
            ) : null}
            {projectLinks !== null && projectLinks.length > 0 ? (
              <section>
                <h2 className="nav-section">{messages.navLists}</h2>
                <ul className="nav-list">
                  {projectLinks.map((link) => (
                    <ProjectRow key={link.id} link={link} onNavigate={onNavigate} />
                  ))}
                </ul>
              </section>
            ) : null}
            <ul className="nav-list">
              <StaticRow
                link={{ to: '/habits', labelKey: 'navHabits' }}
                messages={messages}
                onNavigate={onNavigate}
              />
            </ul>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <button
          type="button"
          className="icon-button"
          aria-label={`${messages.themeLabel}: ${themeLabel}`}
          onClick={() => {
            setPreference(nextTheme(preference));
          }}
        >
          <ThemeIcon preference={preference} />
        </button>
        <NavLink
          className="icon-button"
          to="/settings/appearance"
          aria-label={messages.appearanceTitle}
          title={messages.appearanceTitle}
          onClick={onNavigate}
        >
          <Palette size={18} aria-hidden="true" />
        </NavLink>
        <button
          type="button"
          className="icon-button collapse-button"
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
        </button>
      </div>
    </aside>
  );
}

function SmartRow({
  link,
  messages,
  onNavigate,
}: {
  readonly link: SidebarSmartLink;
  readonly messages: Messages;
  readonly onNavigate: () => void;
}) {
  const Icon = ICONS[link.labelKey];
  const label = messages[link.labelKey];
  return (
    <li className={link.separated ? 'nav-separated' : undefined}>
      <NavLink
        className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
        to={link.to}
        end
        aria-label={label}
        title={label}
        onClick={onNavigate}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="nav-label">{label}</span>
        <span className="nav-count">{link.count}</span>
      </NavLink>
    </li>
  );
}

function StaticRow({
  link,
  messages,
  onNavigate,
}: {
  readonly link: SidebarLink;
  readonly messages: Messages;
  readonly onNavigate: () => void;
}) {
  const Icon = ICONS[link.labelKey];
  const label = messages[link.labelKey];
  return (
    <li>
      <NavLink
        className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
        to={link.to}
        end
        aria-label={label}
        title={label}
        onClick={onNavigate}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="nav-label">{label}</span>
      </NavLink>
    </li>
  );
}

function ProjectRow({
  link,
  onNavigate,
}: {
  readonly link: SidebarProject;
  readonly onNavigate: () => void;
}) {
  return (
    <li>
      <NavLink
        className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
        to={link.to}
        aria-label={link.name}
        title={link.name}
        onClick={onNavigate}
      >
        <span
          className="list-dot"
          style={link.color === null ? undefined : { backgroundColor: link.color }}
          aria-hidden="true"
        />
        <span className="nav-label">{link.name}</span>
        <span className="nav-count">{link.count}</span>
      </NavLink>
    </li>
  );
}

function FilterRow({
  link,
  onNavigate,
}: {
  readonly link: SidebarFilter;
  readonly onNavigate: () => void;
}) {
  return (
    <li>
      <NavLink
        className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
        to={link.to}
        aria-label={link.name}
        title={link.name}
        onClick={onNavigate}
      >
        <span
          className="list-dot"
          style={link.color === null ? undefined : { backgroundColor: link.color }}
          aria-hidden="true"
        />
        <span className="nav-label">{link.name}</span>
        <span className="nav-count">{link.count}</span>
      </NavLink>
    </li>
  );
}

function ThemeIcon({ preference }: { readonly preference: ThemePreference }) {
  if (preference === 'light') {
    return <Sun size={18} aria-hidden="true" />;
  }
  if (preference === 'dark') {
    return <Moon size={18} aria-hidden="true" />;
  }
  return <Monitor size={18} aria-hidden="true" />;
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
