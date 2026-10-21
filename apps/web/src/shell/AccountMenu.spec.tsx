// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AccountMenu } from './AccountMenu';

const summary = vi.hoisted(() => {
  const achievement: { score?: number; enabled: boolean } = { score: 14, enabled: true };
  return {
    achievement,
    streak: 2,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
});
vi.mock('../features/statistics/ControlSummary', () => ({ useControlSummary: () => summary }));
vi.mock('../api', () => ({
  api: { getMe: () => Promise.resolve({ display_name: 'Pablo', email: 'pablo@example.test' }) },
}));
afterEach(() => {
  cleanup();
  summary.achievement = { score: 14, enabled: true };
  summary.isPending = false;
  summary.isError = false;
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
}
describe('TTD-AUD-77 / RF-1602: avatar progress', () => {
  it('shows progress inside an accessible menu and returns focus on Escape', async () => {
    mount();
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('14');
    expect(menu.textContent).toContain('2 días');
    expect(screen.getByRole('menuitem', { name: /Racha 2 días/ })).toBeTruthy();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).toContain('Cerrar sesión');
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement?.textContent).toContain('2 días');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menú de cuenta' }));
  });
  it('shows an empty value when no score exists', () => {
    summary.achievement = { enabled: true };
    mount();
    expect(screen.getByRole('menu').textContent).toContain('—');
  });
  it('offers retry after an error', () => {
    summary.isError = true;
    mount();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reintentar' }));
    expect(summary.refetch).toHaveBeenCalled();
  });
  it('exposes loading state and closes on Tab', () => {
    summary.isPending = true;
    mount();
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
