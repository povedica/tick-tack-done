// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { FocusPage } from './FocusPage';
const mock = vi.hoisted(() => ({
  settings: { pomodoroMinutes: 35 },
  sessions: [] as Record<string, unknown>[],
}));
vi.mock('../../api', () => ({
  api: {
    getMe: () => Promise.resolve({ time_zone: 'Europe/Madrid' }),
    getFocusSettings: () => Promise.resolve(mock.settings),
    listFocusSessions: () => Promise.resolve({ items: mock.sessions }),
    focusStats: () => Promise.resolve({}),
    listTasks: () => Promise.resolve({ items: [] }),
    updateFocusSettings: (body: { pomodoro_minutes: number }) => {
      mock.settings = { pomodoroMinutes: body.pomodoro_minutes };
      return Promise.resolve(mock.settings);
    },
  },
}));
afterEach(() => {
  cleanup();
  mock.settings = { pomodoroMinutes: 35 };
  mock.sessions = [];
});
function mount() {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <FocusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('TTD-AUD-129 RF-1201: presets are visible before editing including configured duration', async () => {
  mount();
  const custom = await screen.findByRole('button', { name: '35' });
  expect(custom.getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByRole('spinbutton')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '15' }));
  await waitFor(() => {
    expect(screen.getByRole('timer').textContent).toBe('15:00');
  });
  expect(screen.getByRole('button', { name: '15' }).getAttribute('aria-pressed')).toBe('true');
});
it('TTD-AUD-129 RF-1205: running sessions hide duration presets', async () => {
  mock.sessions = [
    {
      id: 'session',
      ended_at: null,
      type: 'focus',
      remaining_seconds: 100,
      planned_minutes: 25,
      started_at: new Date().toISOString(),
    },
  ];
  mount();
  await screen.findByRole('timer');
  expect(screen.queryByRole('button', { name: '15' })).toBeNull();
});
