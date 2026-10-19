import { Flag, Inbox, X } from 'lucide-react';
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
  listName,
  listLabel,
  listOpen,
  projects,
  projectId,
  closeLabel,
  messages,
  onComplete,
  onOpenDate,
  onOpenPriority,
  onToggleList,
  onMove,
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
  readonly listName: string;
  readonly listLabel: string;
  readonly listOpen: boolean;
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly projectId: string;
  readonly closeLabel: string;
  readonly messages: Messages;
  readonly onComplete: () => void;
  readonly onOpenDate: () => void;
  readonly onOpenPriority: () => void;
  readonly onToggleList: () => void;
  readonly onMove: (projectId: string) => void;
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
      <button
        type="button"
        className="list-chip"
        aria-expanded={listOpen}
        onClick={onToggleList}
      >
        <Inbox size={14} aria-hidden="true" />
        <span>{listName.length > 0 ? listName : listLabel}</span>
      </button>
      {listOpen ? (
        <ul className="popover popover-menu detail-list-menu" role="menu" aria-label={messages.listMove}>
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className="popover-row"
                role="menuitemradio"
                aria-checked={project.id === projectId}
                onClick={() => {
                  onMove(project.id);
                }}
              >
                {project.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="detail-save" role="status">
        {saving ? savingLabel : saved ? savedLabel : ''}
      </span>
      <PriorityCheck
        priority={priority}
        label={fill(completeLabel, title)}
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
      <button type="button" className="icon-button detail-close" aria-label={closeLabel} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}
