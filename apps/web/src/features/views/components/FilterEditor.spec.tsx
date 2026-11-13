// @vitest-environment jsdom
import { vi } from 'vitest';

vi.hoisted(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { FilterEditor } from './FilterEditor';

const previewFilter = vi.hoisted(() => vi.fn());
const listFilters = vi.hoisted(() => vi.fn());
const listProjects = vi.hoisted(() => vi.fn());
const listTags = vi.hoisted(() => vi.fn());
const listFolders = vi.hoisted(() => vi.fn());
const listMembers = vi.hoisted(() => vi.fn());
const getMe = vi.hoisted(() => vi.fn());
const createFilter = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({
  api: {
    previewFilter,
    listFilters,
    listProjects,
    listTags,
    listFolders,
    listMembers,
    getMe,
    createFilter,
    updateFilter: vi.fn(),
  },
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
  }));
  listFilters.mockResolvedValue({ items: [], next_cursor: null });
  listProjects.mockResolvedValue({ items: [], next_cursor: null });
  listTags.mockResolvedValue({ items: [], next_cursor: null });
  listFolders.mockResolvedValue({ items: [], next_cursor: null });
  previewFilter.mockResolvedValue({ count: 1, groups: [] });
  listMembers.mockReset().mockResolvedValue({ items: [] });
  getMe
    .mockReset()
    .mockResolvedValue({ id: 'me', display_name: 'Marta', email: 'me@example.test' });
  createFilter.mockReset().mockResolvedValue({ id: 'created' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  previewFilter.mockReset();
});

function renderEditor(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FilterEditor request={{ kind: 'create' }} onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function previewSwitch(): HTMLInputElement {
  const node = screen.getAllByRole('switch', { name: 'Vista previa' })[0];
  if (!(node instanceof HTMLInputElement)) {
    throw new Error('missing preview switch');
  }
  return node;
}

describe('FilterEditor', () => {
  it('keeps save disabled until there is a name and a condition', () => {
    renderEditor();
    const save = () =>
      screen.getAllByRole('button', { name: 'Guardar filtro' })[0] as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Casa · hoy' } });
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Valor de Palabra'), { target: { value: 'casa' } });
    expect(save().disabled).toBe(false);
  });

  it('does not preview while the switch is off', async () => {
    renderEditor();
    expect(previewSwitch().checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Valor de Palabra'), { target: { value: 'casa' } });
    await vi.advanceTimersByTimeAsync(300);
    expect(previewFilter).not.toHaveBeenCalled();
  });

  it('previews only after the debounce and can drop a condition', async () => {
    renderEditor();
    fireEvent.click(previewSwitch());
    fireEvent.change(screen.getByLabelText('Valor de Palabra'), { target: { value: 'casa' } });
    expect(previewFilter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(previewFilter).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar condición Palabra' }));
    expect(screen.queryByLabelText('Valor de Palabra')).toBeNull();
  });

  it('sends OR when Alguna is chosen', async () => {
    renderEditor();
    fireEvent.click(previewSwitch());
    fireEvent.change(screen.getByLabelText('Valor de Palabra'), { target: { value: 'casa' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Alguna' }));
    await vi.advanceTimersByTimeAsync(300);
    const body = previewFilter.mock.calls.at(-1)?.[0] as {
      rules: { groups: { combinator: string }[] };
    };
    expect(body.rules.groups[0]?.combinator).toBe('OR');
  });

  it('keeps the save hint neutral until the user tries to save', () => {
    renderEditor();
    const hint = screen.getByText('Añade un nombre');
    expect(hint.className).not.toContain('is-error');
    fireEvent.keyDown(screen.getByLabelText('Nombre'), { key: 'Enter' });
    expect(hint.className).toContain('is-error');
  });

  it('renders Cancel as a secondary action and uses no native select', () => {
    renderEditor();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancel.className).toContain('is-secondary');
    expect(cancel.closest('.actions')).toBeNull();
    expect(cancel.closest('.filter-editor-actions')).not.toBeNull();
    expect(document.querySelectorAll('.filter-editor select')).toHaveLength(0);
  });

  it('focuses the first condition when editing conditions', async () => {
    vi.useRealTimers();
    listFilters.mockResolvedValue({
      items: [
        {
          id: 'f1',
          name: 'Casa',
          color: null,
          mode: 'normal',
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'AND',
                conditions: [{ field: 'keyword', op: 'contains', value: 'casa' }],
              },
            ],
          },
        },
      ],
      next_cursor: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FilterEditor
            request={{ kind: 'edit', id: 'f1', focus: 'conditions' }}
            onClose={() => undefined}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('dialog', { name: 'Editar filtro' });
    expect(document.activeElement?.id.startsWith('filter-field-')).toBe(true);
  });

  it('asks before leaving advanced mode drops groups', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Modo avanzado: grupos Y/O' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir grupo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modo simple' }));
    expect(screen.getByRole('alertdialog', { name: 'Se quitarán 1 grupos' })).toBeTruthy();
  });
});

