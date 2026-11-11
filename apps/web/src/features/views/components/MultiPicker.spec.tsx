// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiPicker, type PickerChoice } from './MultiPicker';

const choices: PickerChoice[] = [
  { id: 'inbox', label: 'Bandeja', section: '', sectionOrder: -1, rank: 0 },
  { id: 'personal', label: 'Personal', section: 'Proyectos', sectionOrder: 0, rank: 1 },
  { id: 'casa', label: 'Casa', section: 'Sin carpeta', sectionOrder: 2, rank: 2 },
];

beforeEach(() => {
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness() {
  const [selected, setSelected] = useState<readonly string[]>([]);
  return (
    <MultiPicker
      label="Valor de Lista"
      placeholder="Añadir lista…"
      searchLabel="Buscar"
      doneLabel="Listo"
      clearLabel="Limpiar"
      selectedLabel="{count} seleccionadas"
      selectedOneLabel="1 seleccionada"
      removeLabel="Quitar {name}"
      choices={choices}
      selected={selected}
      onChange={setSelected}
    />
  );
}

describe('MultiPicker', () => {
  it('groups lists, keeps unfoldered last and filters by search', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir lista…' }));
    const headings = screen.getAllByRole('heading').map((node) => node.textContent);
    expect(headings).toEqual(['Proyectos', 'Sin carpeta']);
    expect(screen.getByText('Bandeja').compareDocumentPosition(screen.getByText('Proyectos'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'cas' } });
    expect(screen.queryByText('Personal')).toBeNull();
    expect(screen.getByText('Casa')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Casa' }));
    expect(screen.getByRole('button', { name: 'Quitar Casa' })).toBeTruthy();
  });
});
