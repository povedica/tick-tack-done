import { runAction } from '../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useEffect, useRef } from 'react';
import { BarChart3, Keyboard, LogOut, Palette, Settings } from 'lucide-react';
import { api } from '../api';
import { useMessages } from '../i18n';

export function AccountMenu() {
  const messages = useMessages();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        menu.current?.removeAttribute('open');
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        event.stopPropagation();
        menu.current.removeAttribute('open');
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, []);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const cache = useQueryClient();
  const navigate = useNavigate();
  const name = me.data?.display_name.trim().length
    ? me.data.display_name
    : (me.data?.email ?? messages.settingsAccount);
  return (
    <details className="account-menu" ref={menu}>
      <summary aria-label={messages.accountMenu} title={name}>
        <span className="account-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
      </summary>
      <div className="menu-card" onClick={() => menu.current?.removeAttribute('open')}>
        <p>
          <strong>{name}</strong>
          <br />
          {me.data?.email}
        </p>
        <Link to="/settings/account">
          <Settings size={16} aria-hidden="true" />
          {messages.navSettings}
        </Link>
        <Link to="/statistics">
          <BarChart3 size={16} aria-hidden="true" />
          {messages.navStatistics}
        </Link>
        <Link to="/settings/appearance">
          <Palette size={16} aria-hidden="true" />
          {messages.themeLabel}
        </Link>
        <Link to="/settings/shortcuts">
          <Keyboard size={16} aria-hidden="true" />
          {messages.shortcutsTitle}
        </Link>
        <button
          type="button"
          onClick={() => {
            runAction(
              api.logout().then(() => {
                cache.clear();
                runAction(Promise.resolve(navigate('/login', { replace: true })));
              }),
            );
          }}
        >
          <LogOut size={16} aria-hidden="true" />
          {messages.signOut}
        </button>
      </div>
    </details>
  );
}
