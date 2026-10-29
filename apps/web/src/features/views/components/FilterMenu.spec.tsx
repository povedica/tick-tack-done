// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterMenu } from './FilterMenu';

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

function renderMenu(pinned: boolean) {
  const anchor = createRef<HTMLButtonElement>();
  const onPin = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <>
      <button ref={anchor} type="button">
        …
      </button>
      <FilterMenu
        name="Casa"
        color={null}
        pinned={pinned}
        summary="Hoy"
        countLabel="1 tarea"
        anchor={anchor}
        onClose={onClose}
        onEdit={vi.fn()}
        onPin={onPin}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />
    </>,
  );
  return { ...view, onPin, onClose, anchor };
}

describe('FilterMenu', () => {
  it('offers pin when the filter is loose and unpin when it is pinned', () => {
    const loose = renderMenu(false);
    expect(screen.getByRole('menuitem', { name: 'Fijar arriba' })).toBeTruthy();
    loose.unmount();
    renderMenu(true);
    expect(screen.getByRole('menuitem', { name: 'Desfijar' })).toBeTruthy();
  });

  it('moves with the arrow keys and returns focus on Escape', () => {
    const { onClose, anchor } = renderMenu(false);
    const edit = screen.getByRole('menuitem', { name: 'Editar nombre y color' });
    edit.focus();
    fireEvent.keyDown(edit, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Fijar arriba' }));
    fireEvent.keyDown(document.activeElement ?? edit, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(anchor.current);
  });
});
