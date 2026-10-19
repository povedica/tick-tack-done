import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { fill, useMessages } from '../i18n';
import { Popover } from './Popover';

export interface TagOption {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
}

export function TagPicker({
  open,
  tags,
  selected,
  onClose,
  onToggle,
}: {
  readonly open: boolean;
  readonly tags: readonly TagOption[];
  readonly selected: readonly string[];
  readonly onClose: () => void;
  readonly onToggle: (id: string) => void;
}) {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const shown = useMemo(() => {
    const filtered =
      needle.length === 0
        ? [...tags]
        : tags.filter((tag) => tag.name.toLocaleLowerCase().includes(needle));
    return filtered.sort((left, right) => {
      const leftOn = selected.includes(left.id) ? 0 : 1;
      const rightOn = selected.includes(right.id) ? 0 : 1;
      return leftOn - rightOn || left.name.localeCompare(right.name);
    });
  }, [needle, selected, tags]);
  const exact = tags.some((tag) => tag.name.toLocaleLowerCase() === needle);
  return (
    <Popover
      open={open}
      label={messages.tagAdd}
      onClose={onClose}
      className="popover popover-menu tag-picker"
    >
      <input
        className="popover-search"
        value={query}
        aria-label={messages.tagSearch}
        placeholder={messages.tagSearch}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && needle.length > 0 && !exact) {
            event.preventDefault();
            create(query.trim());
          }
        }}
      />
      <ul className="popover-list">
        {shown.map((tag) => {
          const checked = selected.includes(tag.id);
          return (
            <li key={tag.id}>
              <label className="popover-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onToggle(tag.id);
                  }}
                />
                <span
                  className="tag-dot"
                  style={tag.color === null ? undefined : { background: tag.color }}
                />
                <span className="tag-name">{tag.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {needle.length > 0 && !exact ? (
        <button
          type="button"
          className="popover-row"
          onClick={() => {
            create(query.trim());
          }}
        >
          {fill(messages.tagCreateNamed, query.trim())}
        </button>
      ) : null}
    </Popover>
  );

  function create(name: string): void {
    void api.createTag({ name, color: '#4772fa' }, crypto.randomUUID()).then((tag) => {
      setQuery('');
      onToggle(tag.id);
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
    });
  }
}
