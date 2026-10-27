// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Folder, Project } from '@reflexionia/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { Sidebar } from './Sidebar';
import { LIST_MIME } from './list-drag';
import { dragHasList } from './list-drag';
import { TASK_MIME, dragHasTask } from '../features/today/drag';

const memoryStore = vi.hoisted(() => {
  const store = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  return memory;
});

const projects: Project[] = [];
const folders: Folder[] = [];
const archived: Project[] = [];

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  listSmartLists: vi.fn(),
  listProjects: vi.fn(),
  listFilters: vi.fn(),
  listTags: vi.fn(),
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  archiveProject: vi.fn(),
  unarchiveProject: vi.fn(),
  getProjectDeletionImpact: vi.fn(),
  moveTask: vi.fn(),
}));

vi.mock('../api', () => ({ api }));
vi.mock('../features/countdowns/api', () => ({
  countdownsApi: { list: () => Promise.resolve({ items: [] }) },
}));
vi.mock('../features/ticky/api', () => ({
  tickyApi: { flags: () => Promise.resolve({ ui: false, kill: true }) },
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar collapsed={false} onNavigate={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  memoryStore.clear();
  projects.splice(
    0,
    projects.length,
    project('casa', 'Casa'),
    project('rugby', 'Rugby', { is_project: true }),
  );
  folders.splice(0, folders.length, folder('vacia', 'Vacía', 0), folder('vass', 'VASS', 1));
  projects.push(project('dentro', 'Dentro', { folder_id: 'vass' }));
  archived.splice(
    0,
    archived.length,
    project('vieja', 'Vieja', { closed: true, is_project: true, state: 'archived' }),
  );
  api.getMe.mockResolvedValue({ id: 'me', display_name: 'Pablo', email: 'pablo@example.test' });
  api.listSmartLists.mockResolvedValue({ items: [], next_cursor: null });
  api.listFilters.mockResolvedValue({ items: [], next_cursor: null });
  api.listTags.mockResolvedValue({ items: [], next_cursor: null });
  api.listFolders.mockImplementation(() =>
    Promise.resolve({ items: [...folders], next_cursor: null }),
  );
  api.listProjects.mockImplementation((query?: { state?: string }) =>
    Promise.resolve({
      items: query?.state === 'archived' ? [...archived] : [...projects],
      next_cursor: null,
    }),
  );
  api.updateProject.mockImplementation((id: string, body: Partial<Project>) => {
    const current = [...projects, ...archived].find((item) => item.id === id);
    if (current !== undefined && body.is_project !== undefined) {
      current.is_project = body.is_project;
    }
    if (current !== undefined && body.folder_id !== undefined) {
      current.folder_id = body.folder_id;
    }
    return Promise.resolve(current ?? project(id, 'Casa'));
  });
  api.deleteFolder.mockResolvedValue(undefined);
  api.createFolder.mockImplementation((body: { name: string }) =>
    Promise.resolve(folder('restored', body.name, 1)),
  );
  api.getProjectDeletionImpact.mockResolvedValue({
    project_id: 'vieja',
    name: 'Vieja',
    is_project: true,
    closed: true,
    task_count: 4,
    completed_count: 1,
    open_count: 3,
    subtask_count: 0,
  });
  api.moveTask.mockResolvedValue({});
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
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener(): void {
      return undefined;
    },
    removeEventListener(): void {
      return undefined;
    },
    dispatchEvent(): boolean {
      return false;
    },
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sidebar lists and folders', () => {
  it('renders empty folders and the same menu inside a folder', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Vacía' })).toBeTruthy();
    fireEvent.click(await menuButton('Dentro'));
    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Mover a carpeta/ })).toBeTruthy();
  });

  it('hides Borrar on an open project and shows the task count for an archived one', async () => {
    mount();
    fireEvent.click(await menuButton('Rugby'));
    expect(await screen.findByRole('menuitem', { name: 'Quitar de proyectos' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Borrar' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    const archivedSummary = await screen.findByText('Archivadas');
    fireEvent.click(archivedSummary);
    fireEvent.click(await menuButton('Vieja'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Borrar' }));
    expect(await screen.findByText('Se eliminarán 4 tareas.')).toBeTruthy();
  });

  it('undoes a folder delete by recreating it and moving its lists back', async () => {
    mount();
    fireEvent.click(await folderMenu('VASS'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar carpeta' }));
    await waitFor(() => {
      expect(api.deleteFolder).toHaveBeenCalledWith('vass');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(() => {
      expect(api.createFolder).toHaveBeenCalledWith({ name: 'VASS' }, expect.any(String));
      expect(api.updateProject).toHaveBeenCalledWith('dentro', { folder_id: 'restored' });
    });
  });

  it('does not treat a task drag as a list drag, or the reverse', async () => {
    expect(dragHasList(transfer([TASK_MIME]))).toBe(false);
    expect(dragHasTask(transfer([LIST_MIME]))).toBe(false);
    mount();
    const folder = await screen.findByRole('button', { name: 'Vacía' });
    const row = folder.parentElement;
    if (!(row instanceof HTMLElement)) {
      throw new Error('missing folder row');
    }
    const task = drag('dragover', [TASK_MIME]);
    row.dispatchEvent(task);
    expect(task.defaultPrevented).toBe(false);
    const list = drag('dragover', [LIST_MIME]);
    row.dispatchEvent(list);
    expect(list.defaultPrevented).toBe(true);
    const casa = (await screen.findByRole('link', { name: 'Casa' })).closest('li');
    if (casa === null) {
      throw new Error('missing list row');
    }
    const ontoList = drag('dragover', [TASK_MIME], { [TASK_MIME]: 'task-1' });
    casa.dispatchEvent(ontoList);
    expect(ontoList.defaultPrevented).toBe(true);
    const listOntoTask = drag('drop', [LIST_MIME], { [LIST_MIME]: 'casa' });
    casa.dispatchEvent(listOntoTask);
    expect(api.moveTask).not.toHaveBeenCalled();
  });
});

async function menuButton(name: string): Promise<HTMLButtonElement> {
  const link = await screen.findByRole('link', { name });
  const button = link.closest('li')?.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing menu for ${name}`);
  }
  return button;
}

async function folderMenu(name: string): Promise<HTMLButtonElement> {
  const toggle = await screen.findByRole('button', { name });
  const button = toggle.parentElement?.querySelector('.nav-more-btn');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing folder menu for ${name}`);
  }
  return button;
}

function drag(type: string, types: string[], data: Record<string, string> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer(types, data) });
  return event;
}

function transfer(types: string[], data: Record<string, string> = {}): DataTransfer {
  return {
    types,
    getData: (mime: string) => data[mime] ?? '',
    setData(): void {
      return undefined;
    },
    effectAllowed: 'move',
    dropEffect: 'move',
  } as unknown as DataTransfer;
}

function project(id: string, name: string, extra: Partial<Project> = {}): Project {
  return {
    id,
    name,
    color: '#4772FA',
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
    active_task_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

function folder(id: string, name: string, count: number): Folder {
  return {
    id,
    name,
    sort_order: '1',
    project_count: count,
    active_task_count: count,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
