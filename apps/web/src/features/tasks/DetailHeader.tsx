import { Flag, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router';
import { fill, type Messages } from '../../i18n';

export function DetailHeader({
  priority,
  taskId,

  saving,
  saved,
  savedLabel,
  savingLabel,

  priorityLabel,
  closeLabel,
  messages,

  onOpenPriority,
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
  readonly messages: Messages;
  readonly onComplete: () => void;
  readonly onOpenDate: () => void;
  readonly onOpenPriority: () => void;
  readonly onClose: () => void;
}) {
  const priorityName =
    priority === 'high'
      ? messages.priorityHigh
      : priority === 'medium'
        ? messages.priorityMedium
        : priority === 'low'
          ? messages.priorityLow
          : messages.priorityNone;
  return (
    <header className="detail-head">
      <span className="detail-save" role="status">
        {saving ? savingLabel : saved ? savedLabel : ''}
      </span>
      <span className="detail-head-spacer" />
      <Link
        className="icon-button detail-assistant"
        to={`/ticky?task=${encodeURIComponent(taskId)}`}
        aria-label={messages.tickyHelpTask}
        title={messages.tickyHelpTask}
      >
        <Sparkles size={18} aria-hidden="true" />
      </Link>
      <button
        type="button"
        className="icon-button"
        aria-label={fill(messages.priorityNamed, priorityName)}
        title={fill(messages.priorityNamed, priorityName)}
        onClick={onOpenPriority}
      >
        <Flag
          size={18}
          color={`var(--prio-${priority})`}
          fill={priority === 'none' ? 'none' : `var(--prio-${priority})`}
          aria-hidden="true"
        />
      </button>
      <span className="sr-only">{priorityLabel}</span>
      <button
        type="button"
        className="icon-button detail-close"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}
