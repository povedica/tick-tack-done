import { Sparkles, X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import type { Messages } from '../../i18n';
import { useTickyAvailable } from '../ticky/useTickyAvailable';

export function DetailHeader({
  taskId,

  saving,
  saved,
  savedLabel,
  savingLabel,

  closeLabel,
  closeRef,
  assignee,
  messages,

  onClose,
}: {
  readonly taskId: string;
  readonly title: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly completed: boolean;
  readonly dueText: string;
  readonly dueTone: 'empty' | 'overdue' | 'accent' | 'muted';
  readonly saving: boolean;
  readonly saved: boolean;
  readonly savedLabel: string;
  readonly savingLabel: string;
  readonly completeLabel: string;
  readonly dateLabel: string;
  readonly priorityLabel: string;
  readonly closeLabel: string;
  readonly closeRef?: Ref<HTMLButtonElement>;
  readonly assignee?: ReactNode;
  readonly messages: Messages;
  readonly onComplete: () => void;
  readonly onOpenDate: () => void;
  readonly onOpenPriority: () => void;
  readonly onClose: () => void;
}) {
  const ticky = useTickyAvailable();
  return (
    <header className="detail-head">
      <span className="detail-save" role="status">
        {saving ? savingLabel : saved ? savedLabel : ''}
      </span>
      <span className="detail-head-spacer" />
      {assignee}
      {ticky.available ? (
        <Link
          className="icon-button detail-assistant"
          to={`/ticky?task=${encodeURIComponent(taskId)}`}
          aria-label={messages.tickyHelpTask}
          title={messages.tickyHelpTask}
        >
          <Sparkles size={18} aria-hidden="true" />
        </Link>
      ) : null}
      <button
        ref={closeRef}
        type="button"
        className="icon-button detail-close"
        data-popover-initial=""
        aria-label={closeLabel}
        onClick={onClose}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}
