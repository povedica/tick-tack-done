import {
  Ban,
  ClipboardCopy,
  Copy,
  Download,
  Link2,
  ListTree,
  Paperclip,
  Pin,
  Printer,
  Repeat,
  ScrollText,
  StickyNote,
  Tags,
  Timer,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover } from '../../components/Popover';
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
  uploadDisabled = false,
  uploadDisabledReason,
  onFocus,
  onActivity,
  onTemplate,
  onDuplicate,
  onCopy,
  onConvert,
  onExport,
  onPrint,
  onWontDo,
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
  readonly uploadDisabled?: boolean;
  readonly uploadDisabledReason?: string;
  readonly onFocus: () => void;
  readonly onActivity: () => void;
  readonly onTemplate: () => void;
  readonly onDuplicate: () => void;
  readonly onCopy: () => void;
  readonly onConvert: () => void;
  readonly onExport: () => void;
  readonly onPrint: () => void;
  readonly onWontDo: () => void;
  readonly onDelete: () => void;
}) {
  const groups: readonly (readonly MenuItem[])[] = [
    [
      {
        id: 'pin',
        label: pinned ? messages.unpinTask : messages.pinTask,
        icon: <Pin size={16} aria-hidden="true" />,
        run: onPin,
      },
      {
        id: 'sub',
        label: messages.addSubtask,
        icon: <ListTree size={16} aria-hidden="true" />,
        run: onAddSubtask,
      },
      {
        id: 'parent',
        label: messages.linkParent,
        icon: <Link2 size={16} aria-hidden="true" />,
        run: onLinkParent,
      },
    ],
    [
      {
        id: 'tags',
        label: messages.tags,
        icon: <Tags size={16} aria-hidden="true" />,
        run: onTags,
      },
      {
        id: 'file',
        label: messages.upload,
        icon: <Paperclip size={16} aria-hidden="true" />,
        run: onUpload,
        disabled: uploadDisabled,
        ...(uploadDisabled ? { description: uploadDisabledReason ?? messages.driveRequired } : {}),
      },
      {
        id: 'focus',
        label: messages.focusOnTask,
        icon: <Timer size={16} aria-hidden="true" />,
        run: onFocus,
      },
    ],
    [
      {
        id: 'copy',
        label: messages.duplicate,
        icon: <Copy size={16} aria-hidden="true" />,
        run: onDuplicate,
      },
      {
        id: 'link',
        label: messages.copyLink,
        icon: <ClipboardCopy size={16} aria-hidden="true" />,
        run: onCopy,
      },
      {
        id: 'template',
        label: messages.saveTemplate,
        icon: <StickyNote size={16} aria-hidden="true" />,
        run: onTemplate,
      },
      {
        id: 'note',
        label: messages.convertNote,
        icon: <Repeat size={16} aria-hidden="true" />,
        run: onConvert,
      },
      {
        id: 'export',
        label: messages.exportTask,
        icon: <Download size={16} aria-hidden="true" />,
        run: onExport,
      },
      {
        id: 'print',
        label: messages.printTask,
        icon: <Printer size={16} aria-hidden="true" />,
        run: onPrint,
      },
      {
        id: 'activity',
        label: messages.taskActivity,
        icon: <ScrollText size={16} aria-hidden="true" />,
        run: onActivity,
      },
      {
        id: 'discard',
        label: messages.discardTask,
        icon: <Repeat size={16} aria-hidden="true" />,
        run: onDiscard,
      },
    ],
  ];
  return (
    <Popover
      open={open}
      label={messages.moreActions}
      onClose={onClose}
      className="popover popover-menu detail-menu"
    >
      {groups.map((group) => (
        <div key={group[0]?.id} className="menu-group">
          {group.map((item) => (
            <button
              key={item.id}
              type="button"
              className="popover-row"
              role="menuitem"
              disabled={item.disabled}
              title={item.description}
              aria-describedby={item.description ? 'detail-menu-upload-reason' : undefined}
              onClick={() => {
                item.run();
                onClose();
              }}
            >
              {item.icon}
              <span>
                {item.label}
                {item.description ? (
                  <small id="detail-menu-upload-reason">{item.description}</small>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ))}
      <div className="menu-group">
        <button
          type="button"
          className="popover-row"
          role="menuitem"
          onClick={() => {
            onWontDo();
            onClose();
          }}
        >
          <Ban size={16} aria-hidden="true" />
          <span>{messages.wontDoTask}</span>
        </button>
        <button
          type="button"
          className="popover-row is-danger"
          role="menuitem"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          <span>{messages.batchDelete}</span>
        </button>
      </div>
    </Popover>
  );
}

interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly run: () => void;
  readonly disabled?: boolean;
  readonly description?: string;
}
