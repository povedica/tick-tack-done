import {
  arrangeTasks,
  pageTaskGroups,
  type FilterClock,
  type TaskGroupBy,
  type TaskSort,
} from '@reflexionia/domain';
import { encodeCursor } from '../http/cursor';
import { toViewJson, type ViewTask, type ViewTaskJson } from './view-tasks';

export interface ViewGroupJson {
  key: string;
  label: string;
  tasks: ViewTaskJson[];
}

export interface ViewPageJson {
  count: number;
  group_by: TaskGroupBy;
  sort: TaskSort;
  groups: ViewGroupJson[];
  next_cursor: string | null;
}

export function buildViewPage(
  tasks: readonly ViewTask[],
  options: { groupBy: TaskGroupBy; sort: TaskSort; clock: FilterClock },
  limit: number,
  cursor: { index: number; id: string } | null,
): ViewPageJson {
  const arranged = arrangeTasks(tasks, {
    groupBy: options.groupBy,
    sort: options.sort,
    timeZone: options.clock.timeZone,
  });
  const page = pageTaskGroups(arranged, limit, cursor);
  return {
    count: page.total,
    group_by: options.groupBy,
    sort: options.sort,
    groups: page.groups.map((group) => ({
      key: group.key,
      label: group.label,
      tasks: group.tasks.map((task) => toViewJson(task)),
    })),
    next_cursor: page.next === null ? null : encodeCursor(String(page.next.index), page.next.id),
  };
}
