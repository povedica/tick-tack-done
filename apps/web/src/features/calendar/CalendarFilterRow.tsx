import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function CalendarFilterRow({
  label,
  accessibleLabel = label,
  icon,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly accessibleLabel?: string;
  readonly icon: ReactNode;
  readonly value: string;
  readonly options: readonly { value: string; label: string }[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="calendar-filter-row">
      {icon}
      <span className="calendar-filter-row-copy">
        <span>{label}</span>
        <span className="calendar-filter-row-value">
          {options.find((option) => option.value === value)?.label ?? options[0]?.label}
        </span>
      </span>
      <ChevronDown aria-hidden="true" />
      <select
        aria-label={accessibleLabel}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
