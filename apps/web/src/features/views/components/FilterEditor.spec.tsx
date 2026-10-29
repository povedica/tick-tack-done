// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { FilterEditor } from './FilterEditor';

const previewFilter = vi.hoisted(() => vi.fn());
const listFilters = vi.hoisted(() => vi.fn());
const listProjects = vi.hoisted(() => vi.fn());
const listTags = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({
  api: {
    previewFilter,
    listFilters,
    listProjects,
    listTags,
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

  it('previews only after the debounce and can drop a condition', async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Valor de Palabra'), { target: { value: 'casa' } });
    expect(previewFilter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(previewFilter).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar condición Palabra' }));
    expect(screen.queryByLabelText('Valor de Palabra')).toBeNull();
  });

  it('asks before leaving advanced mode drops groups', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Modo avanzado: grupos Y/O' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir grupo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modo simple' }));
    expect(screen.getByRole('alertdialog', { name: 'Se quitarán 1 grupos' })).toBeTruthy();
  });
});
