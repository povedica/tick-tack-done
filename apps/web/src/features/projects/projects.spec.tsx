// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ProjectOverviewItem } from '@reflexionia/sdk';
import { acceptsProjectDrag, PROJECT_DRAG_MIME, TASK_DRAG_MIME } from './project-drag';
import { deleteButtonLabel, taskImpactLine } from './projects-text';
import { ProjectsPage } from './ProjectsPage';
import { ProjectCard } from './ProjectCard';
import { ProjectMenu } from './ProjectMenu';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { useProjectsCopy } from './projects-text';
import { createElement } from 'react';

const overview = vi.hoisted(() => ({
  items: [] as ProjectOverviewItem[],
  counts: { active: 0, paused: 0, archived: 0 },
  next_cursor: null,
}));
const impact = vi.hoisted(() => ({
  task_count: 0,
  completed_count: 0,
  open_count: 0,
  name: 'viaje-londres',
  fail: false,
}));

vi.mock('../../api', async () => {
  const { ApiError } = await import('@reflexionia/sdk');
  return {
    api: {
      projectOverview: () => Promise.resolve(overview),
      listProjects: () => Promise.resolve({ items: [], next_cursor: null }),
      getProjectDeletionImpact: () =>
        Promise.resolve({
          project_id: 'archived-1',
          name: impact.name,
          is_project: true,
          closed: true,
          task_count: impact.task_count,
          completed_count: impact.completed_count,
          open_count: impact.open_count,
          subtask_count: 0,
        }),
      deleteProject: () => {
        if (impact.fail) {
          return Promise.reject(new ApiError(409, 'confirmation_mismatch', 'changed'));
        }
        return Promise.resolve();
      },
      setProjectState: () => Promise.resolve({}),
      updateProject: () => Promise.resolve({}),
      createTask: () => Promise.resolve({ id: 'task', title: 'Paso', warnings: [] }),
      reviewProjects: () => Promise.resolve({ reviewed: 1 }),
    },
  };
});

function item(
  patch: Partial<ProjectOverviewItem> & Pick<ProjectOverviewItem, 'id' | 'name' | 'state'>,
): ProjectOverviewItem {
  return {
    color: '#FFAC38',
    folder_id: null,
    outcome: 'Un final claro',
    project_status_changed_at: '2026-10-19T10:00:00.000Z',
    closed_at: null,
    created_at: '2026-10-18T10:00:00.000Z',
    project_reviewed_at: null,
    done_count: 1,
    total_count: 3,
    open_count: 2,
    next_action: {
      task_id: 'task',
      title: 'Llamar',
      due_date: '2026-10-26T00:00:00.000Z',
      start_date: null,
      is_all_day: true,
    },
    last_activity_at: '2026-10-26T10:00:00.000Z',
    attention: null,
    ...patch,
  };
}

function mount(node: React.ReactNode) {
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(MemoryRouter, null, node),
    ),
  );
}

const storage = new Map<string, string>();

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function ResizeObserver() {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    }),
  );
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  overview.items = [];
  overview.counts = { active: 0, paused: 0, archived: 0 };
  impact.fail = false;
  vi.unstubAllGlobals();
});

it('rejects a task drag and accepts a project drag', () => {
  expect(acceptsProjectDrag([PROJECT_DRAG_MIME])).toBe(true);
  expect(acceptsProjectDrag([TASK_DRAG_MIME, 'text/plain'])).toBe(false);
  expect(acceptsProjectDrag([])).toBe(false);
});

it('describes deletion for 0, 1 and many tasks', () => {
  expect(taskImpactLine(0, 0, 0, false)).toBe('No tiene tareas');
  expect(deleteButtonLabel(0, false)).toBe('Eliminar lista');
  expect(taskImpactLine(1, 1, 0, false)).toBe('Su 1 tarea (1 completada)');
  expect(deleteButtonLabel(1, false)).toBe('Eliminar lista y 1 tarea');
  expect(taskImpactLine(12, 8, 4, false)).toBe('Sus 12 tareas (8 completadas, 4 pendientes)');
  expect(deleteButtonLabel(42, false)).toBe('Eliminar lista y 42 tareas');
});

