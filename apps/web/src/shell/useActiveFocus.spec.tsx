// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  FOCUS_ACTIVE_REFETCH_MS,
  focusSessionsRefetchInterval,
  useActiveFocus,
} from './useActiveFocus';

const calls = vi.hoisted(() => ({ list: [] as unknown[], settings: 0 }));
vi.mock('../api', () => ({
  api: {
    listFocusSessions: (status?: string) => {
      calls.list.push(status);
      return Promise.resolve({ items: [] });
    },
    getFocusSettings: () => {
      calls.settings += 1;
      return Promise.resolve({});
    },
    getMe: () => Promise.resolve({}),
    finishFocus: () => Promise.resolve({}),
  },
}));

const live = {
  id: 's',
  type: 'focus',
  ended_at: null,
  paused_at: null,
  remaining_seconds: 60,
  planned_minutes: 25,
  started_at: '2026-11-12T10:00:00.000Z',
};

afterEach(() => {
  cleanup();
  calls.list.length = 0;
  calls.settings = 0;
});

it('R5: without a live session there is no poll', () => {
  expect(focusSessionsRefetchInterval(undefined)).toBe(false);
  expect(focusSessionsRefetchInterval({ items: [] })).toBe(false);
  expect(
    focusSessionsRefetchInterval({
      items: [{ ...live, ended_at: '2026-11-12T10:20:00.000Z', remaining_seconds: 0 }],
    }),
  ).toBe(false);
});

it('R5: an active or paused session is refreshed every 30s', () => {
  expect(focusSessionsRefetchInterval({ items: [live] })).toBe(FOCUS_ACTIVE_REFETCH_MS);
  expect(FOCUS_ACTIVE_REFETCH_MS).toBe(30_000);
  expect(
    focusSessionsRefetchInterval({
      items: [{ ...live, paused_at: '2026-11-12T10:05:00.000Z', remaining_seconds: 0 }],
    }),
  ).toBe(FOCUS_ACTIVE_REFETCH_MS);
});

it('R5: the shell asks only for the active session and does not poll while idle', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Probe() {
    useActiveFocus();
    return null;
  }
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(calls.list).toEqual(['active']);
  });
  expect(calls.settings).toBe(0);
  await new Promise((resolve) => {
    setTimeout(resolve, 1200);
  });
  expect(calls.list).toEqual(['active']);
});
