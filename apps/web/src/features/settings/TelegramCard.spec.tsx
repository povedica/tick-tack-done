// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelegramCard } from './TelegramCard';
const telegramMocks = vi.hoisted(() => ({
  status: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
  test: vi.fn<() => Promise<Record<string, unknown>>>(),
}));
vi.mock('../../api', () => ({
  api: {
    integrationStatus: telegramMocks.status,
    testNotification: telegramMocks.test,
    createTelegramPairing: vi.fn(() =>
      Promise.resolve({
        code: 'synthetic-pairing-code',
        bot_username: 'test_bot',
        expires_at: new Date(Date.now() + 600000).toISOString(),
      }),
    ),
  },
}));
beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('RF-2003: bot actions follow the canonical state', () => {
  it.each(['none', 'token_saved', 'webhook_ok', 'linked', 'blocked', 'error'])(
    'shows the correct actions for %s',
    (state) => {
      const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
      });
      client.setQueryData(['telegram'], {
        state,
        configured: state !== 'none',
        linked: state === 'linked',
        bot_username: 'test_bot',
        display_name: 'Persona',
      });
      render(
        <QueryClientProvider client={client}>
          <TelegramCard />
        </QueryClientProvider>,
      );
      if (state === 'token_saved' || state === 'error') {
        expect(screen.queryByText('Sin configurar')).toBeNull();
      }
      if (state === 'none')
        expect(screen.getByRole('button', { name: 'Conectar bot' })).toBeTruthy();
      else {
        expect(screen.getByRole('button', { name: 'Quitar bot' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Reemplazar token' })).toBeTruthy();
      }
      expect(screen.queryByRole('button', { name: 'Reintentar webhook' }) !== null).toBe(
        state === 'token_saved' || state === 'error',
      );
      expect(screen.queryByRole('button', { name: 'Probar' }) !== null).toBe(
        state === 'linked' || state === 'blocked',
      );
    },
  );
});

it('RF-2003: refreshes canonical state after a notification test changes the bot to error', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(['telegram'], {
    state: 'linked',
    configured: true,
    linked: true,
    bot_username: 'test_bot',
    display_name: 'Persona',
  });
  telegramMocks.status.mockResolvedValue({
    state: 'error',
    configured: true,
    linked: false,
    bot_username: 'test_bot',
  });
  telegramMocks.test.mockRejectedValue(new Error('Synthetic delivery rejected'));
  render(
    <QueryClientProvider client={client}>
      <TelegramCard />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Probar' }));
  await waitFor(() => {
    expect(document.querySelector('.telegram-status')?.getAttribute('data-status')).toBe('error');
  });
  expect(screen.getByRole('button', { name: 'Reintentar webhook' })).toBeTruthy();
  client.clear();
});
