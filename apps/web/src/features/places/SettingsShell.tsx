import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useMessages, type Messages } from '../../i18n';

const SETTINGS_GROUPS = [
  [
    'groupGeneral',
    ['/settings/account', '/settings/appearance', '/settings/workday', '/settings/features'],
  ],
  [
    'groupWork',
    [
      '/settings/capture',
      '/settings/focus',
      '/settings/notifications',
      '/settings/smart-lists',
      '/settings/calendar',
    ],
  ],
  [
    'groupAdvanced',
    [
      '/settings/tokens',
      '/settings/integrations',
      '/settings/automations',
      '/settings/webhooks',
      '/settings/plugins',
      '/settings/sharing',
      '/settings/data',
      '/settings/shortcuts',
      '/settings/about',
    ],
  ],
] as const;

function settingsLabel(messages: Messages, path: string): string {
  const labels: Record<string, string> = {
    '/settings/about': messages.aboutTitle,
    '/settings/account': messages.settingsAccount,
    '/settings/workday': messages.settingsWorkday,
    '/settings/features': messages.settingsFeatures,
    '/settings/appearance': messages.appearanceTitle,
    '/settings/capture': messages.settingsCapture,
    '/settings/focus': messages.focusSettingsTitle,
    '/settings/notifications': messages.settingsNotifications,
    '/settings/smart-lists': messages.settingsSmart,
    '/settings/calendar': messages.settingsCalendar,
    '/settings/tokens': messages.settingsTokens,
    '/settings/integrations': messages.settingsIntegrations,
    '/settings/automations': messages.settingsAutomations,
    '/settings/webhooks': messages.settingsWebhooks,
    '/settings/data': messages.settingsData,
    '/settings/plugins': messages.settingsPlugins,
    '/settings/sharing': messages.settingsSharing,
    '/settings/shortcuts': messages.settingsShortcuts,
  };
  return labels[path] ?? path;
}

export function SettingsHome() {
  const messages = useMessages();
  return (
    <section>
      <h1>{messages.settingsTitle}</h1>
      <p>{messages.settingsHome}</p>
      <nav className="settings-nav">
        {SETTINGS_GROUPS.flatMap(([, paths]) => paths).map((path) => (
          <NavLink key={path} to={path}>
            {settingsLabel(messages, path)}
          </NavLink>
        ))}
      </nav>
    </section>
  );
}

export function SettingsLayout() {
  const messages = useMessages();
  const location = useLocation();
  const section = location.pathname === '/settings' ? 'index' : 'child';
  return (
    <div className="settings-layout" data-section={section}>
      <nav className="settings-nav" aria-label={messages.settingsTitle}>
        {SETTINGS_GROUPS.map(([group, paths]) => (
          <div key={group}>
            <h2>{messages[group]}</h2>
            {paths.map((path) => (
              <NavLink key={path} to={path}>
                {settingsLabel(messages, path)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="settings-main">
        {section === 'child' ? (
          <Link className="settings-back" to="/settings">
            {messages.settingsBack}
          </Link>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}
