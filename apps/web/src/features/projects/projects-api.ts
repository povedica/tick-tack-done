import {
  isOverdue,
  orderBoardItems,
  projectAttention,
  type ProjectBoardState,
} from '@reflexionia/domain';
import type { ProjectOverview, ProjectOverviewItem } from '@reflexionia/sdk';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { runAction } from '../../components/run-action';

export const PROJECTS_KEY = ['projects-overview'] as const;
export const ARCHIVED_PREVIEW = 10;
export const ARCHIVED_OPEN_KEY = 'ttd.projects.archivedOpen';

export function readArchivedOpen(): boolean {
  try {
    return localStorage.getItem(ARCHIVED_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeArchivedOpen(open: boolean): void {
  try {
    localStorage.setItem(ARCHIVED_OPEN_KEY, open ? 'true' : 'false');
  } catch {
    /* Storage can be blocked; the column still opens for this visit. */
  }
}

export function useProjectsOverview() {
  return useQuery({ queryKey: PROJECTS_KEY, queryFn: () => api.projectOverview() });
}

export async function refreshProjectSurfaces(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: PROJECTS_KEY }),
    client.invalidateQueries({ queryKey: ['projects'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
    client.invalidateQueries({ queryKey: ['review-weekly'] }),
  ]);
}

function actionSort(item: ProjectOverviewItem, now: string, timeZone: string) {
  if (item.next_action === null) {
    return null;
  }
  const actionAt = item.next_action.start_date ?? item.next_action.due_date;
  const overdue = isOverdue({
    status: 'active',
    dueDate: item.next_action.due_date,
    startDate: item.next_action.start_date,
    isAllDay: item.next_action.is_all_day,
    timeZone,
    now,
  });
  return { overdue, actionAt };
}

export function withProjectState(
  data: ProjectOverview,
  id: string,
  state: ProjectBoardState,
  now: string,
  timeZone: string,
): ProjectOverview {
  const items = data.items.map((item) => {
    if (item.id !== id) {
      return item;
    }
    return {
      ...item,
      state,
      closed_at: state === 'archived' ? now : null,
      project_status_changed_at: now,
      attention: projectAttention(
        { state, nextAction: item.next_action, lastActivityAt: item.last_activity_at },
        now,
        timeZone,
      ),
    };
  });
  return orderOverview({ ...data, items }, now, timeZone);
}

export function withoutProject(data: ProjectOverview, id: string, now: string, timeZone: string) {
  return orderOverview(
    { ...data, items: data.items.filter((item) => item.id !== id) },
    now,
    timeZone,
  );
}

function orderOverview(data: ProjectOverview, now: string, timeZone: string): ProjectOverview {
  const counts = { active: 0, paused: 0, archived: 0 };
  for (const item of data.items) {
    counts[item.state] += 1;
  }
  const items = orderBoardItems(
    data.items.map((item) => ({
      ...item,
      closedAt: item.closed_at,
      nextAction: actionSort(item, now, timeZone),
    })),
  ).map(({ closedAt: _closedAt, nextAction: _nextAction, ...item }) => item);
  return { items, counts, next_cursor: data.next_cursor };
}

export interface ProjectNotice {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly previous: ProjectOverview;
  readonly revert: () => Promise<unknown>;
}

export function useProjectMutations(timeZone: string) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<ProjectNotice | null>(null);
  const now = () => new Date().toISOString();

  function commit(
    projectId: string,
    title: string,
    next: ProjectOverview | undefined,
    request: () => Promise<unknown>,
    revert: () => Promise<unknown>,
  ) {
    const previous = client.getQueryData<ProjectOverview>(PROJECTS_KEY);
    if (previous === undefined || next === undefined) {
      return;
    }
    client.setQueryData(PROJECTS_KEY, next);
    const item: ProjectNotice = { id: crypto.randomUUID(), title, projectId, previous, revert };
    setNotice(item);
    runAction(
      request().then(() => refreshProjectSurfaces(client)),
      {
        rollback: () => {
          client.setQueryData(PROJECTS_KEY, previous);
          setNotice((current) => (current?.id === item.id ? null : current));
        },
      },
    );
  }

  return {
    notice,
    dismiss() {
      setNotice(null);
    },
    undo() {
      if (notice === null) {
        return;
      }
      const current = notice;
      setNotice(null);
      client.setQueryData(PROJECTS_KEY, current.previous);
      runAction(
        current.revert().then(() => refreshProjectSurfaces(client)),
        {
          rollback: () => refreshProjectSurfaces(client),
        },
      );
    },
    move(item: ProjectOverviewItem, state: ProjectBoardState, title: string) {
      if (item.state === state) {
        return;
      }
      const previous = client.getQueryData<ProjectOverview>(PROJECTS_KEY);
      if (previous === undefined) {
        return;
      }
      const prior = item.state;
      commit(
        item.id,
        title,
        withProjectState(previous, item.id, state, now(), timeZone),
        () => api.setProjectState(item.id, state),
        () => api.setProjectState(item.id, prior),
      );
    },
    remove(item: ProjectOverviewItem, title: string) {
      const previous = client.getQueryData<ProjectOverview>(PROJECTS_KEY);
      if (previous === undefined) {
        return;
      }
      commit(
        item.id,
        title,
        withoutProject(previous, item.id, now(), timeZone),
        () => api.updateProject(item.id, { is_project: false }),
        () => api.updateProject(item.id, { is_project: true }),
      );
    },
  };
}
