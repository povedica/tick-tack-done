import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui';
import { useHabitCopy } from '../copy';

export function HabitActions({
  label,
  paused,
  busy,
  onEdit,
  onPause,
  onDelete,
}: {
  readonly label: string;
  readonly paused: boolean;
  readonly busy: boolean;
  readonly onEdit: () => void;
  readonly onPause: () => void;
  readonly onDelete: () => void;
}) {
  const t = useHabitCopy();
  const PauseIcon = paused ? Play : Pause;
  return (
    <div className="segmented habit-action-group" role="group" aria-label={label}>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onEdit}>
        <Pencil size={14} aria-hidden="true" />
        {t.edit}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onPause}>
        <PauseIcon size={14} aria-hidden="true" />
        {paused ? t.resume : t.pause}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="habit-delete-action"
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 size={14} aria-hidden="true" />
        {t.remove}
      </Button>
    </div>
  );
}