it('shows columns, a folded archive row and the empty garden of projects', async () => {
  overview.items = [
    item({ id: 'a', name: 'busqueda-empleo', state: 'active' }),
    item({ id: 'p', name: 'cadaques-26', state: 'paused', color: null }),
    item({
      id: 'z',
      name: 'viaje-londres',
      state: 'archived',
      closed_at: '2026-10-18T10:00:00.000Z',
      outcome: null,
      next_action: null,
    }),
  ];
  overview.counts = { active: 1, paused: 1, archived: 1 };
  mount(createElement(ProjectsPage));
  expect(await screen.findByRole('heading', { name: 'Proyectos' })).toBeTruthy();
  expect(await screen.findByText('En marcha')).toBeTruthy();
  expect(screen.getByText('Pausados')).toBeTruthy();
  expect(screen.getByText('Ver archivados 1')).toBeTruthy();
  expect(screen.queryByText('viaje-londres')).toBeNull();
  fireEvent.click(screen.getByText('Ver archivados 1'));
  expect(screen.getByText('viaje-londres')).toBeTruthy();
  expect(localStorage.getItem('ttd.projects.archivedOpen')).toBe('true');
});

it('paints the list color, a grey icon and the created date', () => {
  function CardProbe({ row }: { readonly row: ProjectOverviewItem }) {
    const copy = useProjectsCopy();
    return createElement(ProjectCard, {
      item: row,
      copy,
      now: '2026-10-27T12:00:00.000Z',
      timeZone: 'UTC',
      dragging: false,
      draggable: true,
      onMenu: () => undefined,
      onContextMenu: () => undefined,
      onDragStart: () => undefined,
      onDragEnd: () => undefined,
    });
  }
  const { rerender } = render(
    createElement(
      MemoryRouter,
      null,
      createElement(CardProbe, { row: item({ id: 'a', name: 'tu-rugby', state: 'active' }) }),
    ),
  );
  expect(screen.getByText('creado 18 oct')).toBeTruthy();
  expect(document.querySelector('svg')).toBeTruthy();
  rerender(
    createElement(
      MemoryRouter,
      null,
      createElement(CardProbe, {
        row: item({
          id: 'b',
          name: 'sin-color',
          state: 'paused',
          color: null,
          next_action: null,
          total_count: 0,
          done_count: 0,
        }),
      }),
    ),
  );
  expect(screen.getByText('Sin próxima acción')).toBeTruthy();
  expect(screen.getByText('0 de 0')).toBeTruthy();
});

it('offers pause, resume and delete according to the column', () => {
  function MenuProbe({ state }: { readonly state: ProjectOverviewItem['state'] }) {
    const copy = useProjectsCopy();
    return createElement(ProjectMenu, {
      item: item({ id: state, name: 'viaje-londres', state }),
      copy,
      now: '2026-10-27T12:00:00.000Z',
      timeZone: 'UTC',
      anchor: { current: null },
      open: true,
      sheet: state !== 'archived',
      onClose: () => undefined,
      onAction: () => undefined,
    });
  }
  const { rerender } = render(createElement(MenuProbe, { state: 'active' }));
  expect(screen.getByText('Pausar')).toBeTruthy();
  expect(screen.getByText('Archivar')).toBeTruthy();
  expect(screen.queryByText('Eliminar…')).toBeNull();
  rerender(createElement(MenuProbe, { state: 'paused' }));
  expect(screen.getByText('Reanudar')).toBeTruthy();
  rerender(createElement(MenuProbe, { state: 'archived' }));
  expect(screen.getByText('Desarchivar')).toBeTruthy();
  expect(screen.getByText('Eliminar…')).toBeTruthy();
});

it('asks again when the task count changed', async () => {
  impact.task_count = 42;
  impact.completed_count = 42;
  impact.open_count = 0;
  function DialogProbe() {
    const copy = useProjectsCopy();
    return createElement(DeleteProjectDialog, {
      projectId: 'archived-1',
      name: 'viaje-londres',
      copy,
      onClose: () => undefined,
    });
  }
  mount(createElement(DialogProbe));
  expect(await screen.findByRole('heading', { name: '¿Eliminar viaje-londres?' })).toBeTruthy();
  expect(await screen.findByText('Sus 42 tareas (42 completadas)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Eliminar lista y 42 tareas' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBe(document.activeElement);
  impact.fail = true;
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar lista y 42 tareas' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Ha cambiado el número de tareas. Revisa antes de eliminar.',
  );
});

it('uses mobile tabs instead of the folded archive row', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('768'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
  overview.items = [item({ id: 'a', name: 'busqueda-empleo', state: 'active' })];
  overview.counts = { active: 2, paused: 1, archived: 3 };
  mount(createElement(ProjectsPage));
  expect(await screen.findByRole('tab', { name: 'En marcha 2' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Pausados 1' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Archivados 3' })).toBeTruthy();
  expect(screen.queryByText('Ver archivados 3')).toBeNull();
  vi.unstubAllGlobals();
});
