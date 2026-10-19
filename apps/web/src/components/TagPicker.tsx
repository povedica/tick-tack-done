import { useMemo, useState } from 'react';
import { useMessages } from '../i18n';
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
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length === 0) {
      return tags;
    }
    return tags.filter((tag) => tag.name.toLocaleLowerCase().includes(needle));
  }, [query, tags]);
  return (
    <Popover open={open} label={messages.tagAdd} onClose={onClose} className="popover popover-menu">
      <input
        className="popover-search"
        value={query}
        aria-label={messages.tagSearch}
        placeholder={messages.tagSearch}
        onChange={(event) => {
          setQuery(event.target.value);
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
                  className="ui-tag"
                  style={
                    tag.color === null ? undefined : { background: tag.color, color: '#191919' }
                  }
                >
                  {tag.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
