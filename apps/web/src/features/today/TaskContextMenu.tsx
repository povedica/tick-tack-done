import type { Messages } from '../../i18n';
import type { TodayTask } from './groups';

export function TaskContextMenu({
  x,
  y,
  messages,
  projects,
  onClose,
  onDate,
  onPriority,
  onSubtask,
  onPin,
  onMove,
  onTags,
  onFocus,
  onDuplicate,
  onCopy,
  onConvert,
  onWontDo,
  onDelete,
}: {
  readonly x: number;
  readonly y: number;
  readonly messages: Messages;
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly onClose: () => void;
  readonly onDate: (preset: 'today' | 'tomorrow' | 'week' | 'none') => void;
  readonly onPriority: (priority: TodayTask['priority']) => void;
  readonly onSubtask: () => void;
  readonly onPin: () => void;
  readonly onMove: (projectId: string) => void;
  readonly onTags: () => void;
  readonly onFocus: () => void;
  readonly onDuplicate: () => void;
  readonly onCopy: () => void;
  readonly onConvert: () => void;
  readonly onWontDo: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <div
      className="popover popover-menu task-context"
      role="menu"
      style={{ left: x, top: y }}
      aria-label={messages.moreActions}
    >
      <p className="popover-label">{messages.dateSet}</p>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onDate('today');
          onClose();
        }}
      >
        {messages.dateToday}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onDate('tomorrow');
          onClose();
        }}
      >
        {messages.dateTomorrow}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onDate('week');
          onClose();
        }}
      >
        {messages.dateIn7}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onDate('none');
          onClose();
        }}
      >
        {messages.noDate}
      </button>
      <p className="popover-label">{messages.prioritySet}</p>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onPriority('high');
          onClose();
        }}
      >
        {messages.priorityHigh}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onPriority('medium');
          onClose();
        }}
      >
        {messages.priorityMedium}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onPriority('low');
          onClose();
        }}
      >
        {messages.priorityLow}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onPriority('none');
          onClose();
        }}
      >
        {messages.priorityNone}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onSubtask();
          onClose();
        }}
      >
        {messages.addSubtask}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onPin();
          onClose();
        }}
      >
        {messages.pinTask}
      </button>
      <p className="popover-label">{messages.moveToList}</p>
      {projects.slice(0, 6).map((project) => (
        <button
          key={project.id}
          type="button"
          className="popover-row"
          onClick={() => {
            onMove(project.id);
            onClose();
          }}
        >
          {project.name}
        </button>
      ))}
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onTags();
          onClose();
        }}
      >
        {messages.tags}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onFocus();
          onClose();
        }}
      >
        {messages.focusOnTask}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        {messages.duplicate}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        {messages.copyLink}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onConvert();
          onClose();
        }}
      >
        {messages.convertNote}
      </button>
      <button
        type="button"
        className="popover-row"
        onClick={() => {
          onWontDo();
          onClose();
        }}
      >
        {messages.wontDoTask}
      </button>
      <button
        type="button"
        className="popover-row is-danger"
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
