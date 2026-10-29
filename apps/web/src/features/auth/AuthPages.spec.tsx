// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  login: vi.fn(),
  registrationOpen: vi.fn(() => Promise.resolve(false)),
  requestPasswordReset: vi.fn(() => Promise.resolve()),
  verifyPasswordReset: vi.fn(() =>
    Promise.resolve({
      valid: true as const,
      totp_required: true,
      expires_at: '2026-01-01T00:00:00.000Z',
    }),
  ),
  confirmPasswordReset: vi.fn(() => Promise.resolve()),
}));

vi.mock('@reflexionia/sdk', () => ({
  createApiClient: () => api,
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details: unknown;
    constructor(status: number, code: string, message: string, details: unknown = null) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
}));

import { ApiError } from '@reflexionia/sdk';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './AuthPages';

beforeEach(() => {
  Object.defineProperty(navigator, 'language', { value: 'es-ES', configurable: true });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  api.login.mockReset();
  api.requestPasswordReset.mockClear();
  api.verifyPasswordReset.mockClear();
  api.confirmPasswordReset.mockClear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('RF-PR-01 login recovery link', () => {
  it('links to forgot-password with the typed email and repeats the link after two failures', async () => {
    api.login.mockRejectedValue(new Error('no'));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ada@example.test' } });
    const link = screen.getByRole('link', { name: '¿Has olvidado tu contraseña?' });
    expect(link.getAttribute('href')).toBe('/forgot-password');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: '¿Has olvidado tu contraseña?' })).toHaveLength(2);
    });
  });

  it('asks for the second factor and sends the code with the same password', async () => {
    api.login
      .mockRejectedValueOnce(new ApiError(401, 'totp_required', 'Second factor required'))
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'ada@example.test',
        display_name: 'Ada',
        csrf_token: 'csrf-1',
      });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(screen.getByText('Esta cuenta pide un segundo factor.')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Código de tu app'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(api.login).toHaveBeenLastCalledWith({
        email: 'ada@example.test',
        password: 'correct-horse',
        totp_code: '123456',
      });
    });
  });
});

describe('RF-PR-02 forgot password copy', () => {
  it('shows a neutral sent message and does not call the API while offline', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/forgot-password', state: { email: 'ada@example.test' } }]}
      >
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByDisplayValue('ada@example.test')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    await waitFor(() => {
      expect(screen.getByText(/Si existe una cuenta con ada@example.test/)).toBeTruthy();
    });
    cleanup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    api.requestPasswordReset.mockClear();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Sin conexión/)).toBeTruthy();
    expect(api.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('RF-PR-04 reset fragment', () => {
  it('reads the fragment, strips it before verify, and can switch to a recovery code', async () => {
    window.history.replaceState(null, '', '/reset-password#token=' + 'a'.repeat(43));
    const replace = vi.spyOn(window.history, 'replaceState');
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(api.verifyPasswordReset).toHaveBeenCalledWith({ token: 'a'.repeat(43) });
    });
    expect(replace).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(screen.getByLabelText('Código de tu app')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    expect(screen.getByLabelText('Código de recuperación')).toBeTruthy();
  });
});
