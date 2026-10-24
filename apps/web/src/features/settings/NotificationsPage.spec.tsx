// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsPage } from './NotificationsPage';
import { es } from './i18n-wt-c';
vi.mock('../../api', () => ({ api: {} }));
vi.mock('./LegacyNotificationSettings', () => ({ LegacyNotificationSettings: () => null }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.unstubAllGlobals();
});
function mount(state = 'none', pushConfigured = false) {
  vi.stubGlobal('Notification', { permission: 'denied' });
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  clients.push(client);
  client.setQueryData(['notification-settings'], {
    preferences: [],
    channels: {
      push: { configured: pushConfigured, public_key: '' },
      email: { address: 'test@example.test' },
      telegram: {
        state,
        linked: state === 'linked',
        username: null,
        display_name: state === 'linked' ? 'Persona sin alias' : null,
      },
    },
    quiet_hours: { days: [] },
    time_zone: 'UTC',
  });
  client.setQueryData(['notification-deliveries'], {
    pages: [{ items: [], next_cursor: null }],
    pageParams: [undefined],
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
  return screen.getAllByRole('columnheader');
}
function required(value: HTMLElement | undefined): HTMLElement {
  if (!value) throw new Error('Missing matrix header');
  return value;
}
describe('RF-802/2003: coherent notification channel matrix', () => {
  it('gives server configuration priority over denied browser permission', () => {
    const headers = mount();
    expect(headers[1]?.textContent).toContain('No configurado en el servidor');
    expect(
      within(required(headers[1])).getByRole<HTMLButtonElement>('button', { name: 'Probar' })
        .disabled,
    ).toBe(true);
    for (const button of screen
      .getAllByRole<HTMLButtonElement>('switch')
      .filter((element) => element.getAttribute('aria-label')?.endsWith('Push')))
      expect(button.disabled).toBe(true);
  });
  it('preserves denied browser permission when the server is configured', () => {
    expect(mount('none', true)[1]?.textContent).toContain('Bloqueado en el navegador');
  });
  it.each(['none', 'token_saved', 'webhook_ok', 'linked', 'blocked', 'error'] as const)(
    'shows %s without an empty @ and disables unavailable Telegram',
    (state) => {
      const header = required(mount(state)[3]);
      const label = header.querySelector('.notification-channel-state');
      expect(label?.getAttribute('data-state')).toBe(state);
      expect(label?.textContent).toBe(state === 'linked' ? 'Persona sin alias' : es[state]);
      expect(label?.textContent).not.toBe('@');
      expect(
        within(header).getByRole<HTMLButtonElement>('button', { name: 'Probar' }).disabled,
      ).toBe(state !== 'linked');
      for (const button of screen
        .getAllByRole<HTMLButtonElement>('switch')
        .filter((element) => element.getAttribute('aria-label')?.endsWith('Telegram')))
        expect(button.disabled).toBe(state !== 'linked');
    },
  );
});
