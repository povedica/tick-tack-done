import { useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpToLine,
  Check,
  ChevronRight,
  Merge,
  Pencil,
  Tag,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { normalizeTagName } from '@reflexionia/domain';
import { ApiError } from '@reflexionia/sdk';
import { api } from '../api';
import { Popover } from '../components/Popover';
import { Button } from '../components/ui';
import type { Messages } from '../i18n';
import { refreshTaskSurfaces } from '../features/tasks/refresh';
import './tags.css';

interface TagItem {
  id: string;
  name: string;
  color: string | null;
  parent_id?: string | null;
}
const COLORS = [
  '#4772FA',
  '#E13E39',
  '#FAA80C',
  '#1F9D55',
  '#7C5CFF',
  '#F06595',
  '#00A6A6',
  '#777777',
];
type Mode = 'menu' | 'edit' | 'subtag' | 'merge' | 'delete';

export function TagActions({
  tag,
  tags,
  anchor,
  messages: m,
  onClose,
}: {
  readonly tag: TagItem;
  readonly tags: readonly TagItem[];
  readonly anchor: RefObject<HTMLButtonElement | null>;
  readonly messages: Messages;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('menu');
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<string | null>(tag.color);
  const [parent, setParent] = useState(tag.parent_id ?? '');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idempotency = useRef(crypto.randomUUID());
  const field = useRef<HTMLInputElement>(null);
  const close = () => {
    if (!pending) {
      onClose();
      anchor.current?.focus();
    }
  };
  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next === 'subtag') {
      setName('');
      setParent(tag.id);
    }
    if (next === 'edit') {
      setName(tag.name);
      setParent(tag.parent_id ?? '');
    }
    requestAnimationFrame(() => field.current?.focus());
  };
  const run = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
        queryClient.invalidateQueries({ queryKey: ['filters'] }),
        refreshTaskSurfaces(queryClient),
      ]);
      onClose();
      anchor.current?.focus();
    } catch (cause) {
      setError(
        cause instanceof ApiError && (cause.status === 409 || cause.code === 'tag_name_taken')
          ? m.nameTaken
          : m.tagActionError,
      );
    } finally {
      setPending(false);
    }
  };
  // Exclude descendants from both parent and merge destinations: neither can form a cycle.
  const descendants = new Set([tag.id]);
  for (const parentId of descendants) {
    for (const item of tags) {
      if (item.parent_id === parentId) descendants.add(item.id);
    }
  }
  const choices = tags.filter((item) => !descendants.has(item.id));
  const title =
    mode === 'edit'
      ? m.tagEdit
      : mode === 'subtag'
        ? m.tagSubtag
        : mode === 'merge'
          ? m.tagMerge
          : mode === 'delete'
            ? m.batchDelete
            : tag.name;
  return (
    <Popover
      open
      anchor={anchor}
      label={`${m.tagActions}: ${tag.name}`}
      onClose={close}
      className="tag-actions popover"
    >
      {mode === 'menu' ? (
        <>
          <div className="tag-menu-title">
            <Tag size={15} />
            <span>{tag.name}</span>
          </div>
          <div
            role="menu"
            aria-label={m.tagActions}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              ];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
              items[next]?.focus();
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                switchMode('edit');
              }}
            >
              <Pencil size={16} />
              {m.tagEdit}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void run(() =>
                  api.updateTag(tag.id, {
                    parent_id: tag.parent_id ?? null,
                    before_id:
                      tags.find(
                        (item) =>
                          item.id !== tag.id &&
                          (item.parent_id ?? null) === (tag.parent_id ?? null),
                      )?.id ?? null,
                  }),
                );
              }}
              disabled={pending}
            >
              <ArrowUpToLine size={16} />
              {m.tagMoveFirst}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                switchMode('subtag');
              }}
            >
              <Tags size={16} />
              {m.tagSubtag}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={choices.length === 0}
              onClick={() => {
                switchMode('merge');
              }}
            >
              <Merge size={16} />
              {m.tagMerge}
              <ChevronRight size={14} />
            </button>
            <div className="tag-menu-divider" />
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                switchMode('delete');
              }}
            >
              <Trash2 size={16} />
              {m.batchDelete}
            </button>
          </div>
        </>
      ) : (
        <>
          <header>
            <button
              type="button"
              aria-label={m.tagBack}
              disabled={pending}
              onClick={() => {
                switchMode('menu');
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <strong>{title}</strong>
            <button type="button" aria-label={m.close} disabled={pending} onClick={close}>
              <X size={16} />
            </button>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === 'delete') {
                void run(() => api.deleteTag(tag.id));
                return;
              }
              if (mode === 'merge') {
                if (target) void run(() => api.mergeTags(tag.id, target));
                return;
              }
              const normalized = normalizeTagName(name);
              if (!normalized) {
                setError(m.nameInvalid);
                field.current?.focus();
                return;
              }
              void run(() =>
                mode === 'subtag'
                  ? api.createTag(
                      { name: normalized, color, parent_id: parent || null },
                      idempotency.current,
                    )
                  : api.updateTag(tag.id, { name: normalized, color, parent_id: parent || null }),
              );
            }}
          >
            {mode === 'edit' || mode === 'subtag' ? (
              <>
                <label>
                  {m.tagName}
                  <input
                    ref={field}
                    maxLength={100}
                    value={name}
                    disabled={pending}
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                </label>
                <fieldset disabled={pending}>
                  <legend>{m.tagColor}</legend>
                  <div className="tag-color-grid">
                    <button
                      type="button"
                      className="tag-color-clear"
                      aria-label={m.tagNoColor}
                      aria-pressed={color === null}
                      onClick={() => {
                        setColor(null);
                      }}
                    >
                      <X size={15} />
                    </button>
                    {COLORS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        style={{ background: value }}
                        aria-label={value}
                        aria-pressed={color?.toUpperCase() === value}
                        onClick={() => {
                          setColor(value);
                        }}
                      >
                        {color?.toUpperCase() === value ? <Check size={15} /> : null}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label>
                  {m.tagParent}
                  <select
                    value={parent}
                    disabled={pending}
                    onChange={(event) => {
                      setParent(event.target.value);
                    }}
                  >
                    <option value="">{m.tagNoParent}</option>
                    {(mode === 'subtag' ? tags : choices).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : mode === 'merge' ? (
              <>
                <p>{m.tagMergeConfirm}</p>
                <label>
                  {m.tagMerge}
                  <select
                    autoFocus
                    value={target}
                    disabled={pending}
                    onChange={(event) => {
                      setTarget(event.target.value);
                    }}
                  >
                    <option value="">—</option>
                    {choices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p>{m.tagDeleteConfirm}</p>
            )}
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
            <footer>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={close}>
                {m.cancel}
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={pending}
                variant={mode === 'delete' ? 'danger' : 'primary'}
                disabled={mode === 'merge' ? !target : mode !== 'delete' && !name.trim()}
              >
                {mode === 'delete' ? m.batchDelete : mode === 'merge' ? m.tagMerge : m.tagSave}
              </Button>
            </footer>
          </form>
        </>
      )}
      {mode === 'menu' && error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
    </Popover>
  );
}
