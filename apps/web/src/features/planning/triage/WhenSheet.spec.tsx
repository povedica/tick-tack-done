// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLocale } from '../../../i18n/locale';
import { WhenSheet } from './WhenSheet';

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
  const onSomeday = vi.fn();
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <WhenSheet
      date="2026-10-27"
      time=""
      duration={30}
      slots={['09:00']}
      busy={busy}
      onDate={vi.fn()}
      onTime={vi.fn()}
      onDuration={vi.fn()}
      onClose={onClose}
      onConfirm={onConfirm}
      onSomeday={onSomeday}
      days={<span>días</span>}
    />,
  );
  return { onSomeday, onClose, onConfirm };
}

it('places Algún día in the When heading and reuses the someday action', () => {
  const { onSomeday, onClose, onConfirm } = mount();
  const someday = screen.getByRole('button', { name: 'Algún día' });
  const close = screen.getByRole('button', { name: 'Cerrar' });
  expect(someday.closest('.popover-heading')).toBe(close.closest('.popover-heading'));
  expect(someday.closest('.popover-heading-end')).toBeTruthy();
  expect(someday.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(someday.querySelector('.lucide-cloud-sun')).toBeTruthy();
  expect(someday.className).not.toMatch(/ui-button|is-primary/);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(someday);
  expect(onSomeday).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('uses the English someday label', () => {
  useLocale.setState({ choice: 'en' });
  mount();
  const someday = screen.getByRole('button', { name: 'Someday' });
  expect((someday as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole('heading', { name: 'When?' }).textContent).toBe('When?');
});

it('disables Algún día while the decision is in flight', () => {
  const { onSomeday } = mount(true);
  const someday = screen.getByRole('button', { name: 'Algún día' });
  expect((someday as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(someday);
  expect(onSomeday).not.toHaveBeenCalled();
});
