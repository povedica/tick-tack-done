// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useLocale } from '../../i18n/locale';
import { PolicyPage } from './PolicyPage';

afterEach(() => {
  cleanup();
  useLocale.setState({ choice: 'es' });
});

function mount(): string {
  render(
    <MemoryRouter>
      <PolicyPage />
    </MemoryRouter>,
  );
  return screen.getByRole('article').textContent ?? '';
}

describe('privacy policy (#209)', () => {
  it('names Sentry as processor in the EU, pseudonymous id only, 30 days (es)', () => {
    useLocale.setState({ choice: 'es' });
    const text = mount();
    expect(screen.getByRole('heading', { name: 'Diagnóstico de errores' })).toBeDefined();
    expect(text).toContain('Functional Software, Inc.');
    expect(text).toContain('encargado del tratamiento');
    expect(text).toContain('Unión Europea');
    expect(text).toContain('seudónimo');
    expect(text).toContain('Nunca se envían tu email');
    expect(text).toContain('30 días');
  });

  it('has the same section in English', () => {
    useLocale.setState({ choice: 'en' });
    const text = mount();
    expect(screen.getByRole('heading', { name: 'Error diagnostics' })).toBeDefined();
    expect(text).toContain('data processor');
    expect(text).toContain('European Union');
    expect(text).toContain('30 days');
  });
});
