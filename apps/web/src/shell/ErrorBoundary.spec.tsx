// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installActionErrorFallback } from '../components/run-action';
import { installErrorReporting } from '../observability/report';
import { ScreenBoundary } from './ErrorBoundary';

const client = vi.hoisted(() => ({
  capture: vi.fn((_error: unknown, _source: string) => 'abcdef0123456789abcdef0123456789'),
}));
vi.mock('../observability/sentry-client', () => ({
  createReporter: () => ({ capture: client.capture }),
}));
vi.stubEnv('VITE_SENTRY_DSN', 'https://webkey@o0.ingest.de.sentry.io/2');

let broken = true;
function Screen(): ReactNode {
  if (broken) throw new Error('render bug');
  return <p>Pantalla sana</p>;
}

afterEach(() => {
  cleanup();
  broken = true;
  client.capture.mockClear();
});

describe('ScreenBoundary (#209)', () => {
  it('CA-10: a render error produces exactly one event and shows a copyable code', async () => {
    const uninstallWindow = installErrorReporting();
    const uninstallRejections = installActionErrorFallback();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.documentElement.lang = 'es';
    render(
      <ScreenBoundary resetKey="/today">
        <Screen />
      </ScreenBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Tus tareas guardadas no se han perdido.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Volver a Hoy' })).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('abcdef01')).toBeDefined();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.capture).toHaveBeenCalledTimes(1);
    expect(client.capture.mock.calls[0]?.[1]).toBe('react');

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copiado' })).toBeDefined();
    });
    expect(writeText).toHaveBeenCalledWith('abcdef01');
    uninstallWindow();
    uninstallRejections();
  });

  it('Reintentar renders the screen again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ScreenBoundary resetKey="/today">
        <Screen />
      </ScreenBoundary>,
    );
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Pantalla sana')).toBeDefined();
  });

  it('a new resetKey still clears the failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(
      <ScreenBoundary resetKey="/today">
        <Screen />
      </ScreenBoundary>,
    );
    broken = false;
    view.rerender(
      <ScreenBoundary resetKey="/inbox">
        <Screen />
      </ScreenBoundary>,
    );
    expect(screen.getByText('Pantalla sana')).toBeDefined();
  });
});
