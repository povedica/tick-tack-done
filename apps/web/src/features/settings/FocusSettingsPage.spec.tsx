// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { FocusSettingsPage } from './FocusSettingsPage';
const mock = vi.hoisted(() => ({
  save: vi.fn((body: Record<string, unknown>) =>
    Promise.resolve({
      pomodoroMinutes: body.pomodoro_minutes,
    }),
  ),
  get: vi.fn(() => Promise.resolve({ pomodoroMinutes: 25 })),
}));
vi.mock('../../api', () => ({
  api: { getFocusSettings: mock.get, updateFocusSettings: mock.save },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('TTD-AUD-129 RF-1201: rejects invalid duration locally and shares saved settings', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <FocusSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const field = await screen.findByLabelText<HTMLInputElement>('Duración del pomo');
  fireEvent.change(field, { target: { value: '200' } });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Entre 5 y 180, de 5 en 5')).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar' }).disabled).toBe(true);
  expect(mock.save).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => {
    expect(cache.getQueryData(['focus-settings'])).toEqual({ pomodoroMinutes: 45 });
  });
});
