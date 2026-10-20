import { isSmartListKey, SMART_LIST_KEYS } from '@reflexionia/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  Inbox,
  ListTodo,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link, useLocation } from 'react-router';
import { SkeletonRows } from '../../../components/ui';
import { useMessages, type Messages } from '../../../i18n';
import { orderedSmartLists } from '../../../shell/smart-order';
import { usePreferences } from '../../../theme/preferences';
import { viewsApi } from '../api';

const ICONS: Record<string, LucideIcon> = {
  today: Sun,
  tomorrow: CalendarDays,
  next_7_days: CalendarRange,
  all: ListTodo,
  inbox: Inbox,
  assigned_to_me: UserRound,
  completed: CheckCircle2,
  no_date: CalendarDays,
  recently_added: Sparkles,
  trash: Trash2,
};

const PINNED = 'trash';

interface SavePayload {
  readonly keys: readonly string[];
  readonly flags: Readonly<Record<string, boolean>>;
  readonly generation: number;
}

export function SmartListsPage() {
  const messages = useMessages();
  const inSettings = useLocation().pathname.startsWith('/settings');
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: ['smart-lists'], queryFn: () => viewsApi.listSmartLists() });
  const showCounters = usePreferences((state) => state.showCounters);
  const setShowCounters = usePreferences((state) => state.setShowCounters);
  const [order, setOrder] = useState<string[] | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);
  const [notice, setNotice] = useState<'saving' | 'saved' | 'error' | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const items = orderedSmartLists(lists.data?.items ?? []);
  const keys = order ?? items.map((item) => item.key);
  const flags = enabled ?? Object.fromEntries(items.map((item) => [item.key, item.enabled]));
  const sidebarKeys = keys.filter((key) => key !== PINNED);
  const menuId = useId();

  const save = useMutation({
    mutationFn: (payload: SavePayload) =>
      viewsApi.updateSmartLists({
        items: payload.keys.flatMap((key) =>
          isSmartListKey(key) ? [{ key, enabled: payload.flags[key] ?? true }] : [],
        ) as Parameters<typeof viewsApi.updateSmartLists>[0]['items'],
      }),
    onSuccess: (page, payload) => {
      if (payload.generation !== generation.current) {
        return;
      }
      queryClient.setQueryData(['smart-lists'], page);
      setOrder(null);
      setEnabled(null);
      setNotice('saved');
    },
    onError: (_error, payload) => {
      if (payload.generation !== generation.current) {
        return;
      }
      setNotice('error');
    },
  });

  useEffect(() => {
    if (openKey === null) {
      return;
    }
    function close(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenKey(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenKey(null);
      }
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey]);

  function commit(nextKeys: readonly string[], nextFlags: Readonly<Record<string, boolean>>) {
    if (!isComplete(nextKeys)) {
      return;
    }
    generation.current += 1;
    const nextGeneration = generation.current;
    setOrder([...nextKeys]);
    setEnabled({ ...nextFlags });
    setNotice('saving');
    save.mutate({ keys: nextKeys, flags: nextFlags, generation: nextGeneration });
  }

  function move(from: string, to: string) {
    const next = reorderVisible(keys, from, to);
    if (next.join('\0') === keys.join('\0')) {
      return;
    }
    commit(next, flags);
  }

  return (
    <section className={inSettings ? 'smart-settings' : 'screen-page smart-settings'}>
      <header className="page-header">
        <div>
          <h1>{messages.smartListsTitle}</h1>
          <p className="lede">{messages.smartListsHint}</p>
        </div>
      </header>
      {notice !== null ? (
        <p
          className={
            notice === 'error' ? 'smart-settings-status is-error' : 'smart-settings-status'
          }
          aria-live="polite"
        >
          {notice === 'saving'
            ? messages.smartSaving
            : notice === 'saved'
              ? messages.saved
              : messages.smartFailed}
        </p>
      ) : null}
      {lists.isError ? <p className="error">{messages.smartFailed}</p> : null}
      {lists.isPending ? <SkeletonRows /> : null}
      {lists.isSuccess ? (
        <>
          <ul className="smart-settings-card">
            {sidebarKeys.map((key) => (
              <SmartRow
                key={key}
                listKey={key}
                count={items.find((item) => item.key === key)?.task_count ?? 0}
                enabled={flags[key] ?? true}
                dragging={dragKey === key}
                over={overKey === key && dragKey !== key}
                open={openKey === key}
                menuId={`${menuId}-${key}`}
                menuRef={openKey === key ? menuRef : null}
                onOpen={() => {
                  setOpenKey((current) => (current === key ? null : key));
                }}
                onEnabled={(value) => {
                  setOpenKey(null);
                  commit(keys, { ...flags, [key]: value });
                }}
                onDragStart={() => {
                  setDragKey(key);
                }}
                onDragEnd={() => {
                  setDragKey(null);
                  setOverKey(null);
                }}
                onDragOver={() => {
                  setOverKey(key);
                }}
                onDrop={() => {
                  if (dragKey !== null) {
                    move(dragKey, key);
                  }
                  setDragKey(null);
                  setOverKey(null);
                }}
                onMove={(delta) => {
                  const target = neighbor(sidebarKeys, key, delta);
                  if (target !== null) {
                    move(key, target);
                  }
                }}
              />
            ))}
          </ul>
          {keys.includes(PINNED) ? (
            <ul className="smart-settings-card">
              <SmartRow
                listKey={PINNED}
                count={items.find((item) => item.key === PINNED)?.task_count ?? 0}
                enabled={flags[PINNED] ?? true}
                pinned
                open={openKey === PINNED}
                menuId={`${menuId}-${PINNED}`}
                menuRef={openKey === PINNED ? menuRef : null}
                onOpen={() => {
                  setOpenKey((current) => (current === PINNED ? null : PINNED));
                }}
                onEnabled={(value) => {
                  setOpenKey(null);
                  commit(keys, { ...flags, [PINNED]: value });
                }}
              />
            </ul>
          ) : null}
          <div className="smart-settings-card">
            <div className="smart-settings-panel">
              <div className="smart-settings-copy">
                <p className="smart-settings-label">{messages.counters}</p>
                <p className="smart-settings-caption">{messages.countersHint}</p>
              </div>
              <button
                type="button"
                className="smart-switch"
                role="switch"
                aria-checked={showCounters}
                aria-label={messages.counters}
                onClick={() => {
                  setShowCounters(!showCounters);
                }}
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SmartRow({
  listKey,
  count,
  enabled,
  pinned = false,
  dragging = false,
  over = false,
  open,
  menuId,
  menuRef,
  onOpen,
  onEnabled,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
}: {
  readonly listKey: string;
  readonly count: number;
  readonly enabled: boolean;
  readonly pinned?: boolean;
  readonly dragging?: boolean;
  readonly over?: boolean;
  readonly open: boolean;
  readonly menuId: string;
  readonly menuRef: RefObject<HTMLDivElement | null> | null;
  readonly onOpen: () => void;
  readonly onEnabled: (enabled: boolean) => void;
  readonly onDragStart?: () => void;
  readonly onDragEnd?: () => void;
  readonly onDragOver?: () => void;
  readonly onDrop?: () => void;
  readonly onMove?: (delta: number) => void;
}) {
  const messages = useMessages();
  const Icon = ICONS[listKey] ?? ListTodo;
  const label = smartLabel(messages, listKey);
  const visibility = enabled ? messages.smartShow : messages.smartHide;
  const className = [
    'smart-settings-row',
    pinned ? 'is-pinned' : '',
    enabled ? '' : 'is-hidden',
    dragging ? 'is-dragging' : '',
    over ? 'is-over' : '',
  ]
    .filter((item) => item.length > 0)
    .join(' ');

  return (
    <li
      className={className}
      onDragOver={
        pinned
          ? undefined
          : (event) => {
              event.preventDefault();
              onDragOver?.();
            }
      }
      onDrop={
        pinned
          ? undefined
          : (event) => {
              event.preventDefault();
              onDrop?.();
            }
      }
    >
      {pinned ? null : (
        <button
          type="button"
          className="smart-grip"
          draggable
          aria-label={messages.smartDrag}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', listKey);
            onDragStart?.();
          }}
          onDragEnd={() => {
            onDragEnd?.();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              onMove?.(-1);
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onMove?.(1);
            }
          }}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      )}
      <span className="smart-settings-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="smart-settings-copy">
        <Link className="smart-settings-name" to={`/smart/${listKey}`}>
          <span>{label}</span>
          <span className="smart-settings-count">{count}</span>
        </Link>
        {pinned ? <span className="smart-settings-caption">{messages.smartPinned}</span> : null}
      </span>
      <div className="smart-visibility" ref={menuRef}>
        <button
          type="button"
          className="smart-visibility-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={onOpen}
        >
          {visibility}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open ? (
          <div className="smart-visibility-menu" id={menuId} role="menu" aria-label={label}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={enabled}
              className="smart-settings-option"
              onClick={() => {
                onEnabled(true);
              }}
            >
              {messages.smartShow}
              {enabled ? <Check size={14} aria-hidden="true" /> : <span />}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!enabled}
              className="smart-settings-option"
              onClick={() => {
                onEnabled(false);
              }}
            >
              {messages.smartHide}
              {enabled ? <span /> : <Check size={14} aria-hidden="true" />}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function reorder(keys: readonly string[], from: string, to: string): string[] {
  const fromIndex = keys.indexOf(from);
  const toIndex = keys.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return [...keys];
  }
  const next = keys.filter((key) => key !== from);
  const target = next.indexOf(to);
  const insertAt = fromIndex < toIndex ? target + 1 : target;
  next.splice(insertAt, 0, from);
  return next;
}

function reorderVisible(keys: readonly string[], from: string, to: string): string[] {
  const visible = keys.filter((key) => key !== PINNED);
  const moved = reorder(visible, from, to);
  let cursor = 0;
  return keys.map((key) => {
    if (key === PINNED) {
      return key;
    }
    const next = moved[cursor];
    cursor += 1;
    return next ?? key;
  });
}

function neighbor(keys: readonly string[], key: string, delta: number): string | null {
  const index = keys.indexOf(key);
  if (index < 0) {
    return null;
  }
  return keys[index + delta] ?? null;
}

function isComplete(keys: readonly string[]): boolean {
  return (
    keys.length === SMART_LIST_KEYS.length &&
    SMART_LIST_KEYS.every((key) => keys.includes(key)) &&
    new Set(keys).size === keys.length
  );
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
