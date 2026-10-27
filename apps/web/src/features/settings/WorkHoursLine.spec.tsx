// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkHoursLine } from './WorkHoursLine';

const mock = vi.hoisted(() => ({
  updateWork: vi.fn(() =>
    Promise.resolve({
      hide_work_outside_hours: true,
      is_work_time_now: false,
      work_hidden_now: false,
    }),
  ),
  hidden: true,
}));

vi.mock('../../api', () => ({
  api: {
    getMe: () => Promise.resolve({ time_zone: 'Europe/Madrid' }),
    getWorkContext: () =>
      Promise.resolve({
        hide_work_outside_hours: true,
        is_work_time_now: false,
        work_hidden_now: mock.hidden,
      }),
    updateWorkContext: mock.updateWork,
  },
}));

vi.mock('../tasks/refresh', () => ({
  refreshTaskSurfaces: () => Promise.resolve(),
}));

afterEach(() => {
  cleanup();
  mock.hidden = true;
  vi.clearAllMocks();
});

it('offers Mostrar trabajo outside hours and toggles it', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <WorkHoursLine />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/fuera de jornada/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar trabajo' }));
  await waitFor(() => {
    expect(mock.updateWork).toHaveBeenCalledWith({ show_work: true });
  });
});
