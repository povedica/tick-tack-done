import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, UserRound } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useMessages } from '../../i18n';

interface Person {
  readonly id: string;
  readonly label: string;
  readonly email: string;
}

const avatarTones = ['0', '1', '2', '3', '4'] as const;

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
  const root = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const people = peopleOf(members.data, messages.shareOwner);
  const selected = people.find((person) => person.id === assigneeId);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent): void {
      if (!(event.target instanceof Node) || root.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const anchor = row.current;
    const panel = menu.current;
    if (anchor === null || panel === null) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const roomRight = window.innerWidth - rect.right - gap;
    const left = roomRight >= width ? rect.right + gap : Math.max(8, rect.left - gap - width);
    const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - height - 8));
    panel.style.left = `${String(left)}px`;
    panel.style.top = `${String(top)}px`;
  }, [open, people.length]);

  function assign(next: string): void {
    setOpen(false);
    void api
      .assignTask(taskId, next.length === 0 ? null : next)
      .then(() => queryClient.invalidateQueries({ queryKey: ['task', taskId] }))
      .catch(() => undefined);
  }

  if (!canAssign) {
    return null;
  }

  return (
    <div className="detail-assign" ref={root}>
      <button
        ref={row}
        type="button"
        className="popover-row detail-assign-row"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <UserRound size={16} aria-hidden="true" />
        <span>{messages.assigneeAssign}</span>
        <span
          className={
            selected === undefined ? 'detail-assign-value is-empty' : 'detail-assign-value'
          }
        >
          {selected === undefined ? (
            messages.assigneeNone
          ) : (
            <>
              <PersonMark person={selected} />
              <span className="detail-assign-name">{selected.label}</span>
            </>
          )}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div
          ref={menu}
          id={listId}
          className="detail-assign-menu"
          role="menu"
          aria-label={messages.assigneeUnassigned}
        >
          <p className="detail-assign-menu-title">{messages.assigneeUnassigned}</p>
          {people.map((person) => {
            const chosen = person.id === assigneeId;
            return (
              <button
                key={person.id}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                className="detail-assign-option"
                onClick={() => {
                  assign(chosen ? '' : person.id);
                }}
              >
                <PersonMark person={person} />
                <span>{person.label}</span>
                {chosen ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PersonMark({ person }: { readonly person: Person }) {
  return (
    <span className="detail-assign-avatar" data-tone={toneOf(person.id)} aria-hidden="true">
      {person.label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function toneOf(id: string): (typeof avatarTones)[number] {
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0)) % avatarTones.length;
  }
  return avatarTones[hash] ?? '0';
}

export function AssigneeMark({
  projectId,
  assigneeId,
  canAssign,
}: {
  readonly projectId: string;
  readonly assigneeId: string | null;
  readonly canAssign: boolean;
}) {
  const messages = useMessages();
  const members = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.listMembers(projectId),
    enabled: canAssign && assigneeId !== null && projectId.length > 0,
  });
  if (!canAssign || assigneeId === null) {
    return null;
  }
  const person = peopleOf(members.data, messages.shareOwner).find((item) => item.id === assigneeId);
  if (person === undefined) {
    return null;
  }
  const letter = person.label.slice(0, 1).toUpperCase();
  const label = `${messages.assigneeLabel}: ${person.label}`;
  return (
    <span className="detail-assignee" title={label} aria-label={label}>
      {letter}
    </span>
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
    const email = typeof row.email === 'string' ? row.email : '';
    const label =
      typeof row.display_name === 'string' && row.display_name.length > 0
        ? row.display_name
        : row.permission === 'owner'
          ? ownerLabel
          : email.length > 0
            ? email
            : ownerLabel;
    return [{ id: row.user_id, label, email }];
  });
}
