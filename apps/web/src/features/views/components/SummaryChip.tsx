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
import { TagChip } from '../../../components/ui';
import type { ChipSummary } from '../summarize';

const ICONS: Record<Exclude<ChipIcon, 'tag'>, LucideIcon> = {
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
  color = null,
  deleted = false,
}: {
  readonly icon: ChipIcon;
  readonly text: string;
  readonly color?: string | null;
  readonly deleted?: boolean;
}) {
  if (icon === 'tag' && !deleted) {
    return <TagChip label={text} color={color} />;
  }
  const Icon = icon === 'tag' ? Tag : ICONS[icon];
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
  readonly chips: readonly ChipSummary[];
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
          color={chip.color}
          deleted={chip.deleted === true}
        />
      ))}
      {extra > 0 ? <span className="filter-summary-chip">{more(extra)}</span> : null}
    </span>
  );
}
