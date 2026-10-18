import {
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Check,
  Clock,
  Inbox,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  Sunrise,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { messagesFor, type Messages } from '../i18n';
import { nextTheme, type ThemePreference } from '../theme/preference';
import { useThemePreference } from '../theme/store';
import { SIDEBAR_LINKS, type SidebarLink } from './navigation';

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

  return (
    <aside className="sidebar" aria-label={messages.appName}>
      <NavLink className="brand" to="/today" onClick={onNavigate}>
        <span className="brand-name">{messages.appName}</span>
      </NavLink>
      <button type="button" className="sidebar-capture" aria-keyshortcuts="N" onClick={onCapture}>
        <Plus size={18} aria-hidden="true" />
        <span>{messages.fab}</span>
      </button>
      <nav>
        <ul className="nav-list">
          {SIDEBAR_LINKS.map((link) => {
            const Icon = ICONS[link.labelKey];
            const label = messages[link.labelKey];
            return (
              <li key={link.to}>
                <NavLink
                  className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
                  to={link.to}
                  end
                  aria-label={label}
                  title={label}
                  onClick={onNavigate}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="nav-label">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
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
        <NavLink className="text-button" to="/settings/appearance" onClick={onNavigate}>
          {messages.appearanceTitle}
        </NavLink>
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
