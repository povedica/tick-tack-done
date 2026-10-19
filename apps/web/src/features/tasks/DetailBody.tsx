import { Bell, Paperclip, Repeat, X } from 'lucide-react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Link } from 'react-router';

export function DetailBody({
  title,
  content,
  titleLabel,
  untitled,
  contentLabel,
  contentHint,
  checklistLabel,
  checklistAdd,
  tagAdd,
  items,
  subtasks,
  tags,
  reminder,
  repeat,
  attachmentCount,
  attachmentLabel,
  onTitle,
  onTitleKey,
  onContent,
  onToggleItem,
  onAddItem,
  onRemoveTag,
  onOpenTags,
  onClearReminder,
  onClearRepeat,
}: {
  readonly title: string;
  readonly content: string;
  readonly titleLabel: string;
  readonly untitled: string;
  readonly contentLabel: string;
  readonly contentHint: string;
  readonly checklistLabel: string;
  readonly checklistAdd: string;
  readonly tagAdd: string;
  readonly items: readonly {
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
  }[];
  readonly subtasks: readonly { readonly id: string; readonly title: string }[];
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
  }[];
  readonly reminder: string | null;
  readonly repeat: string | null;
  readonly attachmentCount: number;
  readonly attachmentLabel: string;
  readonly onTitle: (value: string) => void;
  readonly onTitleKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onContent: (value: string) => void;
  readonly onToggleItem: (id: string, done: boolean) => void;
  readonly onAddItem: (title: string) => void;
  readonly onRemoveTag: (id: string) => void;
  readonly onOpenTags: () => void;
  readonly onClearReminder: () => void;
  readonly onClearRepeat: () => void;
}) {
  return (
    <div className="detail-body">
      <textarea
        className="detail-title"
        aria-label={titleLabel}
        defaultValue={title}
        key={title}
        rows={1}
        placeholder={untitled}
        onInput={(event) => {
          const field = event.currentTarget;
          field.style.height = 'auto';
          field.style.height = `${String(field.scrollHeight)}px`;
        }}
        onKeyDown={onTitleKey}
        onBlur={(event) => {
          onTitle(event.target.value);
        }}
      />
      <textarea
        className="detail-content"
        aria-label={contentLabel}
        placeholder={contentHint}
        defaultValue={content}
        key={content}
        rows={3}
        onBlur={(event) => {
          onContent(event.target.value);
        }}
      />
      <section className="detail-block">
        <h3 className="sr-only">{checklistLabel}</h3>
        <ul className="detail-check">
          {items.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {
                    onToggleItem(item.id, item.done);
                  }}
                />
                <span>{item.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const raw = data.get('item');
            const next = (typeof raw === 'string' ? raw : '').trim();
            if (next.length === 0) {
              return;
            }
            onAddItem(next);
            event.currentTarget.reset();
          }}
        >
          <input name="item" aria-label={checklistAdd} placeholder={`+ ${checklistAdd}`} />
        </form>
      </section>
      {subtasks.length > 0 ? (
        <ul className="detail-subtasks">
          {subtasks.map((child) => (
            <li key={child.id}>
              <Link to={`?task=${child.id}`}>{child.title}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="detail-tags">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="ui-tag"
            style={tagStyle(tag.color)}
            onClick={() => {
              onRemoveTag(tag.id);
            }}
          >
            {tag.name}
            <X size={12} aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="tag-add" aria-label={tagAdd} onClick={onOpenTags}>
          +
        </button>
      </div>
      {reminder !== null ? (
        <p className="detail-row">
          <Bell size={14} aria-hidden="true" />
          <span>{reminder}</span>
          <button
            type="button"
            className="icon-button"
            aria-label={reminder}
            onClick={onClearReminder}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      ) : null}
      {repeat !== null ? (
        <p className="detail-row">
          <Repeat size={14} aria-hidden="true" />
          <span>{repeat}</span>
          <button type="button" className="icon-button" aria-label={repeat} onClick={onClearRepeat}>
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      ) : null}
      {attachmentCount > 0 ? (
        <p className="detail-row">
          <Paperclip size={14} aria-hidden="true" />
          <span>
            {attachmentCount} {attachmentLabel}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function tagStyle(color: string | null): CSSProperties | undefined {
  if (color === null || color.length === 0) {
    return undefined;
  }
  return { background: color, color: '#191919' };
}
