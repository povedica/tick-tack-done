import { useEffect, useRef, useState } from 'react';
import { useChartTheme } from './chart-theme';
import { useStatisticsText } from './text';
import { DataTable } from './DataTable';
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
  const { t, day, number, locale } = useStatisticsText();
  const wrap = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<HeatCell | null>(null);
  const fill = color ?? theme.accent;
  const year = Number(cells[0]?.date.slice(0, 4) ?? new Date().getFullYear());
  const pad = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;
  const indexed = cells.map((cell, index) => ({
    ...cell,
    column: Math.floor((index + pad) / 7),
    row: (index + pad) % 7,
  }));
  const levels = [
    theme.surface2,
    ...[25, 50, 75, 100].map(
      (percent) => `color-mix(in srgb, ${fill} ${String(percent)}%, transparent)`,
    ),
  ];
  const values = cells
    .map((cell) => cell.minutes ?? cell.count ?? 0)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75]
    .map((q) => number(values[Math.min(values.length - 1, Math.floor(values.length * q))] ?? 0))
    .join(' / ');
  const describe = (cell: HeatCell) =>
    `${day(cell.date)} · ${number(cell.minutes ?? cell.count ?? 0)} ${cell.minutes === undefined ? t('value') : t('minutes')}${cell.pomodoros === undefined ? '' : ` · ${number(cell.pomodoros)} ${t('pomodoros')}`}`;
  useEffect(() => {
    if (wrap.current) {
      const now = new Date();
      const current =
        now.getFullYear() === year
          ? Math.floor((Date.now() - Date.UTC(year, 0, 1)) / 86400000)
          : 364;
      wrap.current.scrollLeft = Math.max(
        0,
        Math.floor((current + pad) / 7) * 13 - wrap.current.clientWidth + 60,
      );
    }
  }, [year, pad]);
  const select = (cell: HeatCell) => {
    setSelected(cell);
    onSelect?.(cell);
  };
  return (
    <>
      <div ref={wrap} className="stats-heatmap-wrap">
        <svg className="stats-heatmap" role="group" aria-label={t('annual')} viewBox="0 0 702 112">
          {Array.from({ length: 12 }, (_, month) => {
            const date = new Date(Date.UTC(year, month, 1));
            const index = Math.floor((date.getTime() - Date.UTC(year, 0, 1)) / 86400000);
            return (
              <text
                key={month}
                x={Math.floor((index + pad) / 7) * 13}
                y={12}
                fill={theme.inkFaint}
                fontSize="var(--fs-xs)"
              >
                {date.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' })}
              </text>
            );
          })}
          {indexed.map((cell) => (
            <rect
              key={cell.date}
              x={cell.column * 13}
              y={22 + cell.row * 13}
              width={10}
              height={10}
              rx={2}
              fill={levels[cell.level] ?? theme.surface2}
              stroke={theme.border}
              role="button"
              tabIndex={0}
              aria-label={describe(cell)}
              onClick={() => {
                select(cell);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  select(cell);
                }
                if (
                  event.key === 'ArrowRight' ||
                  event.key === 'ArrowLeft' ||
                  event.key === 'ArrowDown' ||
                  event.key === 'ArrowUp'
                ) {
                  event.preventDefault();
                  const offset =
                    event.key === 'ArrowRight'
                      ? 7
                      : event.key === 'ArrowLeft'
                        ? -7
                        : event.key === 'ArrowDown'
                          ? 1
                          : -1;
                  const target =
                    event.currentTarget.ownerSVGElement?.querySelectorAll('rect')[
                      cells.findIndex((row) => row.date === cell.date) + offset
                    ];
                  target?.focus();
                }
              }}
            >
              <title>{describe(cell)}</title>
            </rect>
          ))}
        </svg>
      </div>
      <p className="stats-heatmap-legend">
        {t('less')}
        {levels.map((background, index) => (
          <span key={index} style={{ background }} />
        ))}
        {t('more')}
      </p>
      <p className="stats-caption">
        {t('quartiles')}: {thresholds}
      </p>
      {selected ? <p aria-live="polite">{describe(selected)}</p> : null}
      <DataTable
        caption={t('annual')}
        headers={[t('date'), t('value'), t('pomodoros')]}
        rows={cells.map((cell) => [
          day(cell.date),
          number(cell.minutes ?? cell.count ?? 0),
          number(cell.pomodoros ?? 0),
        ])}
      />
    </>
  );
}
