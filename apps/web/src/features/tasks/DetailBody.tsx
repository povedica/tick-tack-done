import { Bell, GripVertical, Paperclip, Plus, Repeat, X } from 'lucide-react';
import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { PriorityCheck } from '../../components/PriorityCheck';
import { attachmentHref } from './task-http';
import Markdown from 'react-markdown';
import { TagIcon } from '../../components/TagIcon';
import { displayTitle } from './displayTitle';
import { useMessages } from '../../i18n';
import { collapseRepeatedContent } from './collapse-repeated';

export function DetailBody({
  taskId,
  title,
  content,
  titleLabel,
  untitled,
  contentLabel,
  contentHint,
  contentRef,
  editRequested = false,
  checklistLabel,
  checklistAdd,
  checklistEdit,
  checklistDelete,
  tagAdd,
  items,
  subtasks,
  subtasksLabel,
  tags,
  reminder,
  repeat,
  attachments,
  attachmentLabel,
  attachmentDownload,
  attachmentDelete,
  attachmentDrop,
  onTitle,
  onTitleKey,
  onContent,
  onToggleItem,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onReorderItem,
  onRemoveTag,
  onOpenTags,
  onClearReminder,
  onClearRepeat,
  onToggleSubtask,
  onDeleteAttachment,
  onDropFiles,
}: {
  readonly taskId: string;
  readonly title: string;
  readonly content: string;
  readonly titleLabel: string;
  readonly untitled: string;
  readonly contentLabel: string;
  readonly contentHint: string;
  readonly contentRef: RefObject<HTMLTextAreaElement | null>;
  readonly editRequested?: boolean;
  readonly checklistLabel: string;
  readonly checklistAdd: string;
  readonly checklistEdit: string;
  readonly checklistDelete: string;
  readonly tagAdd: string;
  readonly items: readonly {
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
  }[];
  readonly subtasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
  }[];
  readonly subtasksLabel: string;
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
  }[];
  readonly reminder: string | null;
  readonly repeat: string | null;
  readonly attachments: readonly {
    readonly id: string;
    readonly name: string;
    readonly size: number;
  }[];
  readonly attachmentLabel: string;
  readonly attachmentDownload: string;
  readonly attachmentDelete: string;
  readonly attachmentDrop: string;
  readonly onTitle: (value: string) => void;
  readonly onTitleKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onContent: (value: string) => void;
  readonly onToggleItem: (id: string, done: boolean) => void;
  readonly onAddItem: (title: string) => void;
  readonly onEditItem: (id: string, title: string) => void;
  readonly onDeleteItem: (id: string) => void;
  readonly onReorderItem: (id: string, beforeId: string) => void;
  readonly onRemoveTag: (id: string) => void;
  readonly onOpenTags: () => void;
  readonly onClearReminder: () => void;
  readonly onClearRepeat: () => void;
  readonly onToggleSubtask: (id: string, done: boolean) => void;
  readonly onDeleteAttachment: (id: string) => void;
  readonly onDropFiles: (files: FileList) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const messages = useMessages();
  const cleanContent = collapseRepeatedContent(content);
  useLayoutEffect(() => {
    setEditingContent(false);
  }, [taskId]);
  useLayoutEffect(() => {
    if (editRequested) setEditingContent(true);
  }, [editRequested]);
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (node !== null) {
      fit(node);
    }
  }, [content, contentRef, taskId, editingContent]);
  const done = items.filter((item) => item.done).length;
  const subtaskDone = subtasks.filter((item) => item.done).length;
  return (
    <div
      className="detail-body"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) {
          return;
        }
        event.preventDefault();
        onDropFiles(event.dataTransfer.files);
      }}
      onPaste={(event) => {
        const files = event.clipboardData.files;
        if (files.length === 0) {
          return;
        }
        event.preventDefault();
        onDropFiles(files);
      }}
    >
      <textarea
        className="detail-title"
        aria-label={titleLabel}
        defaultValue={displayTitle(title)}
        key={title}
        rows={1}
        ref={(node) => {
          if (node !== null) fit(node);
        }}
        placeholder={untitled}
        onInput={(event) => {
          fit(event.currentTarget);
        }}
        onKeyDown={onTitleKey}
        onBlur={(event) => {
          onTitle(event.target.value);
        }}
      />
      {!editingContent && cleanContent.length > 0 ? (
        <section className="detail-markdown">
          {cleanContent !== content ? (
            <p role="status">
              {messages.repeatedContentNotice}{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onContent(cleanContent);
                }}
              >
                {messages.repairDescription}
              </button>
            </p>
          ) : null}
          <Markdown>{cleanContent}</Markdown>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEditingContent(true);
            }}
          >
            {messages.editDescription}
          </button>
        </section>
      ) : (
        <textarea
          ref={contentRef}
          className="detail-content"
          aria-label={contentLabel}
          placeholder={contentHint}
          defaultValue={cleanContent}
          key={taskId}
          rows={3}
          onInput={(event) => {
            fit(event.currentTarget);
          }}
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Element &&
              event.relatedTarget.closest('.format-bar') !== null
            )
              return;
            onContent(event.target.value);
            if (!editRequested) setEditingContent(false);
          }}
          autoFocus={editingContent}
        />
      )}
      <section className="detail-block detail-checks">
        <div className="detail-block-head">
          <h3>
            {checklistLabel} {items.length > 0 ? `${String(done)}/${String(items.length)}` : ''}
          </h3>
          {items.length > 0 ? (
            <span className="check-progress" aria-hidden="true">
              <span style={{ width: `${String(Math.round((done / items.length) * 100))}%` }} />
            </span>
          ) : null}
        </div>
        <ul className="detail-check">
          {items.map((item) => (
            <li
              key={item.id}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                const id = event.dataTransfer.getData('text/checklist');
                if (id.length > 0 && id !== item.id) {
                  onReorderItem(id, item.id);
                }
              }}
            >
              <button
                type="button"
                className="check-grip"
                draggable
                aria-label={checklistEdit}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/checklist', item.id);
                }}
              >
                <GripVertical size={14} aria-hidden="true" />
              </button>
              <PriorityCheck
                priority="none"
                label={item.title}
                checked={item.done}
                onChange={() => {
                  onToggleItem(item.id, item.done);
                }}
              />
              {editing === item.id ? (
                <input
                  className="check-edit"
                  aria-label={checklistEdit}
                  defaultValue={item.title}
                  autoFocus
                  onBlur={(event) => {
                    setEditing(null);
                    const next = event.target.value.trim();
                    if (next.length > 0 && next !== item.title) {
                      onEditItem(item.id, next);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={item.done ? 'check-title is-done' : 'check-title'}
                  onClick={() => {
                    setEditing(item.id);
                  }}
                >
                  {item.title}
                </button>
              )}
              <button
                type="button"
                className="icon-button check-remove"
                aria-label={checklistDelete}
                onClick={() => {
                  onDeleteItem(item.id);
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="check-add"
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
          <input
            className="check-add-input"
            name="item"
            aria-label={checklistAdd}
            placeholder={`+ ${checklistAdd}`}
          />
        </form>
      </section>
      {subtasks.length > 0 ? (
        <section className="detail-block detail-checks">
          <h3>
            {subtasksLabel} {subtaskDone}/{subtasks.length}
          </h3>
          <ul className="detail-check">
            {subtasks.map((child) => (
              <li key={child.id}>
                <PriorityCheck
                  priority="none"
                  label={displayTitle(child.title)}
                  checked={child.done}
                  onChange={() => {
                    onToggleSubtask(child.id, child.done);
                  }}
                />
                <Link
                  className={child.done ? 'check-title is-done' : 'check-title'}
                  to={`?task=${child.id}`}
                >
                  {displayTitle(child.title)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
            <TagIcon color={tag.color} />
            {tag.name}
            <X size={12} aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="tag-add" onClick={onOpenTags}>
          <Plus size={14} aria-hidden="true" />
          {tagAdd}
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
      <section className="detail-block">
        <h3>
          {attachmentLabel}
          {attachments.length > 0 ? ` (${String(attachments.length)})` : ''}
        </h3>
        <p className="detail-drop">{attachmentDrop}</p>
        <label className="detail-attach-btn">
          <input
            type="file"
            multiple
            onChange={(event) => {
              if (event.target.files !== null && event.target.files.length > 0) {
                onDropFiles(event.target.files);
                event.target.value = '';
              }
            }}
          />
          <Paperclip size={14} aria-hidden="true" />
          {attachmentLabel}
        </label>
        <ul className="detail-files">
          {attachments.map((file) => (
            <li key={file.id}>
              <Paperclip size={14} aria-hidden="true" />
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
              <a href={attachmentHref(taskId, file.id)} download={file.name}>
                {attachmentDownload}
              </a>
              <button
                type="button"
                className="icon-button"
                aria-label={attachmentDelete}
                onClick={() => {
                  onDeleteAttachment(file.id);
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function fit(field: HTMLTextAreaElement): void {
  field.style.height = 'auto';
  field.style.height = `${String(field.scrollHeight)}px`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${String(Math.round(bytes / 102.4) / 10)} KB`;
  }
  return `${String(Math.round(bytes / 104857.6) / 10)} MB`;
}

function tagStyle(color: string | null): CSSProperties | undefined {
  if (color === null || color.length === 0) {
    return undefined;
  }
  return { background: `color-mix(in srgb, ${color} 22%, transparent)` };
}
