// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api', () => ({
  api: {
    getPublicLink: vi.fn().mockResolvedValue({ active: false }),
    createPublicLink: vi.fn(),
    regeneratePublicLink: vi.fn(),
    updatePublicLink: vi.fn(),
    revokePublicLink: vi.fn(),
  },
}));

import { PublicLinkSettings } from './PublicLinkSettings';

beforeEach(() => {
  Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true });
});

afterEach(() => {
  cleanup();
});

function mount(active: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['public-link', 'list-1'], { active });
  render(
    <QueryClientProvider client={client}>
      <PublicLinkSettings projectId="list-1" />
    </QueryClientProvider>,
  );
}

describe('COMP-29 public link section', () => {
  it('shows the section and a concrete date field', () => {
    mount(false);
    expect(screen.getByRole('heading', { name: 'Enlace público' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'date' } });
    expect(screen.getByLabelText('Fecha concreta')).toBeTruthy();
    expect(document.querySelector('input[type="date"]')).toBeTruthy();
  });

  it('asks before publishing', () => {
    mount(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Enlace público' }));
    expect(screen.getByText(/Cualquiera con el enlace/)).toBeTruthy();
  });
});
