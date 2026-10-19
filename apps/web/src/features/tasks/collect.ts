import type { Project, Tag, Task, ViewPage } from '@reflexionia/sdk';
import { api } from '../../api';

const PAGE = 100;
const MAX_PAGES = 20;

export async function collectTags(): Promise<{ items: Tag[] }> {
  const items: Tag[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await api.listTags({ limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
    items.push(...result.items);
    if (result.next_cursor === null) {
      return { items };
    }
    cursor = result.next_cursor;
  }
  return { items };
}

export async function collectProjects(): Promise<{ items: Project[] }> {
  const items: Project[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await api.listProjects({
      limit: PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...result.items);
    if (result.next_cursor === null) {
      return { items };
    }
    cursor = result.next_cursor;
  }
  return { items };
}

export async function collectTasksByTag(tagId: string): Promise<Task[]> {
  const items: Task[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await api.listTasks({
      tag: tagId,
      limit: PAGE,
      status: 'active',
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...result.items);
    if (result.next_cursor === null) {
      return items;
    }
    cursor = result.next_cursor;
  }
  return items;
}

export async function collectSmartList(
  key: string,
  options: { groupBy?: ViewPage['group_by']; sort?: ViewPage['sort'] },
): Promise<ViewPage> {
  return collectView((cursor) =>
    api.smartListTasks(key, {
      ...options,
      limit: PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
}

export async function collectFilterTasks(
  id: string,
  options: { groupBy?: ViewPage['group_by']; sort?: ViewPage['sort'] },
): Promise<ViewPage> {
  return collectView((cursor) =>
    api.filterTasks(id, {
      ...options,
      limit: PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
}

async function collectView(load: (cursor?: string) => Promise<ViewPage>): Promise<ViewPage> {
  let cursor: string | undefined;
  let count = 0;
  let groupBy: ViewPage['group_by'] = 'none';
  let sort: ViewPage['sort'] = 'manual';
  const groups: {
    key: string;
    label: string;
    tasks: ViewPage['groups'][number]['tasks'][number][];
  }[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await load(cursor);
    count = result.count;
    groupBy = result.group_by;
    sort = result.sort;
    for (const group of result.groups) {
      const existing = groups.find((item) => item.key === group.key);
      if (existing === undefined) {
        groups.push({ key: group.key, label: group.label, tasks: [...group.tasks] });
      } else {
        existing.tasks.push(...group.tasks);
      }
    }
    if (result.next_cursor === null) {
      break;
    }
    cursor = result.next_cursor;
  }
  return { count, group_by: groupBy, sort, groups, next_cursor: null };
}
