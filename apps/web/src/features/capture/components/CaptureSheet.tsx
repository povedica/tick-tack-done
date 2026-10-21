import { fill, useMessages, type Messages } from '../../../i18n';
import type { CaptureWarningNotice } from '../notice';
import { TaskComposer } from '../../tasks/TaskComposer';
import { Button } from '../../../components/ui';

interface CreatedCapture {
  readonly title: string;
  readonly warnings: readonly CaptureWarningNotice[];
}
export function CaptureSheet({
  initialText,
  onClose,
  onCreated,
}: {
  readonly initialText: string;
  readonly onClose: () => void;
  readonly onCreated: (created: CreatedCapture) => void;
}) {
  const messages = useMessages();
  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-sheet-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="capture-card">
        <h1 id="capture-sheet-title">{messages.captureTitle}</h1>
        <TaskComposer
          initialText={initialText}
          autoFocus
          onCaptured={onCreated}
          onDismiss={onClose}
        />
        <div className="capture-card-footer">
          <Button type="button" onClick={onClose}>
            {messages.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function warningText(messages: Messages, warning: CaptureWarningNotice): string {
  const name = warning.name ?? '';
  switch (warning.code) {
    case 'list_not_found':
      return fill(messages.listNotFound, name);
    case 'list_created':
      return fill(messages.listCreated, name);
    case 'tag_not_found':
      return fill(messages.tagNotFound, name);
    case 'tag_created':
      return fill(messages.tagCreated, name);
    case 'reminder_without_date':
      return messages.reminderWithoutDate;
  }
}
