// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { WorkdaySettings } from './WorkdaySettings';

const mock = vi.hoisted(() => ({
  updateMe: vi.fn(() => Promise.resolve({})),
  updateWork: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../api', () => ({
  api: {
    getMe: () =>
      Promise.resolve({
        id: 'user',
        email: 'ada@example.test',
        default_task_duration_minutes: 30,
        deadline_soon_days: 2,
        evening_start: '18:00',
        shutdown_reminder_time: null,
      }),
    getWorkContext: () =>
      Promise.resolve({
        work_day_start: '09:00',
        work_day_end: '18:00',
        work_days: ['MO', 'TU', 'WE', 'TH', 'FR'],
        work_folder_ids: [],
        work_project_ids: [],
        work_tag_ids: ['tag-curro'],
        hide_work_outside_hours: false,
        show_work_until: null,
        is_work_time_now: false,
        work_hidden_now: false,
        next_work_start: null,
        counts: { lists: 1, tags: 1, active_tasks: 2 },
      }),
    updateMe: mock.updateMe,
    updateWorkContext: mock.updateWork,
    listFolders: () => Promise.resolve({ items: [{ id: 'folder', name: 'Trabajo' }] }),
    listProjects: () =>
      Promise.resolve({ items: [{ id: 'list', name: 'casa', active_task_count: 3 }] }),
    listTags: () =>
      Promise.resolve({
        items: [
          { id: 'tag-curro', name: 'curro', active_task_count: 2 },
          { id: 'tag-casa', name: 'casa', active_task_count: 1 },
        ],
      }),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <WorkdaySettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('saves working days with the form and toggles hiding immediately', async () => {
  renderPage();
  expect(
    await screen.findByText(
      'Tu horario de trabajo. ttd lo usa para estimar la carga del día y, si quieres, para separar trabajo y personal.',
    ),
  ).toBeTruthy();
  expect(screen.getByText(/Ahora cuentan como laboral 1 lista y 1 etiqueta/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'sábado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => {
    expect(mock.updateMe).toHaveBeenCalledWith(
      expect.objectContaining({ work_days: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'] }),
    );
  });
  expect(mock.updateWork).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('switch', { name: 'Ocultar lo laboral fuera de jornada' }));
  await waitFor(() => {
    expect(mock.updateWork).toHaveBeenCalledWith({ hide_work_outside_hours: true });
  });
});

it('adds a tag immediately from the picker', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Añadir Etiquetas' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), { target: { value: 'ca' } });
  fireEvent.click(screen.getByRole('button', { name: /casa/ }));
  await waitFor(() => {
    expect(mock.updateWork).toHaveBeenCalledWith({ work_tag_ids: ['tag-curro', 'tag-casa'] });
  });
});
