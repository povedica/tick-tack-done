import { Flag } from 'lucide-react';
import { PriorityCheck } from '../../components/PriorityCheck';
import { fill, type Messages } from '../../i18n';

export function DetailHeader({
  title,
  priority,
  completed,
  dueText,
  dueTone,
  saved,
  savedLabel,
  completeLabel,
  dateLabel,
  priorityLabel,
  messages,
  onComplete,
  onOpenDate,
  onOpenPriority,
}: {
  readonly title: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly completed: boolean;
  readonly dueText: string;
  readonly dueTone: 'empty' | 'overdue' | 'accent' | 'muted';
  readonly saved: boolean;
  readonly savedLabel: string;
  readonly completeLabel: string;
  readonly dateLabel: string;
  readonly priorityLabel: string;
  readonly messages: Messages;
  readonly onComplete: () => void;
  readonly onOpenDate: () => void;
  readonly onOpenPriority: () => void;
}) {
  return (
    <header className="detail-head">
      <PriorityCheck
        priority={priority}
        label={fill(completeLabel, title)}
        checked={completed}
        onChange={onComplete}
      />
      <span className="detail-sep" aria-hidden="true" />
      <button
        type="button"
        className={`due-chip is-${dueTone}`}
        aria-label={dateLabel}
        onClick={onOpenDate}
      >
        {dueText}
      </button>
      <span className="detail-head-spacer" />
      {saved ? (
        <span className="detail-saved" role="status">
          {savedLabel}
        </span>
      ) : null}
      <button
        type="button"
        className="icon-button"
        aria-label={priorityLabel}
        onClick={onOpenPriority}
      >
        <Flag size={18} color={`var(--prio-${priority})`} aria-hidden="true" />
      </button>
      <span className="sr-only">{messages.prioritySet}</span>
    </header>
  );
}
