import { useRef, type KeyboardEvent } from 'react';
import './segmented.css';

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
}

/** A radiogroup whose arrow keys move the selection. Only the checked option is tabbable. */
export function Segmented({
  label,
  labelledBy,
  value,
  options,
  onChange,
  variant = 'bar',
  className,
}: {
  readonly label?: string;
  readonly labelledBy?: string;
  readonly value: string;
  readonly options: readonly SegmentOption[];
  readonly onChange: (value: string) => void;
  readonly variant?: 'bar' | 'pill';
  readonly className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((option) => option.value === value);
  const tabIndexFor = selected === -1 ? 0 : selected;

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = options.length - 1;
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = index >= last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = index <= 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    } else {
      return;
    }
    event.preventDefault();
    const option = options[next];
    if (option === undefined) {
      return;
    }
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      className={`ui-segmented${variant === 'pill' ? ' is-pill' : ''}${className === undefined ? '' : ` ${className}`}`}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabIndexFor ? 0 : -1}
            className={checked ? 'is-checked' : undefined}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
