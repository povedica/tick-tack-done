import type { Messages } from '../../i18n';

export function DetailMenu({
  open,
  messages,
  pinned,
  onClose,
  onAddSubtask,
  onLinkParent,
  onPin,
  onDiscard,
  onTags,
  onUpload,
  onFocus,
  onActivity,
  onTemplate,
  onDuplicate,
  onCopy,
  onConvert,
  onExport,
  onPrint,
  onDelete,
}: {
  readonly open: boolean;
  readonly messages: Messages;
  readonly pinned: boolean;
  readonly onClose: () => void;
  readonly onAddSubtask: () => void;
  readonly onLinkParent: () => void;
  readonly onPin: () => void;
  readonly onDiscard: () => void;
  readonly onTags: () => void;
  readonly onUpload: () => void;
  readonly onFocus: () => void;
  readonly onActivity: () => void;
  readonly onTemplate: () => void;
  readonly onDuplicate: () => void;
  readonly onCopy: () => void;
  readonly onConvert: () => void;
  readonly onExport: () => void;
  readonly onPrint: () => void;
  readonly onDelete: () => void;
}) {
  if (!open) {
    return null;
  }
  const items: readonly {
    readonly id: string;
    readonly label: string;
    readonly run: () => void;
    readonly danger?: boolean;
  }[] = [
    { id: 'sub', label: messages.addSubtask, run: onAddSubtask },
    { id: 'parent', label: messages.linkParent, run: onLinkParent },
    { id: 'pin', label: pinned ? messages.unpinTask : messages.pinTask, run: onPin },
    { id: 'discard', label: messages.discardTask, run: onDiscard },
    { id: 'tags', label: messages.tags, run: onTags },
    { id: 'file', label: messages.upload, run: onUpload },
    { id: 'focus', label: messages.focusOnTask, run: onFocus },
    { id: 'activity', label: messages.taskActivity, run: onActivity },
    { id: 'template', label: messages.saveTemplate, run: onTemplate },
    { id: 'copy', label: messages.duplicate, run: onDuplicate },
    { id: 'link', label: messages.copyLink, run: onCopy },
    { id: 'note', label: messages.convertNote, run: onConvert },
    { id: 'export', label: messages.exportTask, run: onExport },
    { id: 'print', label: messages.printTask, run: onPrint },
  ];
  return (
    <div className="popover popover-menu detail-menu" role="menu" aria-label={messages.moreActions}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="popover-row"
          role="menuitem"
          onClick={() => {
            item.run();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
      <hr />
      <button
        type="button"
        className="popover-row is-danger"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {messages.batchDelete}
      </button>
    </div>
  );
}
