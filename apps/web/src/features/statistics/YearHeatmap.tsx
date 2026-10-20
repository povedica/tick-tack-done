import { useChartTheme } from './chart-theme';

export interface HeatCell {
  readonly date: string;
  readonly minutes?: number;
  readonly pomodoros?: number;
  readonly count?: number;
  readonly level: number;
}

export function YearHeatmap({
  cells,
  color,
  onSelect,
}: {
  readonly cells: readonly HeatCell[];
  readonly color?: string;
  readonly onSelect?: (cell: HeatCell) => void;
}) {
  const theme = useChartTheme();
  const fill = color ?? theme.accent;
  const byDate = new Map(cells.map((cell) => [cell.date, cell]));
  const first = cells[0]?.date;
  if (first === undefined) {
    return <p className="stats-empty">Sin datos de heatmap.</p>;
  }
  const year = Number(first.slice(0, 4));
  const start = new Date(Date.UTC(year, 0, 1));
  const startPad = (start.getUTCDay() + 6) % 7; // Monday=0
  const weeks: HeatCell[][] = [];
  let week: HeatCell[] = [];
  for (let i = 0; i < startPad; i += 1) {
    week.push({ date: '', level: -1 });
  }
  for (let day = 0; day < 366; day += 1) {
    const date = new Date(Date.UTC(year, 0, 1 + day));
    if (date.getUTCFullYear() !== year) {
      break;
    }
    const key = date.toISOString().slice(0, 10);
    week.push(byDate.get(key) ?? { date: key, level: 0, minutes: 0, pomodoros: 0 });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    weeks.push(week);
  }
  const levels = [
    theme.surface2,
    opacity(fill, 0.25),
    opacity(fill, 0.5),
    opacity(fill, 0.75),
    fill,
  ];

  return (
    <div className="stats-heatmap-wrap">
      <svg
        className="stats-heatmap"
        role="img"
        aria-label="Rejilla anual de intensidad"
        viewBox={`0 0 ${String(weeks.length * 13)} 91`}
      >
        {weeks.map((column, weekIndex) =>
          column.map((cell, dayIndex) => {
            if (cell.level < 0 || cell.date.length === 0) {
              return null;
            }
            const title = `${cell.date} · ${String(cell.minutes ?? cell.count ?? 0)}`;
            return (
              <rect
                key={cell.date}
                x={weekIndex * 13}
                y={dayIndex * 13}
                width={10}
                height={10}
                rx={2}
                fill={levels[cell.level] ?? theme.surface2}
                stroke={cell.level === 0 ? theme.border : 'transparent'}
                onClick={() => onSelect?.(cell)}
              >
                <title>{title}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <p className="stats-heatmap-legend">
        Menos{' '}
        {levels.map((level, index) => (
          <span key={level} style={{ background: level }} data-level={index} />
        ))}{' '}
        Más
      </p>
    </div>
  );
}

function opacity(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
    return hex;
  }
  const d1 = hex[1] ?? '0';
  const d2 = hex[2] ?? '0';
  const d3 = hex[3] ?? '0';
  const full = hex.length === 4 ? `#${d1}${d1}${d2}${d2}${d3}${d3}` : hex;
  const r = Number.parseInt(full.slice(1, 3), 16);
  const g = Number.parseInt(full.slice(3, 5), 16);
  const bl = Number.parseInt(full.slice(5, 7), 16);
  return `rgba(${String(r)},${String(g)},${String(bl)},${String(alpha)})`;
}
