import { displayTitle } from './displayTitle';
import { Flag, X } from 'lucide-react';
import { PriorityCheck } from '../../components/PriorityCheck';
import { fill, type Messages } from '../../i18n';

export function DetailHeader({
  title,
  priority,
  completed,
  dueText,
  dueTone,
  saving,
  saved,
  savedLabel,
  savingLabel,
  completeLabel,
  dateLabel,
  priorityLabel,
  closeLabel,
  messages,
  onComplete,
  onOpenDate,
  onOpenPriority,
  onClose,
}: {
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
      <PriorityCheck
        priority={priority}
        label={fill(completeLabel, displayTitle(title))}
        checked={completed}
        onChange={onComplete}
      />
      <button
        type="button"
        className={`due-chip is-${dueTone}`}
        aria-label={dateLabel}
        onClick={onOpenDate}
      >
        {dueText}
      </button>
      <span className="detail-head-spacer" />
      <button
        type="button"
        className="icon-button"
        aria-label={fill(messages.priorityNamed, priorityName)}
        title={fill(messages.priorityNamed, priorityName)}
        onClick={onOpenPriority}
      >
        <Flag size={18} color={`var(--prio-${priority})`} aria-hidden="true" />
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
