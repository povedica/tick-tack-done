// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extraEs } from '../i18n/extra';
import { es } from '../i18n/es';
import { FilterMenuButtons } from '../features/views/filter-menu-items';
import { ViewMenu } from './ViewMenu';

const messages = { ...es, ...extraEs };

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

function openMenu(onSelect: (id: string) => void): void {
  render(
    <ViewMenu
      messages={messages}
      details={false}
      onDetails={vi.fn()}
      hideCompleted={false}
      onHideCompleted={vi.fn()}
      onPrint={vi.fn()}
      extraItems={<FilterMenuButtons messages={messages} pinned={false} onSelect={onSelect} />}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
}

describe('ViewMenu', () => {
  it('closes after a filter action and still runs it', () => {
    const onSelect = vi.fn();
    openMenu(onSelect);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar condiciones' }));
    expect(onSelect).toHaveBeenCalledWith('conditions');
    expect(screen.queryByRole('menuitem', { name: 'Editar condiciones' })).toBeNull();
  });

  it('keeps the menu open when a checkbox is toggled', () => {
    openMenu(vi.fn());
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Ocultar completadas' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Ocultar completadas' })).toBeTruthy();
  });
});
