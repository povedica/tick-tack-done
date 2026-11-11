import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Popover } from '../../../components/Popover';
import { TagIcon } from '../../../components/TagIcon';
import { Button } from '../../../components/ui';
import { fill } from '../../../i18n';

export interface PickerChoice {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly sectionOrder: number;
  readonly detail?: string;
  readonly indent?: number;
  readonly rank?: number;
  readonly deleted?: boolean;
  readonly icon?: ReactNode;
  readonly tone?: 'tag';
  readonly color?: string | null;
}

export function MultiPicker({
  label,
  placeholder,
  searchLabel,
  doneLabel,
  clearLabel,
  selectedLabel,
  selectedOneLabel,
  removeLabel,
  choices,
  selected,
  invalid,
  describedBy,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly searchLabel: string;
  readonly doneLabel: string;
  readonly clearLabel: string;
  readonly selectedLabel: string;
  readonly selectedOneLabel: string;
  readonly removeLabel: string;
  readonly choices: readonly PickerChoice[];
  readonly selected: readonly string[];
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
  readonly onChange: (ids: readonly string[]) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const byId = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const groups = useMemo(
    () => groupChoices(choices, selected, needle),
    [choices, needle, selected],
  );
  const countText =
    selected.length === 1
      ? selectedOneLabel
      : selectedLabel.replace('{count}', String(selected.length));
  const names = selected
    .map((id) => byId.get(id)?.label)
    .filter((name): name is string => name !== undefined)
    .join(', ');

  function close(): void {
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  }

  function toggle(id: string): void {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <div className={invalid === true ? 'filter-multi-field is-invalid' : 'filter-multi-field'}>
      <div className="ui-input filter-multi-trigger" aria-invalid={invalid === true || undefined}>
        {selected.map((id) => {
          const choice = byId.get(id);
          const name = choice?.label ?? id;
          if (choice?.tone === 'tag' && choice.deleted !== true) {
            return (
              <button
                key={id}
                type="button"
                className="ui-tag"
                style={
                  choice.color === undefined || choice.color === null
                    ? undefined
                    : ({ '--tag': choice.color } as CSSProperties)
                }
                aria-label={fill(removeLabel, name)}
                onClick={() => {
                  onChange(selected.filter((item) => item !== id));
                }}
              >
                <TagIcon color={choice.color} />
                {name}
                <X size={12} aria-hidden="true" />
              </button>
            );
          }
          return (
            <button
              key={id}
              type="button"
              className={
                choice?.deleted === true ? 'filter-toggle-chip is-deleted' : 'filter-toggle-chip'
              }
              aria-label={fill(removeLabel, name)}
              onClick={() => {
                onChange(selected.filter((item) => item !== id));
              }}
            >
              <span>{name}</span>
              <X size={12} aria-hidden="true" />
            </button>
          );
        })}
        <button
          ref={trigger}
          type="button"
          className="filter-multi-open"
          aria-label={names.length > 0 ? `${label}: ${names}` : placeholder}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-describedby={describedBy}
          onClick={() => {
            setOpen(true);
          }}
        >
          {selected.length === 0 ? placeholder : null}
        </button>
      </div>
      <Popover
        open={open}
        label={label}
        anchor={trigger}
        width={320}
        mobileSheet
        mobileSheetMaxWidth={1023}
        initialFocus={search}
        className="filter-picker"
        sheetFooter={
          <div className="filter-picker-foot">
            <span>
              {countText}
              {' · '}
              <button
                type="button"
                className="filter-picker-clear"
                onClick={() => {
                  onChange([]);
                }}
              >
                {clearLabel}
              </button>
            </span>
            <Button type="button" variant="primary" size="sm" onClick={close}>
              {doneLabel}
            </Button>
          </div>
        }
        onClose={close}
      >
        <div className="filter-picker-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={search}
            className="ui-input"
            value={query}
            aria-label={searchLabel}
            placeholder={searchLabel}
            data-popover-initial
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
        <div
          className="filter-picker-list"
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
        >
          {groups.map((group) => (
            <section key={group.order === -1 ? 'lead' : group.title}>
              {group.title.length > 0 ? <h3>{group.title}</h3> : null}
              {group.choices.map((choice) => {
                const on = selected.includes(choice.id);
                return (
                  <label
                    key={choice.id}
                    className="filter-picker-row"
                    role="option"
                    aria-selected={on}
                    style={
                      choice.indent === undefined
                        ? undefined
                        : { paddingInlineStart: `${String(12 + choice.indent * 16)}px` }
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        toggle(choice.id);
                      }}
                    />
                    {choice.icon}
                    <span className={choice.deleted === true ? 'is-deleted' : undefined}>
                      {choice.label}
                    </span>
                    {choice.detail === undefined ? null : <small>{choice.detail}</small>}
                  </label>
                );
              })}
            </section>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function groupChoices(
  choices: readonly PickerChoice[],
  selected: readonly string[],
  needle: string,
): { title: string; order: number; choices: PickerChoice[] }[] {
  const shown =
    needle.length === 0
      ? [...choices]
      : choices.filter((choice) => choice.label.toLocaleLowerCase().includes(needle));
  const groups = new Map<string, { title: string; order: number; choices: PickerChoice[] }>();
  for (const choice of shown) {
    const key = `${String(choice.sectionOrder)}:${choice.section}`;
    const group = groups.get(key) ?? {
      title: choice.section,
      order: choice.sectionOrder,
      choices: [],
    };
    group.choices.push(choice);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
    .map((group) => ({
      ...group,
      choices: group.choices.sort((left, right) => {
        const leftOn = selected.includes(left.id) ? 0 : 1;
        const rightOn = selected.includes(right.id) ? 0 : 1;
        return (
          leftOn - rightOn ||
          (left.rank ?? 0) - (right.rank ?? 0) ||
          left.label.localeCompare(right.label)
        );
      }),
    }));
}
