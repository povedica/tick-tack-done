// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useLocale } from '../../../i18n/locale';
import { PlanDesktopControls } from './PlanDesktopControls';

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

function mount(busy = false) {
  const onAction = vi.fn();
  const anchor = createRef<HTMLButtonElement>();
  render(
    <PlanDesktopControls
      duration={15}
      time=""
      slots={['09:00']}
      busy={busy}
      anchor={anchor}
      onDuration={vi.fn()}
      onTime={vi.fn()}
      onAction={onAction}
    />,
  );
  return { onAction, anchor };
}

it('plans someday from the card and keeps only delete in the overflow menu', () => {
  const { onAction, anchor } = mount();
  expect(screen.getByText('Duración')).toBeTruthy();
  expect(screen.queryByText('Duración:')).toBeNull();
  expect(screen.getByText('Hora')).toBeTruthy();
  expect(screen.queryByText('Hora:')).toBeNull();
  expect(document.querySelector('.plan-time-controls .lucide-clock')).toBeTruthy();
  expect(document.querySelector('.sp-time .lucide-clock')).toBeNull();
  const days = screen.getByRole('group', { name: '¿Cuándo?' });
  expect(days.className).toContain('plan-day-segment');
  expect(days.getAttribute('role')).toBe('group');
  expect(anchor.current?.textContent).toContain('Otro día');

  fireEvent.click(screen.getByRole('button', { name: 'Algún día' }));
  expect(onAction).toHaveBeenCalledWith('someday');

  fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
  const menu = screen.getByRole('dialog', { name: 'Acciones' });
  expect(within(menu).getByRole('button', { name: 'Eliminar' })).toBeTruthy();
  expect(within(menu).queryByRole('button', { name: 'Algún día' })).toBeNull();
  expect(menu.querySelectorAll('.ui-kbd')).toHaveLength(0);
});

it('disables the new actions while a decision is in flight', () => {
  const { onAction } = mount(true);
  const someday = screen.getByRole<HTMLButtonElement>('button', { name: 'Algún día' });
  expect(someday.disabled).toBe(true);
  fireEvent.click(someday);
  expect(onAction).not.toHaveBeenCalled();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /Hoy/ }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Acciones' }).disabled).toBe(true);
});
