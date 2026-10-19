import {
  Bold,
  Calendar,
  Code,
  Heading,
  Highlighter,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import type { RefObject } from 'react';
import { applyFormat, type NoteFormat } from './format-note';

interface FormatLabels {
  readonly formatBar: string;
  readonly formatHeading: string;
  readonly formatBold: string;
  readonly formatHighlight: string;
  readonly formatCheck: string;
  readonly formatBullet: string;
  readonly formatOrdered: string;
  readonly formatItalic: string;
  readonly formatUnderline: string;
  readonly formatStrike: string;
  readonly formatRule: string;
  readonly formatDate: string;
  readonly formatLink: string;
  readonly formatCode: string;
  readonly formatQuote: string;
}

const ACTIONS: readonly {
  readonly kind: NoteFormat;
  readonly icon: LucideIcon;
  readonly label: keyof FormatLabels;
  readonly group: number;
}[] = [
  { kind: 'heading', icon: Heading, label: 'formatHeading', group: 0 },
  { kind: 'bold', icon: Bold, label: 'formatBold', group: 0 },
  { kind: 'highlight', icon: Highlighter, label: 'formatHighlight', group: 0 },
  { kind: 'check', icon: ListChecks, label: 'formatCheck', group: 1 },
  { kind: 'bullet', icon: List, label: 'formatBullet', group: 1 },
  { kind: 'ordered', icon: ListOrdered, label: 'formatOrdered', group: 1 },
  { kind: 'italic', icon: Italic, label: 'formatItalic', group: 2 },
  { kind: 'underline', icon: Underline, label: 'formatUnderline', group: 2 },
  { kind: 'strike', icon: Strikethrough, label: 'formatStrike', group: 2 },
  { kind: 'rule', icon: Minus, label: 'formatRule', group: 2 },
  { kind: 'date', icon: Calendar, label: 'formatDate', group: 3 },
  { kind: 'link', icon: Link, label: 'formatLink', group: 3 },
  { kind: 'code', icon: Code, label: 'formatCode', group: 3 },
  { kind: 'quote', icon: Quote, label: 'formatQuote', group: 3 },
];

export function FormatBar({
  field,
  labels,
  dateLabel,
  onCommit,
}: {
  readonly field: RefObject<HTMLTextAreaElement | null>;
  readonly labels: FormatLabels;
  readonly dateLabel: string;
  readonly onCommit: (value: string) => void;
}) {
  function apply(kind: NoteFormat): void {
    const area = field.current;
    if (area === null) {
      return;
    }
    const next = applyFormat(area.value, area.selectionStart, area.selectionEnd, kind, dateLabel);
    area.value = next.value;
    area.focus();
    area.setSelectionRange(next.start, next.end);
    area.style.height = 'auto';
    area.style.height = `${String(area.scrollHeight)}px`;
    onCommit(next.value);
  }

  let group = ACTIONS[0]?.group ?? 0;
  return (
    <div className="format-bar" role="toolbar" aria-label={labels.formatBar}>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const gap = action.group !== group;
        group = action.group;
        return (
          <span key={action.kind} className="format-slot">
            {gap ? <span className="format-sep" aria-hidden="true" /> : null}
            <button
              type="button"
              aria-label={labels[action.label]}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                apply(action.kind);
              }}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
