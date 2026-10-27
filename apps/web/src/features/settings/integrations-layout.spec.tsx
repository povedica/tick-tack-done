// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { IntegrationSettings } from '../product/ProductPages';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
});

const data = vi.hoisted(() => {
  const google: Record<string, unknown> = {
    has_connection: true,
    authorized: true,
    enabled: true,
    account: 'ada@example.test',
    status: 'connected',
    configured: true,
  };
  const drive: Record<string, unknown> = { ...google };
  const telegram: Record<string, unknown> = {
    state: 'linked',
    configured: true,
    linked: true,
    bot_username: 'reflexionia_todo_bot',
    username: 'ada',
    display_name: 'Ada Lovelace',
    linked_at: '2026-10-27T06:12:56.000Z',
    enabled: true,
  };
  return { google, drive, telegram, inbound: { active: false }, desktop: true };
});

vi.mock('../../api', () => ({
  api: {
    integrationStatus: (kind: string) =>
      Promise.resolve(
        kind === 'drive' ? data.drive : kind === 'telegram' ? data.telegram : data.google,
      ),
    inboundEmail: () => Promise.resolve(data.inbound),
  },
}));

function media(query: string) {
  const desktop = data.desktop;
  const matches = query.includes('min-width')
    ? desktop && query.includes('768')
    : !desktop && query.includes('max-width');
  return {
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  data.desktop = true;
  data.google = {
    has_connection: true,
    authorized: true,
    enabled: true,
    account: 'ada@example.test',
    status: 'connected',
    configured: true,
  };
  data.drive = { ...data.google };
  data.telegram = {
    state: 'linked',
    configured: true,
    linked: true,
    bot_username: 'reflexionia_todo_bot',
    username: 'ada',
    display_name: 'Ada Lovelace',
    linked_at: '2026-10-27T06:12:56.000Z',
    enabled: true,
  };
  data.inbound = { active: false };
  vi.stubGlobal('matchMedia', media);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntegrationSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('renders one row per service with labeled switches and a stopped mail chip', async () => {
  mount();
  expect(await screen.findByText('Servicios conectados a ttd y qué pueden hacer.')).toBeTruthy();
  const google = await screen.findByRole('article', { name: 'Google' });
  const telegram = screen.getByRole('article', { name: 'Telegram' });
  const mail = screen.getByRole('article', { name: 'Correo a tarea' });
  expect(await within(google).findByText('ada@example.test')).toBeTruthy();
  expect(within(google).getByRole('switch', { name: /Google Calendar/ })).toBeTruthy();
  expect(within(google).getByRole('switch', { name: /Google Drive/ })).toBeTruthy();
  expect(within(telegram).getByRole('switch', { name: /Avisos/ })).toBeTruthy();
  expect(within(mail).getByText('Parada')).toBeTruthy();
  expect(within(mail).getByRole('button', { name: 'Generar dirección' })).toBeTruthy();
  expect(within(mail).queryByRole('button', { name: 'Más acciones' })).toBeNull();
});

it('keeps destructive Google actions in the overflow and closes it with Escape', async () => {
  mount();
  const google = await screen.findByRole('article', { name: 'Google' });
  expect(await within(google).findByRole('button', { name: 'Cambiar permisos' })).toBeTruthy();
  fireEvent.click(within(google).getByRole('button', { name: 'Más acciones' }));
  expect(await screen.findByRole('button', { name: 'Desconectar Google' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Desconectar Google' })).toBeNull();
});

it('shows Sin permiso with Autorizar when Drive has no grant', async () => {
  data.drive = {
    configured: true,
    authorized: false,
    enabled: true,
    status: 'permission_required',
    account: 'ada@example.test',
  };
  mount();
  const drive = await screen.findByRole('group', { name: 'Google Drive' });
  expect(await within(drive).findByText('Sin permiso')).toBeTruthy();
  expect(within(drive).getByRole('button', { name: 'Autorizar Google Drive' })).toBeTruthy();
  expect(within(drive).queryByRole('switch')).toBeNull();
});

it('opens the mobile sheet with safe actions above the destructive ones', async () => {
  data.desktop = false;
  mount();
  const telegram = await screen.findByRole('article', { name: 'Telegram' });
  await within(telegram).findByRole('switch', { name: /Avisos/ });
  expect(within(telegram).queryByRole('button', { name: 'Probar' })).toBeNull();
  fireEvent.click(within(telegram).getByRole('button', { name: 'Más acciones' }));
  const dialog = screen.getByRole('dialog', { name: 'Telegram' });
  const labels = within(dialog)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
  expect(labels.some((label) => label.includes('Probar'))).toBe(true);
  expect(labels.some((label) => label.includes('Desvincular Telegram'))).toBe(true);
  expect(labels.findIndex((label) => label.includes('Probar'))).toBeLessThan(
    labels.findIndex((label) => label.includes('Desvincular Telegram')),
  );
});
