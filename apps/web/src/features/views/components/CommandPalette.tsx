import { runAction } from '../../../components/run-action';
import type { SearchResponse } from '@reflexionia/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMessages, type Messages } from '../../../i18n';
import { viewsApi } from '../api';

export function CommandPalette({ onClose }: { readonly onClose: () => void }) {
  const messages = useMessages();
  const navigate = useNavigate();
  const titleId = useId();
  const [query, setQuery] = useState('');
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const search = useQuery({
    queryKey: ['search', query],
    queryFn: () => viewsApi.search(query),
    enabled: query.trim().length > 0,
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const text = search.data?.text ?? query.trim();

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <h2 id={titleId}>{messages.paletteTitle}</h2>
        <input
          autoFocus
          value={query}
          placeholder={messages.palettePlaceholder}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <ul className="task-list">
          <li>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (text.length > 0) {
                  params.set('text', text);
                }
                const suffix = params.toString();
                runAction(
                  Promise.resolve(
                    navigate(suffix.length === 0 ? '/quick-add' : `/quick-add?${suffix}`),
                  ),
                );
                onClose();
              }}
            >
              {messages.paletteCreate}
              {text.length > 0 ? `: ${text}` : ''}
            </button>
          </li>
          {query.trim().startsWith('>') || query.trim().length === 0 ? (
            <>
              <CommandItem
                label={messages.commandToday}
                onRun={() => {
                  runAction(Promise.resolve(navigate('/today')));
                  onClose();
                }}
              />
              <CommandItem
                label={messages.commandInbox}
                onRun={() => {
                  runAction(Promise.resolve(navigate('/inbox')));
                  onClose();
                }}
              />
              <CommandItem
                label={messages.commandSettings}
                onRun={() => {
                  runAction(Promise.resolve(navigate('/settings/appearance')));
                  onClose();
                }}
              />
              <CommandItem
                label={messages.commandSync}
                onRun={() => {
                  runAction(Promise.resolve(navigate('/today')));
                  onClose();
                }}
              />
            </>
          ) : null}
          {query.trim().length === 0
            ? (projects.data?.items ?? []).map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => {
                      runAction(Promise.resolve(navigate(`/lists/${project.id}`)));
                      onClose();
                    }}
                  >
                    {messages.paletteGo} {project.name}
                  </button>
                </li>
              ))
            : null}
          <SearchGroups messages={messages} data={search.data} />
        </ul>
        {query.trim().length > 0 && search.isSuccess && search.data.groups.length === 0 ? (
          <p>{messages.paletteEmpty}</p>
        ) : null}
      </div>
    </div>
  );
}

function SearchGroups({
  messages,
  data,
}: {
  readonly messages: Messages;
  readonly data: SearchResponse | undefined;
}) {
  if (data === undefined) {
    return null;
  }
  return (
    <>
      {data.groups.map((group) => (
        <li key={group.type}>
          <p>{groupTitle(messages, group.type)}</p>
          <ul>
            {group.items.map((item, index) => (
              <li key={itemId(item, index)}>{itemLabel(item)}</li>
            ))}
          </ul>
        </li>
      ))}
    </>
  );
}

function CommandItem({ label, onRun }: { readonly label: string; readonly onRun: () => void }) {
  return (
    <li>
      <button type="button" onClick={onRun}>
        {label}
      </button>
    </li>
  );
}

function groupTitle(messages: Messages, type: string): string {
  switch (type) {
    case 'task':
      return messages.paletteTasks;
    case 'note':
      return messages.paletteNotes;
    case 'list':
      return messages.paletteLists;
    case 'tag':
      return messages.paletteTags;
    default:
      return type;
  }
}

function itemId(item: Record<string, unknown>, index: number): string {
  return typeof item.id === 'string' ? item.id : String(index);
}

function itemLabel(item: Record<string, unknown>): string {
  if (typeof item.title === 'string') {
    return item.title;
  }
  if (typeof item.name === 'string') {
    return item.name;
  }
  return '';
}
