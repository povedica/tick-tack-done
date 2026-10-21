import type { ChangeEvent } from 'react';

export function PriorityCheck({
  priority,
  label,
  checked,
  disabled,
  onChange,
}: {
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly label: string;
  readonly checked?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={`task-check-hit prio-${priority}`}>
      <input
        type="checkbox"
        className="task-check"
        aria-label={label}
        disabled={disabled}
        onChange={onChange}
        {...(checked === undefined ? {} : { checked })}
      />
      <svg className="task-check-svg" viewBox="0 0 17 17" width="17" height="17" aria-hidden="true">
        <rect x="1.2" y="1.2" width="14.6" height="14.6" rx="4" />
        <path className="task-check-mark" d="M4.2 8.6 L7.2 11.5 L12.8 5.4" />
      </svg>
    </label>
  );
}
