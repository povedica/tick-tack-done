// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssigneeField } from './AssigneeField';

const { assignTask, listMembers } = vi.hoisted(() => ({
  assignTask: vi.fn(() => Promise.resolve({})),
  listMembers: vi.fn(() =>
    Promise.resolve({
      items: [
        {
          user_id: 'ana',
          status: 'accepted',
          display_name: 'Ana Ruiz',
          email: 'ana@example.test',
        },
        {
          user_id: 'luis',
          status: 'accepted',
          display_name: 'Luis Pérez',
          email: 'luis@example.test',
        },
      ],
    }),
  ),
}));

vi.mock('../../api', () => ({
  api: {
    listMembers,
    assignTask,
  },
}));

afterEach(() => {
  cleanup();
  assignTask.mockClear();
});

function mount(assigneeId: string | null = null): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssigneeField taskId="task-1" projectId="list-1" assigneeId={assigneeId} canAssign />
    </QueryClientProvider>,
  );
}

it('shows only Asignar a and Nadie until it is opened', async () => {
  mount();
  const row = await screen.findByRole('menuitem', { name: /Asignar a/ });
  expect(row.textContent).toContain('Nadie');
  expect(screen.queryByRole('menu', { name: 'Sin asignar' })).toBeNull();
});

it('shows the assignee beside Asignar a', async () => {
  mount('ana');
  expect(await screen.findByText('Ana Ruiz')).toBeTruthy();
  const row = screen.getByRole('menuitem', { name: /Asignar a/ });
  expect(row.textContent).toContain('Ana Ruiz');
  expect(screen.queryByText('Nadie')).toBeNull();
});

it('opens the people menu and assigns the chosen one', async () => {
  mount();
  fireEvent.click(await screen.findByRole('menuitem', { name: /Asignar a/ }));
  expect(await screen.findByRole('menu', { name: 'Sin asignar' })).toBeTruthy();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Ana Ruiz' }));
  expect(assignTask).toHaveBeenCalledWith('task-1', 'ana');
});
