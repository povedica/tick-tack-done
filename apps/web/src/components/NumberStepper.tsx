import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from './ui';
import './number-stepper.css';

export function NumberStepper({
  value,
  min = 1,
  max,
  label,
  decreaseLabel = `− ${label}`,
  increaseLabel = `+ ${label}`,
  disabled = false,
  children,
  onChange,
}: {
  readonly value: number;
  readonly min?: number;
  readonly max: number;
  readonly label: string;
  readonly decreaseLabel?: string;
  readonly increaseLabel?: string;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="number-stepper" role="group" aria-label={label}>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        aria-label={decreaseLabel}
        disabled={disabled || value <= min}
        onClick={() => {
          onChange(Math.max(min, value - 1));
        }}
      >
        <Minus size={16} aria-hidden="true" />
      </Button>
      {children ?? (
        <input
          type="number"
          min={min}
          max={max}
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
          }}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        type="button"
        aria-label={increaseLabel}
        disabled={disabled || value >= max}
        onClick={() => {
          onChange(Math.min(max, value + 1));
        }}
      >
        <Plus size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
