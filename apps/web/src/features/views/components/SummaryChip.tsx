import {
  Calendar,
  CircleCheck,
  Flag,
  Folder,
  List,
  Tag,
  Type,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ChipIcon } from '../summarize';

const ICONS: Record<ChipIcon, LucideIcon> = {
  tag: Tag,
  calendar: Calendar,
  flag: Flag,
  list: List,
  folder: Folder,
  check: CircleCheck,
  user: UserRound,
  type: Type,
};

export function SummaryChip({
  icon,
  text,
  deleted = false,
}: {
  readonly icon: ChipIcon;
  readonly text: string;
  readonly deleted?: boolean;
}) {
  const Icon = ICONS[icon];
  return (
    <span className={deleted ? 'filter-summary-chip is-deleted' : 'filter-summary-chip'}>
      <Icon size={12} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

export function SummaryChips({
  chips,
  max,
  more,
}: {
  readonly chips: readonly { icon: ChipIcon; text: string; deleted?: boolean }[];
  readonly max: number;
  readonly more: (count: number) => string;
}) {
  const shown = chips.slice(0, max);
  const extra = chips.length - shown.length;
  if (shown.length === 0) {
    return null;
  }
  return (
    <span className="filter-chips">
      {shown.map((chip, index) => (
        <SummaryChip
          key={`${chip.icon}-${String(index)}`}
          icon={chip.icon}
          text={chip.text}
          deleted={chip.deleted === true}
        />
      ))}
      {extra > 0 ? <span className="filter-summary-chip">{more(extra)}</span> : null}
    </span>
  );
}
