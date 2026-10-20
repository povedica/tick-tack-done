import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { useMessages } from '../i18n';

export function AccountMenu() {
  const messages = useMessages();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const cache = useQueryClient();
  const navigate = useNavigate();
  const name = me.data?.display_name.trim().length
    ? me.data.display_name
    : (me.data?.email ?? messages.settingsAccount);
  return (
    <details className="account-menu">
      <summary aria-label={messages.accountMenu}>
        <span className="account-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span>{name}</span>
      </summary>
      <div className="menu-card">
        <p>{me.data?.email}</p>
        <Link to="/statistics">{messages.navStatistics}</Link>
        <Link to="/settings/account">{messages.settingsAccount}</Link>
        <Link to="/settings/appearance">{messages.themeLabel}</Link>
        <Link to="/settings/shortcuts">{messages.shortcutsTitle}</Link>
        <button
          type="button"
          onClick={() => {
            void api.logout().then(() => {
              cache.clear();
              void navigate('/login', { replace: true });
            });
          }}
        >
          {messages.signOut}
        </button>
      </div>
    </details>
  );
}
