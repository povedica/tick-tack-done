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

vi.mock('../../../api', () => ({
  api: {
    previewFilter,
    listFilters,
    listProjects,
    listTags,
    listFolders,
    createFilter: vi.fn(),
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
