import { isSmartListKey } from '@reflexionia/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useMessages, type Messages } from '../../../i18n';
import { viewsApi } from '../api';

export function SmartListsPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: ['smart-lists'], queryFn: () => viewsApi.listSmartLists() });
  const [order, setOrder] = useState<string[] | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = lists.data?.items ?? [];
  const keys = order ?? items.map((item) => item.key);
  const flags =
    enabled ?? Object.fromEntries(items.map((item) => [item.key, item.enabled] as const));

  const save = useMutation({
    mutationFn: () =>
      viewsApi.updateSmartLists({
        items: keys.flatMap((key) =>
          isSmartListKey(key) ? [{ key, enabled: flags[key] ?? true }] : [],
        ),
      }),
    onSuccess: async () => {
      setOrder(null);
      setEnabled(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['smart-lists'] });
    },
    onError: () => {
      setError(messages.smartFailed);
    },
  });

  return (
    <main className="screen">
      <p>
        <Link to="/today">{messages.backToday}</Link>
      </p>
      <h1>{messages.smartListsTitle}</h1>
      <p>{messages.smartListsHint}</p>
      {lists.isError || error !== null ? <p className="error">{messages.smartFailed}</p> : null}
      <ul className="task-list">
        {keys.map((key, index) => (
          <li key={key}>
            <Link to={`/smart-lists/${key}`}>{smartLabel(messages, key)}</Link>
            <span>{items.find((item) => item.key === key)?.task_count ?? 0}</span>
            <label>
              <input
                type="checkbox"
                checked={flags[key] ?? true}
                onChange={(event) => {
                  setEnabled({ ...flags, [key]: event.target.checked });
                  setOrder(keys);
                }}
              />
              {messages.smartEnabled}
            </label>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                setOrder(move(keys, index, -1));
                setEnabled(flags);
              }}
            >
              {messages.smartMoveUp}
            </button>
            <button
              type="button"
              disabled={index === keys.length - 1}
              onClick={() => {
                setOrder(move(keys, index, 1));
                setEnabled(flags);
              }}
            >
              {messages.smartMoveDown}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={save.isPending || keys.length === 0}
        onClick={() => {
          save.mutate();
        }}
      >
        {save.isPending ? messages.smartSaving : messages.smartSave}
      </button>
    </main>
  );
}

function move(keys: readonly string[], index: number, delta: number): string[] {
  const next = [...keys];
  const target = index + delta;
  const current = next[index];
  const other = next[target];
  if (current === undefined || other === undefined) {
    return next;
  }
  next[index] = other;
  next[target] = current;
  return next;
}

function smartLabel(messages: Messages, key: string): string {
  switch (key) {
    case 'today':
      return messages.smartToday;
    case 'tomorrow':
      return messages.smartTomorrow;
    case 'next_7_days':
      return messages.smartNext7;
    case 'all':
      return messages.smartAll;
    case 'inbox':
      return messages.smartInbox;
    case 'assigned_to_me':
      return messages.smartAssigned;
    case 'completed':
      return messages.smartCompleted;
    case 'trash':
      return messages.smartTrash;
    case 'no_date':
      return messages.smartNoDate;
    case 'recently_added':
      return messages.smartRecent;
    default:
      return key;
  }
}
