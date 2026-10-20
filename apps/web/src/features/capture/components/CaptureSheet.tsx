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
    <div className="sheet">
      <h1>{messages.captureTitle}</h1>
      <TaskComposer
        initialText={initialText}
        autoFocus
        onCaptured={onCreated}
        onDismiss={onClose}
      />
      <Button type="button" onClick={onClose}>
        {messages.cancel}
      </Button>
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
