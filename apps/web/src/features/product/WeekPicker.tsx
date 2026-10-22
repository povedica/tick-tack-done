import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui';
import { PeriodNavigator } from '../../components/period/PeriodNavigator';
import { shiftDayKey } from '../today/groups';
import { useWeeklyCopy } from './weekly-text';

function monday(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDayKey(date, -(weekday === 0 ? 6 : weekday - 1));
}
export function WeekPicker({
  value,
  today,
  onSelect,
}: {
  readonly value: string;
  readonly today: string;
  readonly available: readonly string[];
  readonly onSelect: (week: string) => void;
}) {
  const copy = useWeeklyCopy();
  const selected = value || monday(today);
  const date = new Date(`${selected}T12:00:00`);
  const label = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(copy.locale, { day: 'numeric', month: 'short' });
  return (
    <div className="week-navigation">
      <Button
        variant="ghost"
        aria-label={copy.previousWeek}
        onClick={() => {
          onSelect(shiftDayKey(selected, -7));
        }}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </Button>
      <PeriodNavigator
        className="week-range"
        label={`${copy.selectWeek}: ${date.toLocaleDateString(copy.locale, { day: 'numeric', month: 'long', year: 'numeric' })}`}
        title={`${label(selected)} – ${label(shiftDayKey(selected, 6))}`}
        date={date}
        onPick={(next) => {
          const key = `${String(next.getFullYear())}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
          onSelect(monday(key));
        }}
      />
      <Button
        variant="ghost"
        aria-label={copy.nextWeek}
        onClick={() => {
          onSelect(shiftDayKey(selected, 7));
        }}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}
