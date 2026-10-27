// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useLocale } from '../../../i18n/locale';
import { MoreMenu } from './MoreMenu';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });
});

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('768'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});
afterEach(() => {
  cleanup();
  useLocale.setState({ choice: 'es' });
});

function open(actions?: readonly ('someday' | 'delete')[]) {
  const onAction = vi.fn();
  render(<MoreMenu onAction={onAction} busy={false} {...(actions ? { actions } : {})} />);
  fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
  return { onAction, dialog: screen.getByRole('dialog', { name: 'Acciones' }) };
}

it('keeps Algún día and Eliminar when actions is omitted', () => {
  const { onAction, dialog } = open();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Algún día' }));
  expect(onAction).toHaveBeenCalledWith('someday');
  expect(onAction).toHaveBeenCalledOnce();
});

it('limits the menu to the actions prop', () => {
  const { onAction, dialog } = open(['delete']);
  expect(within(dialog).queryByRole('button', { name: 'Algún día' })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
  expect(onAction).toHaveBeenCalledWith('delete');
});

it('disables the trigger while a decision is in flight', () => {
  const onAction = vi.fn();
  render(<MoreMenu onAction={onAction} busy actions={['delete']} />);
  const trigger = screen.getByRole('button', { name: 'Acciones' });
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(trigger);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onAction).not.toHaveBeenCalled();
});
