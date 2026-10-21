import { fill, type Messages } from '../../../i18n';
import type { CaptureDraft, CaptureWarningNotice } from '../notice';
import { QuickAddPopover } from './QuickAddPopover';

interface CreatedCapture {
  readonly title: string;
  readonly warnings: readonly CaptureWarningNotice[];
}
export function CaptureSheet({
  initialText,
  initialDraft,
  onClose,
  onCreated,
}: {
  readonly initialText: string;
  readonly initialDraft?: CaptureDraft | undefined;
  readonly onClose: () => void;
  readonly onCreated: (created: CreatedCapture) => void;
}) {
  return (
    <QuickAddPopover
      initialText={initialText}
      initialDraft={initialDraft}
      onClose={onClose}
      onCreated={onCreated}
    />
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
