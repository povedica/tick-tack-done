import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useMessages } from '../../i18n';

interface Person {
  readonly id: string;
  readonly label: string;
}

export function AssigneeField({
  taskId,
  projectId,
  assigneeId,
  canAssign,
}: {
  readonly taskId: string;
  readonly projectId: string;
  readonly assigneeId: string | null;
  readonly canAssign: boolean;
}) {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.listMembers(projectId),
    enabled: canAssign && projectId.length > 0,
  });
  if (!canAssign) {
    return null;
  }
  const options = peopleOf(members.data, messages.shareOwner);
  return (
    <label className="detail-meta-chip">
      {messages.assigneeLabel}
      <select
        aria-label={messages.assigneeLabel}
        value={assigneeId ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          void api
            .assignTask(taskId, next.length === 0 ? null : next)
            .then(() => queryClient.invalidateQueries({ queryKey: ['task', taskId] }))
            .catch(() => undefined);
        }}
      >
        <option value="">{messages.assigneeNone}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function peopleOf(value: unknown, ownerLabel: string): readonly Person[] {
  if (typeof value !== 'object' || value === null || !('items' in value)) {
    return [];
  }
  const items = value.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const row = item as {
      user_id?: unknown;
      status?: unknown;
      permission?: unknown;
      display_name?: unknown;
      email?: unknown;
    };
    if (row.status !== 'accepted' || typeof row.user_id !== 'string' || row.user_id.length === 0) {
      return [];
    }
    const label =
      typeof row.display_name === 'string' && row.display_name.length > 0
        ? row.display_name
        : row.permission === 'owner'
          ? ownerLabel
          : typeof row.email === 'string'
            ? row.email
            : ownerLabel;
    return [{ id: row.user_id, label }];
  });
}
