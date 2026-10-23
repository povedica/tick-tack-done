// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelegramBotSettings } from './TelegramBotSettings';

const configure = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('../../api', () => ({ api: { configureTelegram: configure } }));
afterEach(() => {
  cleanup();
  configure.mockClear();
});
function mount(status: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TelegramBotSettings status={status} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { client, onSaved };
}
describe('RF-2003: Telegram bot settings form', () => {
  it('submits a masked token and clears it without retaining mutation variables', async () => {
    const { client, onSaved } = mount();
    const input = screen.getByLabelText<HTMLInputElement>('Token de BotFather');
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'generated-test-input' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar bot' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(configure).toHaveBeenCalledWith('generated-test-input');
    expect(input.value).toBe('');
    expect(client.getMutationCache().getAll()[0]?.state.variables).toBeUndefined();
  });
  it('shows local-only reception state and the identified bot', () => {
    mount({ source: 'settings', username: 'my_test_bot', webhook_state: 'local_only' });
    expect(screen.getByRole('status').textContent).toContain('Sin recepción de mensajes');
    expect(screen.getByRole('link', { name: '@my_test_bot' }).getAttribute('href')).toBe(
      'https://t.me/my_test_bot',
    );
  });
});
