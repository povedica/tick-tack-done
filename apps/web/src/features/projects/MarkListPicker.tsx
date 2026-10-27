import type { Project } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type RefObject } from 'react';
import { api } from '../../api';
import { Popover } from '../../components/Popover';
import { runAction } from '../../components/run-action';
import { refreshProjectSurfaces } from './projects-api';
import type { ProjectsCopy } from './projects-text';

async function openLists(): Promise<Project[]> {
  const items: Project[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listProjects({
      isProject: false,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor !== undefined);
  return items.filter((item) => !item.is_inbox && !item.closed && !item.is_project);
}

export function MarkListPicker({
  copy,
  anchor,
  open,
  onClose,
}: {
  readonly copy: ProjectsCopy;
  readonly anchor?: RefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const lists = useQuery({
    queryKey: ['projects', 'markable'],
    queryFn: openLists,
    enabled: open,
  });
  const needle = query.trim().toLocaleLowerCase(copy.locale);
  const visible = (lists.data ?? []).filter((item) =>
    needle.length === 0 ? true : item.name.toLocaleLowerCase(copy.locale).includes(needle),
  );
  return (
    <Popover
      open={open}
      anchor={anchor}
      label={copy.markList}
      onClose={onClose}
      className="project-picker"
    >
      <input
        value={query}
        placeholder={copy.searchList}
        aria-label={copy.searchList}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {lists.isPending ? <p>{copy.loading}</p> : null}
      {lists.isSuccess && visible.length === 0 ? <p>{copy.noLists}</p> : null}
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            runAction(
              api
                .updateProject(item.id, { is_project: true })
                .then(() => refreshProjectSurfaces(client)),
              { success: onClose },
            );
          }}
        >
          {item.name}
        </button>
      ))}
    </Popover>
  );
}
