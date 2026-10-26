// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { GoogleIntegrationCards } from './DriveCard';
const mock = vi.hoisted(() => ({ disconnect: vi.fn(() => Promise.resolve({})) }));
vi.mock('../../api', () => ({
  api: {
    integrationStatus: () =>
      Promise.resolve({
        has_connection: true,
        authorized: true,
        enabled: true,
        account: 'synthetic@example.test',
        status: 'connected',
      }),
    disconnectGoogle: mock.disconnect,
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <GoogleIntegrationCards />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('TTD-AUD-127 RF-2004/2005: one Google card, cancel stays local and disconnect retains imported events', async () => {
  mount();
  await screen.findByText('synthetic@example.test');
  expect(screen.getAllByRole('heading', { name: /Google/ })).toHaveLength(1);
  expect(screen.getAllByRole('switch')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
  expect(screen.getByText(/Los adjuntos siguen en tu Drive/)).toBeTruthy();
  expect(screen.getByText(/Se revoca el acceso también/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(mock.disconnect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Desconectar' })[1] ?? screen.getByRole('alertdialog'),
  );
  await waitFor(() => {
    expect(mock.disconnect).toHaveBeenCalledWith({ removeImportedEvents: false });
  });
  expect(await screen.findByText(/Google desconectado/)).toBeTruthy();
});
