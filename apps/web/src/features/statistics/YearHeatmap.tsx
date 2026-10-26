import { useEffect, useRef, useState } from 'react';
import { useChartTheme } from './chart-theme';
import { useStatisticsText } from './text';
import './year-heatmap.css';
export interface HeatCell {
  readonly date: string;
  readonly minutes?: number;
  readonly pomodoros?: number;
  readonly count?: number;
  readonly level: number;
  readonly scheduled?: number;
  readonly met?: number;
  readonly missing?: readonly string[];
}
export function YearHeatmap({
  cells,
  color,
  onSelect,
  mode = 'activity',
  today,
}: {
  readonly cells: readonly HeatCell[];
  readonly color?: string | undefined;
  readonly mode?: 'activity' | 'habits';
  readonly today?: string;
  readonly onSelect?: ((cell: HeatCell) => void) | undefined;
}) {
  const theme = useChartTheme();
  const { t, day, number, locale } = useStatisticsText();
  const wrap = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<HeatCell | null>(null);
  const [mobile, setMobile] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(640);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => {
      setMobile(media.matches);
    };
    update();
    media.addEventListener('change', update);
    const element = wrap.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);
  const fill = color ?? theme.accent;
  const habitMode = mode === 'habits';
  const visible = cells;
  const months = [...new Set(visible.map((cell) => cell.date.slice(0, 7)))];
  const dayLabelWidth = 20;
  const monthGap = 8;
  const monthColumns = months.map((month) => {
    const first = new Date(`${month}-01T12:00Z`);
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return Math.ceil((offset + days) / 7);
  });
  const totalColumns = monthColumns.reduce((sum, columns) => sum + columns, 0);
  const step = mobile
    ? Math.max(12, (availableWidth / 5 - 12) / 7)
    : Math.max(
        2,
        (availableWidth - dayLabelWidth - Math.max(0, months.length - 1) * monthGap) /
          Math.max(1, totalColumns),
      );
  const monthWidth = step * 7 + 12;
  const desktopMonthX = months.map(
    (_, index) =>
      dayLabelWidth +
      monthColumns.slice(0, index).reduce((sum, columns) => sum + columns, 0) * step +
      index * monthGap,
  );
  const indexed = visible.map((cell) => {
    const date = new Date(`${cell.date}T12:00Z`);
    const weekday = (date.getUTCDay() + 6) % 7;
    const monthPad = (new Date(`${cell.date.slice(0, 7)}-01T12:00Z`).getUTCDay() + 6) % 7;
    return {
      ...cell,
      row: weekday,
      desktopX:
        (desktopMonthX[months.indexOf(cell.date.slice(0, 7))] ?? dayLabelWidth) +
        Math.floor((date.getUTCDate() - 1 + monthPad) / 7) * step,
      x: months.indexOf(cell.date.slice(0, 7)) * monthWidth + weekday * step,
      y: 36 + Math.floor((date.getUTCDate() - 1 + monthPad) / 7) * step,
    };
  });
  const width = mobile ? months.length * monthWidth : availableWidth;
  const height = mobile ? 36 + step * 6 : 24 + step * 7;
  const latestDate = visible.at(-1)?.date;
  const currentMonthIndex = months.indexOf((today ?? latestDate ?? '').slice(0, 7));
  useEffect(() => {
    if (mobile && wrap.current) {
      wrap.current.scrollLeft = Math.max(0, (currentMonthIndex + 1) * monthWidth - availableWidth);
    }
  }, [mobile, availableWidth, currentMonthIndex, monthWidth]);
  const levels = [
    habitMode ? `color-mix(in srgb, ${fill} 7%, ${theme.surface2})` : theme.surface2,
    ...[25, 50, 75, 100].map(
      (percent) => `color-mix(in srgb, ${fill} ${String(percent)}%, ${theme.surface2})`,
    ),
  ];
  const isSpanish = !locale.startsWith('en');
  const describe = (cell: HeatCell) => {
    if (today && cell.date > today)
      return `${day(cell.date)} · ${isSpanish ? 'Próximamente' : 'Upcoming'}`;
    if (habitMode) {
      const label = new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${cell.date}T12:00Z`));
      return `${label.charAt(0).toUpperCase()}${label.slice(1).replace('.', '')} · ${number(cell.met ?? 0)} ${isSpanish ? 'de' : 'of'} ${number(cell.scheduled ?? 0)}`;
    }
    return `${day(cell.date)} · ${number(cell.minutes ?? cell.count ?? 0)} ${cell.minutes === undefined ? t('value') : t('minutes')}${cell.pomodoros === undefined ? '' : ` · ${number(cell.pomodoros)} ${t('pomodoros')}`}`;
  };
  const selection = selected ? visible.find((cell) => cell.date === selected.date) : undefined;
  const select = (cell: HeatCell) => {
    setSelected(cell);
    onSelect?.(cell);
  };
  return (
    <>
      <div
        ref={wrap}
        className={`year-heatmap stats-heatmap-wrap${habitMode ? ' is-habits' : ''}${mobile ? ' is-months' : ''}`}
      >
        <svg
          className="stats-heatmap"
          role="group"
          aria-label={t('annual')}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          style={{
            width: mobile ? width : '100%',
            minWidth: mobile ? width : 0,
            height: 'auto',
            aspectRatio: `${String(width)} / ${String(height)}`,
          }}
        >
          {mobile ? (
            months.map((month, index) => (
              <g key={month}>
                <text x={index * monthWidth} y={12} fill={theme.inkFaint} fontSize={11}>
                  {new Date(`${month}-01T12:00Z`).toLocaleDateString(locale, {
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </text>
                {(isSpanish
                  ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
                  : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                ).map((label, dayIndex) => (
                  <text
                    key={dayIndex}
                    x={index * monthWidth + dayIndex * step + 2}
                    y={28}
                    fill={theme.inkFaint}
                    fontSize={8}
                  >
                    {label}
                  </text>
                ))}
              </g>
            ))
          ) : (
            <>
              <g className="heatmap-weekday-labels" aria-hidden="true">
                {(isSpanish
                  ? ['L', 'M', 'M', 'J', 'V', 'S', 'D']
                  : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                ).map((label, index) => (
                  <text
                    key={index}
                    x={0}
                    y={22 + index * step + (step - 2) / 2}
                    dominantBaseline="central"
                    fill={theme.inkFaint}
                    fontSize={Math.min(11, step - 1)}
                  >
                    {label}
                  </text>
                ))}
              </g>
              {months.map((month, index) => (
                <text
                  className="heatmap-month-label"
                  key={month}
                  x={desktopMonthX[index]}
                  y={12}
                  fill={theme.inkFaint}
                  fontSize={11}
                >
                  {new Date(`${month}-01T12:00Z`).toLocaleDateString(locale, {
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </text>
              ))}
            </>
          )}
          {indexed.map((cell) => (
            <rect
              key={cell.date}
              x={mobile ? cell.x : cell.desktopX}
              y={mobile ? cell.y : 22 + cell.row * step}
              width={Math.max(2, step - (availableWidth < 440 ? 1 : 2))}
              height={Math.max(2, step - (availableWidth < 440 ? 1 : 2))}
              rx={availableWidth < 440 ? 0.8 : 2}
              fill={
                (today && cell.date > today) || (habitMode && cell.scheduled === 0)
                  ? theme.surface2
                  : (levels[cell.level] ?? theme.surface2)
              }
              data-date={cell.date}
              data-level={cell.level}
              data-future={today && cell.date > today ? true : undefined}
              data-state={
                habitMode
                  ? cell.scheduled === 0
                    ? 'inactive'
                    : cell.met === 0
                      ? 'missed'
                      : 'met'
                  : undefined
              }
              strokeDasharray={habitMode && cell.scheduled === 0 ? '2 2' : undefined}
              stroke={theme.border}
              role="button"
              tabIndex={cell.date === (selection?.date ?? visible.at(-1)?.date) ? 0 : -1}
              aria-label={`${describe(cell)}${habitMode && cell.scheduled === 0 ? (isSpanish ? ' · Sin hábitos programados' : ' · No habits scheduled') : ''}`}
              aria-current={cell.date === today ? 'date' : undefined}
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
                      ? mobile
                        ? 1
                        : 7
                      : event.key === 'ArrowLeft'
                        ? mobile
                          ? -1
                          : -7
                        : event.key === 'ArrowDown'
                          ? mobile
                            ? 7
                            : 1
                          : mobile
                            ? -7
                            : -1;
                  const target =
                    event.currentTarget.ownerSVGElement?.querySelectorAll('rect')[
                      visible.findIndex((row) => row.date === cell.date) + offset
                    ];
                  target?.focus();
                  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
      {selection ? (
        <p className="heatmap-selection" aria-live="polite">
          <strong>{describe(selection)}</strong>
          {habitMode ? (
            <span>
              {today && selection.date > today
                ? isSpanish
                  ? 'Próximamente'
                  : 'Upcoming'
                : selection.scheduled === 0
                  ? isSpanish
                    ? 'Sin hábitos programados'
                    : 'No habits scheduled'
                  : selection.missing?.length
                    ? `${isSpanish ? 'Faltaron' : 'Missing'}: ${selection.missing.join(', ')}`
                    : isSpanish
                      ? 'Todo cumplido'
                      : 'All done'}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="heatmap-accessible-table">
        <table>
          <caption>{t('annual')}</caption>
          <thead>
            <tr>
              <th>{t('date')}</th>
              <th>{t('value')}</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={cell.date}>
                <th scope="row">{day(cell.date)}</th>
                <td>
                  {describe(cell)}
                  {cell.missing?.length ? ` · ${cell.missing.join(', ')}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
