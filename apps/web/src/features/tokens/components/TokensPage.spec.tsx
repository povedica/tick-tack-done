// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { useLocale } from '../../../i18n/locale';
import { grantFullAccess } from '../permission-matrix';

const createToken = vi.hoisted(() => vi.fn());

vi.mock('../api', () => ({
  tokensApi: {
    listTokens: vi.fn().mockResolvedValue({ items: [], next_cursor: null, total: 0 }),
    oauthRenewals: vi.fn().mockResolvedValue({ items: [] }),
    oauthGrants: vi.fn().mockResolvedValue({ items: [] }),
    oauthGrantActivity: vi.fn(),
    revokeOauthGrant: vi.fn(),
    tokenActivity: vi.fn(),
    revokeToken: vi.fn(),
    createToken: (body: unknown): Promise<{ id: string; token: string }> => {
      createToken(body);
      return Promise.resolve({ id: 'new-token', token: 'rfx_pat_test' });
    },
  },
}));

import { TokensPage } from './TokensPage';

const FULL = [
  'tasks:read',
  'tasks:write',
  'lists:read',
  'lists:write',
  'tags:read',
  'tags:write',
  'filters:read',
  'filters:write',
  'habits:read',
  'habits:write',
  'countdowns:read',
  'countdowns:write',
  'focus:read',
  'focus:write',
  'notes:read',
  'notes:write',
  'calendar:read',
  'calendar:write',
  'reminders:write',
  'webhooks:manage',
  'automations:manage',
  'profile:read',
  'profile:write',
  'stats:read',
  'backup:read',
] as const;

beforeEach(() => {
  useLocale.setState({ choice: 'es' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  createToken.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings/tokens']}>
        <TokensPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function openComposer() {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo token' }));
}

function summary(): string {
  return document.querySelector('.token-perm-summary')?.textContent ?? '';
}

describe('token permission table', () => {
  it('CA-01 CA-07: every area is visible, nothing is granted, and full access is not selected', () => {
    openComposer();
    expect(document.querySelector('.token-perm-table details')).toBeNull();
    expect(document.querySelectorAll('.token-resource details')).toHaveLength(0);
    for (const area of [
      'Tareas',
      'Listas',
      'Etiquetas',
      'Filtros',
      'Hábitos',
      'Cuenta atrás',
      'Foco',
      'Notas',
      'Calendario',
      'Recordatorios',
      'Webhooks',
      'Automatizaciones',
      'Perfil',
      'Estadísticas',
      'Copias',
      'Todas las secciones',
    ]) {
      expect(screen.getByRole('rowheader', { name: new RegExp(area) })).toBeTruthy();
    }
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(32);
    for (const control of switches) {
      expect(control.getAttribute('aria-checked')).toBe('false');
    }
    expect(
      screen.getByRole('columnheader', { name: 'Escribir (crear, editar y borrar)' }),
    ).toBeTruthy();
    expect(screen.getByText('0 de 15 áreas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Acceso total/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Ninguno' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: '90 días' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Nunca' })).toBeTruthy();
    expect(summary()).toContain('Este token aún no tiene permisos.');
  });

  it('CA-02 CA-04 CA-05: write turns read on, is keyboard operable, and the token gets exactly those scopes', async () => {
    openComposer();
    const user = userEvent.setup();
    const write = screen.getByRole('switch', { name: 'Tareas, Escribir' });
    write.focus();
    await user.keyboard(' ');
    expect(write.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Tareas, Leer' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      screen
        .getByRole('switch', { name: 'Todas las secciones, Leer' })
        .getAttribute('aria-checked'),
    ).toBe('mixed');
    expect(summary()).toContain('crear, editar y borrar tareas');
    fireEvent.click(screen.getByRole('switch', { name: 'Tareas, Leer' }));
    expect(
      screen.getByRole('switch', { name: 'Tareas, Escribir' }).getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: 'Etiquetas, Escribir' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Listas, Leer' }));
    fireEvent.change(screen.getByLabelText('Agente'), { target: { value: 'atajo' } });
    await user.click(screen.getByRole('button', { name: 'Crear token' }));
    expect(createToken).toHaveBeenCalledWith({
      name: 'atajo',
      scopes: ['lists:read', 'tags:read', 'tags:write'],
      expires_in_days: 90,
    });
  });

  it('CA-03: full access asks before changing anything, from the preset and from the write column', async () => {
    openComposer();
    fireEvent.click(screen.getByRole('button', { name: /Acceso total/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(
      'Este token podrá leer, cambiar y borrar todo en tu cuenta: tareas, listas, webhooks, automatizaciones, perfil y copias.',
    );
    expect(dialog.textContent).toContain(
      'Quien lo tenga podrá hacer lo mismo que tú. Úsalo solo en apps de confianza.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(
      screen.getByRole('switch', { name: 'Tareas, Escribir' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(createToken).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch', { name: 'Todas las secciones, Escribir' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Dar acceso total' }),
    );
    expect(
      screen.getByRole('switch', { name: 'Tareas, Escribir' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('switch', { name: 'Estadísticas, Leer' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByRole('switch', { name: 'Copias, Escribir' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('15 de 15 áreas')).toBeTruthy();
    expect(summary()).toContain('crear, editar y borrar todo en tu cuenta');
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText('Agente'), { target: { value: 'agente' } });
    await user.click(screen.getByRole('button', { name: 'Crear token' }));
    expect(createToken).toHaveBeenCalledWith({
      name: 'agente',
      scopes: [...FULL],
      expires_in_days: 90,
    });
    expect(grantFullAccess()).toEqual([...FULL]);
  });

  it('CA-07: presets apply exactly, stay editable, and full access uses the same confirmation', async () => {
    openComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Solo tareas' }));
    expect(screen.getByRole('switch', { name: 'Tareas, Leer' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      screen.getByRole('switch', { name: 'Tareas, Escribir' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByRole('switch', { name: 'Listas, Leer' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(summary()).toContain('crear, editar y borrar tareas');
    fireEvent.click(screen.getByRole('switch', { name: 'Listas, Leer' }));
    expect(screen.getByRole('button', { name: 'Solo tareas' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('switch', { name: 'Listas, Leer' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Solo leer todo' }));
    expect(
      screen.getByRole('switch', { name: 'Tareas, Escribir' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen.getByRole('switch', { name: 'Webhooks, Gestionar' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen.getByRole('switch', { name: 'Recordatorios, Escribir' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.getByRole('switch', { name: 'Copias, Leer' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByText('12 de 15 áreas')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Notas, Escribir' }));
    expect(screen.getByRole('switch', { name: 'Notas, Leer' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Solo leer todo' }).getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Ninguno' }));
    expect(screen.getByRole('switch', { name: 'Notas, Leer' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByText('0 de 15 áreas')).toBeTruthy();

    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText('Agente'), { target: { value: 'raycast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solo tareas' }));
    await user.click(screen.getByRole('button', { name: 'Crear token' }));
    expect(createToken).toHaveBeenCalledWith({
      name: 'raycast',
      scopes: ['tasks:read', 'tasks:write'],
      expires_in_days: 90,
    });
  });

  it('shows the write warning and the summary in English', () => {
    useLocale.setState({ choice: 'en' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    expect(
      screen.getByRole('columnheader', { name: 'Write (create, edit and delete)' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tasks only' }));
    expect(summary()).toContain('create, edit and delete tasks');
    fireEvent.click(screen.getByRole('button', { name: /Full access/ }));
    expect(screen.getByRole('alertdialog').textContent).toContain('Grant full access');
    expect(screen.getByRole('radio', { name: 'Never' })).toBeTruthy();
  });
});
