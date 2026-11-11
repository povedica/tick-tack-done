import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from '../../../components/Popover';

export interface FieldOption {
  readonly value: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

export function FieldPicker({
  id,
  label,
  sheetTitle,
  value,
  options,
  open,
  onOpen,
  onClose,
  onChange,
}: {
  readonly id?: string;
  readonly label: string;
  readonly sheetTitle: string;
  readonly value: string;
  readonly options: readonly FieldOption[];
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onChange: (value: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typed = useRef('');
  const [active, setActive] = useState(0);
  const current = options.find((option) => option.value === value) ?? options[0];
  const CurrentIcon = current?.icon;

  useEffect(() => {
    if (!open) {
      return;
    }
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    setActive(index);
    const timer = window.setTimeout(() => {
      optionRefs.current[index]?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, options, value]);

  function close(): void {
    onClose();
    trigger.current?.focus();
  }

  function choose(next: string): void {
    onChange(next);
    close();
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>): void {
    const last = options.length - 1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        event.key === 'ArrowDown'
          ? active >= last
            ? 0
            : active + 1
          : active <= 0
            ? last
            : active - 1;
      setActive(next);
      optionRefs.current[next]?.focus();
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : last;
      setActive(next);
      optionRefs.current[next]?.focus();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option !== undefined) {
        choose(option.value);
      }
      return;
    }
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    event.preventDefault();
    typed.current = `${typed.current}${event.key}`.toLocaleLowerCase();
    const found = options.findIndex((option) =>
      option.label.toLocaleLowerCase().startsWith(typed.current),
    );
    if (found >= 0) {
      setActive(found);
      optionRefs.current[found]?.focus();
    }
    window.setTimeout(() => {
      typed.current = '';
    }, 500);
  }

  return (
    <>
      <button
        id={id}
        ref={trigger}
        type="button"
        className="ui-input filter-field-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onOpen}
      >
        {CurrentIcon === undefined ? null : <CurrentIcon size={16} aria-hidden="true" />}
        <span>{current?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        label={label}
        anchor={trigger}
        width={240}
        mobileSheet
        mobileSheetMaxWidth={1023}
        sheetHeader={<strong>{sheetTitle}</strong>}
        onClose={close}
        className="filter-field-popover"
      >
        <div
          role="listbox"
          aria-label={label}
          className="filter-field-list"
          data-popover-initial
          tabIndex={-1}
          onKeyDown={onKey}
        >
          {options.map((option, index) => {
            const Icon = option.icon;
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                className={index === active ? 'is-active' : undefined}
                onMouseEnter={() => {
                  setActive(index);
                }}
                onClick={() => {
                  choose(option.value);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{option.label}</span>
                {selected ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
