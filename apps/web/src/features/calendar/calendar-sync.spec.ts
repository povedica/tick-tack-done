// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type * as I18n from '../../i18n';
import { GlobalKeys } from '../../shell/GlobalKeys';
import { CalendarSyncButton, GoogleCalendarHealthBanner } from './GoogleCalendarHealthBanner';

const syncCalendars = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({
  api: {
    syncCalendars,
    getCalendarSyncStatus: vi.fn(),
  },
}));

vi.mock('../../i18n', async (original) => {
  const actual = await original<typeof I18n>();
  return { ...actual, useMessages: () => actual.messagesFor('es') };
});

afterEach(() => {
  cleanup();
  syncCalendars.mockReset();
  sessionStorage.clear();
});

it('RF-2564: the banner asks to reconnect and keeps the rest of the page free to show events', () => {
  const client = new QueryClient();
  client.setQueryData(['calendar-sync-status'], {
    google: { status: 'reauth_required', connected: false, account: 'ada@example.com' },
    subscriptions: [
      {
        id: 'sub-1',
        health: 'reconnect_required',
        last_error: 'google_reconnect_required',
        last_synced_at: '2026-11-10T08:00:00.000Z',
      },
    ],
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        null,
        createElement(
          'div',
          null,
          createElement(GoogleCalendarHealthBanner),
          createElement('p', null, 'Lenguaje musical'),
        ),
      ),
    ),
  );
  expect(screen.getByRole('status').textContent).toContain('Google Calendar necesita reconectarse');
  expect(screen.getByRole('link', { name: 'Reconectar Google' }).getAttribute('href')).toBe(
    '/settings/integrations',
  );
  expect(screen.getByText('Lenguaje musical')).toBeTruthy();
  client.clear();
});

it('RF-2565: the calendar button posts /calendar/sync', async () => {
  let finish: (value: { subscriptions: never[] }) => void = () => undefined;
  syncCalendars.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = new QueryClient();
  render(createElement(QueryClientProvider, { client }, createElement(CalendarSyncButton)));
  fireEvent.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));
  await vi.waitFor(() => {
    expect(document.querySelector('.calendar-sync svg')?.classList.contains('is-spinning')).toBe(
      true,
    );
  });
  finish({ subscriptions: [] });
  await vi.waitFor(() => {
    expect(syncCalendars).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.calendar-sync svg')?.classList.contains('is-spinning')).toBe(
      false,
    );
  });
  client.clear();
});

it('RF-2565: the period shortcut syncs and then refreshes cached events', async () => {
  syncCalendars.mockResolvedValue({ subscriptions: [] });
  const client = new QueryClient();
  client.setQueryData(['me'], { id: 'user-1' });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, createElement(GlobalKeys, { onHelp: () => undefined })),
    ),
  );
  fireEvent.keyDown(window, { key: '.' });
  await vi.waitFor(() => {
    expect(syncCalendars).toHaveBeenCalledTimes(1);
  });
  await vi.waitFor(() => {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['calendar-events'] });
  });
  client.clear();
});
