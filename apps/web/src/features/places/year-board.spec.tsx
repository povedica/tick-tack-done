// @vitest-environment jsdom
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { YearBoard } from './year-board';

vi.mock('../../api', () => ({
  api: {
    getMe: () => Promise.resolve({ time_zone: 'Europe/Madrid', locale: 'es' }),
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('visibilitychange without a day change does not re-render YearBoard', async () => {
  let renders = 0;
  const onRender: ProfilerOnRenderCallback = () => {
    renders += 1;
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Profiler id="year" onRender={onRender}>
          <YearBoard
            year={2026}
            tasks={[]}
            weekStart="monday"
            colors={new Map()}
            onOpen={() => undefined}
          />
        </Profiler>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(document.querySelectorAll('.year-card')).toHaveLength(12);
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
  });
  const settled = renders;
  expect(settled).toBeGreaterThan(0);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  });
  expect(renders).toBe(settled);
});

it('paints the focus month first and the rest of the year when the browser is idle', () => {
  let idle: (() => void) | undefined;
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    idle = callback;
    return 1;
  });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <YearBoard
          year={2026}
          focusMonth={10}
          tasks={[]}
          weekStart="monday"
          colors={new Map()}
          onOpen={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const labels = () =>
    [...document.querySelectorAll('.year-month')].map((node) => node.textContent);
  expect(labels()).toEqual(['octubre', 'noviembre', 'diciembre']);
  act(() => {
    idle?.();
  });
  expect(document.querySelectorAll('.year-card')).toHaveLength(12);
});
