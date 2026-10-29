// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Folder, Project } from '@reflexionia/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { ListModal } from './ListModal';
import { openListModal, useListModalStore } from './list-modal-store';

const projects: Project[] = [];
const folders: Folder[] = [];

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listFolders: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  createFolder: vi.fn(),
}));

vi.mock('../api', () => ({ api }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.search}</div>;
}

function mount(entry = '/today') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <ListModal />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  projects.splice(0, projects.length);
  folders.splice(0, folders.length, folder('work', 'Trabajo'));
  projects.push(project('casa', 'Casa', { folder_id: 'work' }));
  api.listProjects.mockImplementation(() =>
    Promise.resolve({ items: [...projects], next_cursor: null }),
  );
  api.listFolders.mockImplementation(() =>
    Promise.resolve({ items: [...folders], next_cursor: null }),
  );
  api.createProject.mockImplementation((body: { name: string }) => {
    const created = project('new', body.name);
    projects.push(created);
    return Promise.resolve(created);
  });
  api.updateProject.mockImplementation((id: string, body: Partial<Project>) => {
    const current = projects.find((item) => item.id === id) ?? project(id, 'Casa');
    return Promise.resolve({ ...current, ...body });
  });
  api.createFolder.mockImplementation((body: { name: string }) => {
    const created = folder('made', body.name);
    folders.push(created);
    return Promise.resolve(created);
  });
  useListModalStore.getState().close();
});

afterEach(() => {
  cleanup();
  useListModalStore.getState().close();
});

describe('ListModal', () => {
  it('creates a list with no color and the chosen folder', async () => {
    mount();
    openListModal({ folderId: 'work' });
    expect(await screen.findByRole('dialog', { name: 'Nueva lista' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Notas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }));
    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Notas',
          folder_id: 'work',
          color: null,
          view_mode: 'list',
          is_project: false,
          outcome: null,
        }),
        expect.any(String),
      );
    });
  });

  it('edits only the fields that changed', async () => {
    mount();
    useListModalStore.getState().open({ editId: 'casa' });
    expect(await screen.findByRole('dialog', { name: 'Editar lista' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Casa nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(api.updateProject).toHaveBeenCalledWith('casa', { name: 'Casa nueva' });
    });
  });

  it('sends the outcome when the list is a project', async () => {
    mount();
    openListModal();
    await screen.findByRole('dialog', { name: 'Nueva lista' });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Viaje' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Es un proyecto' }));
    const outcome = await screen.findByLabelText('Resultado · opcional');
    fireEvent.change(outcome, { target: { value: 'Maleta cerrada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }));
    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ is_project: true, outcome: 'Maleta cerrada' }),
        expect.any(String),
      );
    });
  });

  it('opens from ?new=project with the switch on and clears the query on close', async () => {
    mount('/today?new=project');
    const toggle = await screen.findByRole('switch', { name: 'Es un proyecto' });
    expect(toggle instanceof HTMLInputElement && toggle.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByTestId('loc').textContent).toBe('');
  });
});

function project(id: string, name: string, extra: Partial<Project> = {}): Project {
  return {
    id,
    name,
    color: null,
    folder_id: null,
    view_mode: 'list',
    kind: 'TASK',
    closed: false,
    closed_at: null,
    is_inbox: false,
    is_project: false,
    project_status: 'active',
    state: 'active',
    outcome: null,
    project_status_changed_at: null,
    project_reviewed_at: null,
    default_reminder_trigger: null,
    sort_order: '1',
    active_task_count: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
    owner_id: extra.owner_id ?? 'me',
  };
}

function folder(id: string, name: string): Folder {
  return {
    id,
    name,
    sort_order: '1',
    project_count: 1,
    active_task_count: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