async function openAssignee(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Campo: Palabra' }));
  fireEvent.click(screen.getByRole('option', { name: 'Asignado' }));
  expect(listMembers).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Elegir persona…' }));
  await screen.findByRole('radio', { name: /Yo/ });
}

function member(userId: string, name: string, email: string, status = 'accepted') {
  return { id: `membership-${userId}`, user_id: userId, display_name: name, email, status };
}

describe('FilterEditor assignee picker (DR-0006)', () => {
  it('loads on open, puts me first, deduplicates shared members and saves a single user id', async () => {
    vi.useRealTimers();
    listProjects.mockResolvedValue({
      items: [
        { id: 'one', name: 'Uno', shared: true },
        { id: 'two', name: 'Dos', shared: true },
        { id: 'private', name: 'Privada', shared: false },
      ],
    });
    listMembers.mockImplementation(async (id: string) => ({
      items: [
        member('me', 'Marta', 'me@example.test'),
        member('ana', 'Ana', 'ana@example.test'),
        ...(id === 'two' ? [member('bea', 'Bea', 'bea@example.test')] : []),
        member('declined', 'Declined', 'no@example.test', 'declined'),
        { user_id: null, email: 'pending@example.test', status: 'pending' },
      ],
    }));
    renderEditor();
    await openAssignee();
    await screen.findByRole('radio', { name: /Bea/ });
    const radios = screen
      .getAllByRole('radio')
      .filter((radio) => radio.closest('.filter-person-picker'));
    expect(radios.map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Yome@example.test',
      'Anaana@example.test',
      'Beabea@example.test',
    ]);
    expect(screen.getAllByRole('radio', { name: /Ana/ })).toHaveLength(1);
    expect(listMembers.mock.calls.map(([id]) => id).sort()).toEqual(['one', 'two']);
    fireEvent.click(screen.getByRole('radio', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Valor de Asignado: Ana' }));
    expect(listMembers).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('radio', { name: /Bea/ }));
    expect(screen.queryByRole('button', { name: 'Quitar Ana' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Asignadas' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar filtro' })[0] as HTMLElement);
    await vi.waitFor(() => expect(createFilter).toHaveBeenCalled());
    expect(createFilter.mock.calls[0]?.[0].rules.groups[0].conditions).toEqual([
      { field: 'assignee', op: 'eq', value: 'bea' },
    ]);
  });

  it('offers only me and the empty note without shared lists', async () => {
    vi.useRealTimers();
    renderEditor();
    await openAssignee();
    await screen.findByText('Aún no compartes listas con nadie');
    expect(
      screen.getAllByRole('radio').filter((radio) => radio.closest('.filter-person-picker')),
    ).toHaveLength(1);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('keeps an unavailable saved person id and shows a warning', async () => {
    vi.useRealTimers();
    listFilters.mockResolvedValue({
      items: [
        {
          id: 'saved',
          name: 'Asignadas',
          mode: 'normal',
          color: null,
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'AND',
                conditions: [{ field: 'assignee', op: 'eq', value: 'former-member' }],
              },
            ],
          },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FilterEditor request={{ kind: 'edit', id: 'saved' }} onClose={() => undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Valor de Asignado: Persona seleccionada' }),
    );
    await screen.findByRole('button', { name: 'Quitar Persona no disponible' });
    expect(document.querySelector('.filter-person-warning')?.textContent).toBe(
      'Persona no disponible',
    );
    expect(
      (screen.getByRole('radio', { name: 'Persona no disponible' }) as HTMLInputElement).disabled,
    ).toBe(true);
    fireEvent.click(previewSwitch());
    await vi.waitFor(() => expect(previewFilter).toHaveBeenCalled());
    expect(previewFilter.mock.calls.at(-1)?.[0].rules.groups[0].conditions[0].value).toBe(
      'former-member',
    );
  });

  it('announces loading, reports errors and retries without losing the selection', async () => {
    vi.useRealTimers();
    listProjects.mockResolvedValue({ items: [{ id: 'shared', name: 'Compartida', shared: true }] });
    let rejectMembers: ((reason: Error) => void) | undefined;
    listMembers.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectMembers = reject;
        }),
    );
    renderEditor();
    await openAssignee();
    expect(screen.getByText('Cargando personas…')).toBeTruthy();
    await vi.waitFor(() => expect(rejectMembers).toBeDefined());
    rejectMembers?.(new Error('offline'));
    await screen.findByText('No se han podido cargar las personas.');
    listMembers.mockResolvedValue({ items: [member('ana', 'Ana', 'ana@example.test')] });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('radio', { name: /Ana/ });
    expect(screen.queryByText('Cargando personas…')).toBeNull();
    expect(screen.queryByText('No se han podido cargar las personas.')).toBeNull();
  });
});
