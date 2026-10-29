// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddPopover } from './QuickAddPopover';
import { allDaySlot } from '../calendar-slot';
import { useCaptureOpen } from '../notice';

vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => {
        data.clear();
      },
    },
    configurable: true,
  });
});
vi.mock('../../../api', () => ({
  apiOptions: () => ({}),
  sessionMode: false,
  api: {
    getMe: () => Promise.resolve({ id: 'user', time_zone: 'Europe/Madrid' }),
    listProjects: () => Promise.resolve({ items: [], next_cursor: null }),
    listTags: () => Promise.resolve({ items: [], next_cursor: null }),
    createTask: () => Promise.resolve({ id: 'created', title: 'Comprar pan' }),
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 300, 300),
  ] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useCaptureOpen.getState().hide();
});

function open() {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  anchor.focus();
  const close = vi.fn();
  const created = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(QuickAddPopover, {
        slot: allDaySlot('2026-10-24', 'Europe/Madrid'),
        anchor: { x: 20, y: 20, element: anchor },
        onClose: close,
        onCreated: created,
      }),
    ),
  );
  return { anchor, close, created, view };
}
describe('TTD-AUD-74 QuickAddPopover component', () => {
  it('renders the date, focuses title, closes on Escape and restores focus', async () => {
    const { anchor, close, view } = open();
    const dialog = screen.getByRole('dialog', { name: '¿Qué quieres hacer?' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    const title = await screen.findByRole('textbox', { name: 'Añadir tarea' });
    await waitFor(() => {
      expect(title).toBe(document.activeElement);
    });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.activeElement).toBe(anchor);
    anchor.remove();
  });
  it('Enter creates using the slot and More options transfers the full draft', async () => {
    const user = userEvent.setup();
    const { created, view, anchor } = open();
    await user.type(await screen.findByRole('textbox', { name: 'Añadir tarea' }), 'Comprar pan{Enter}');
    await waitFor(() => {
      expect(created).toHaveBeenCalledOnce();
    });
    view.unmount();
    anchor.remove();
    const next = open();
    await user.type(await screen.findByRole('textbox', { name: 'Añadir tarea' }), 'Conservar');
    await user.click(screen.getByRole('button', { name: 'Más' }));
    await user.click(screen.getByRole('button', { name: 'Más opciones' }));
    expect(useCaptureOpen.getState().draft).toMatchObject({
      text: 'Conservar',
      slot: { start: '2026-10-23T22:00:00.000Z', allDay: true },
    });
    expect(next.close).toHaveBeenCalledOnce();
    next.view.unmount();
    next.anchor.remove();
  });
});
