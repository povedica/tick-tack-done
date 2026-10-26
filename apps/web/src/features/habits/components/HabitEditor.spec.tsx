// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HabitEditor } from './HabitEditor';

// Browser tests exercise the real portal, focus trap and nested date picker.
vi.mock('../../../components/Popover', () => ({
  Popover: ({ children, label }: { children: ReactNode; label: string }) => (
    <div role="dialog" aria-label={label}>
      {children}
    </div>
  ),
}));
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });
});
afterEach(cleanup);
it('RF-1301: disclosure preserves the basic fields, selected days and advanced values on save', () => {
  const save = vi.fn();
  const { container } = render(<HabitEditor busy={false} onSave={save} onCancel={vi.fn()} />);
  const name = screen.getByRole('textbox', { name: 'Nombre' });
  expect(name.getAttribute('name')).toBe('habit-title');
  expect(name.getAttribute('autocomplete')).toBe('off');
  expect(name.hasAttribute('data-1p-ignore')).toBe(true);
  expect(name.getAttribute('data-lpignore')).toBe('true');
  expect(name.getAttribute('data-form-type')).toBe('other');
  fireEvent.change(name, { target: { value: 'Leer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Días concretos' }));
  const monday = screen.getByRole('button', { name: 'lunes' });
  expect(monday.querySelector('.lucide-check')).not.toBeNull();
  fireEvent.click(monday);
  expect(monday.getAttribute('aria-pressed')).toBe('false');
  expect(monday.querySelector('.lucide-check')).toBeNull();
  const more = screen.getByRole('button', { name: 'Más' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(more);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('textbox', { name: 'Nombre' })).toBe(name);
  expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '21 días' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nota de motivación' }), {
    target: { value: 'Un rato cada día' },
  });
  fireEvent.click(more);
  expect(container.querySelector('#habit-advanced-fields')?.hasAttribute('hidden')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Leer',
      challenge_days: 21,
      motivation_note: 'Un rato cada día',
      frequency: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    }),
  );
});
