// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicListPage } from './PublicListPage';

const list = {
  name: 'Semilla',
  tasks: [
    {
      ref: 't1',
      title: 'Comprar pan',
      notes: 'Texto con <script>alert(1)</script>',
      status: 'active',
      priority: 'none',
      start_date: null,
      due_date: null,
      all_day: true,
      tags: [],
      checklist: [],
      subtasks: [],
    },
    {
      ref: 't2',
      title: 'Hecho',
      notes: null,
      status: 'completed',
      priority: 'none',
      start_date: null,
      due_date: null,
      all_day: true,
      tags: [],
      checklist: [],
      subtasks: [],
    },
  ],
};

function mount() {
  render(
    <MemoryRouter initialEntries={['/s/seed-token']}>
      <Routes>
        <Route path="/s/:token" element={<PublicListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('meta[name="robots"]').forEach((node) => {
    node.remove();
  });
});

describe('COMP-29 public list page', () => {
  it('loads the list, keeps completed tasks folded and does not run a script in the notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(list),
      }),
    );
    mount();
    expect(await screen.findByRole('heading', { name: 'Semilla' })).toBeTruthy();
    expect(screen.getByText('Comprar pan')).toBeTruthy();
    expect(screen.queryByText('Hecho')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Completadas/ }));
    expect(screen.getByText('Hecho')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.innerHTML).not.toContain('<script');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain(
      'noindex',
    );
    expect(screen.getByRole('note').textContent).toContain('Lista compartida en solo lectura');
  });

  it('shows the missing and rate-limit states', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(await screen.findByText('Este enlace no existe o ya no está disponible.')).toBeTruthy();
    cleanup();
    mount();
    await waitFor(() => {
      expect(screen.getByText('Demasiadas visitas, prueba en un minuto.')).toBeTruthy();
    });
  });
});
