import { useEffect, useRef, useState } from 'react';
import { Curve, Rectangle, Surface } from 'recharts';
import { useChartTheme } from './chart-theme';
import { useStatisticsText, type StatisticsTextKey } from './text';
import { DataTable } from './DataTable';
type Row = Readonly<Record<string, string | number | null>>;
interface Series {
  key: string;
  label: StatisticsTextKey;
  color: string;
  kind?: 'bar' | 'line' | 'area';
  axis?: string;
}
/** Recharts SVG primitives keep the full interaction/table contract without its chart-store bundle. */
export function MetricChart({
  data,
  series,
  caption,
  rate = false,
  x = 'date',
  stack = false,
}: {
  readonly data: readonly Row[];
  readonly series: readonly Series[];
  readonly caption: StatisticsTextKey;
  readonly rate?: boolean;
  readonly x?: string;
  readonly stack?: boolean;
}) {
  const { t, number, day } = useStatisticsText();
  const theme = useChartTheme();
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 260 });
  const [hidden, setHidden] = useState<string[]>([]);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  const rows: (Record<string, string | number | null> & { label: string })[] = data.map((row) => ({
    ...row,
    label: x === 'date' ? day(String(row[x])) : String(row[x]),
  }));
  const fields = series.filter((field) => !hidden.includes(field.key));
  const secondary = fields.some((field) => field.axis === 'pom');
  const left = 64,
    right = secondary ? 40 : 24,
    top = 20,
    bottom = size.height - 32;
  const width = Math.max(1, size.width - left - right);
  const height = bottom - top;
  const value = (row: Row, key: string) => (typeof row[key] === 'number' ? row[key] : 0);
  const values = rows.map((row) =>
    stack
      ? fields.reduce((sum, field) => sum + value(row, field.key), 0)
      : Math.max(
          0,
          ...fields.filter((field) => field.axis !== 'pom').map((field) => value(row, field.key)),
        ),
  );
  const max = rate ? 100 : Math.max(1, ...values);
  const pomMax = Math.max(
    1,
    ...rows.map((row) =>
      Math.max(
        0,
        ...fields.filter((field) => field.axis === 'pom').map((field) => value(row, field.key)),
      ),
    ),
  );
  const position = (index: number) => left + ((index + 0.5) * width) / Math.max(rows.length, 1);
  const y = (value: number, axis?: string) =>
    bottom - (value / (axis === 'pom' ? pomMax : max)) * height;
  const summary = `${t(caption)}: ${number(Math.min(0, ...values))}–${number(max)}`;
  const selected = active === null ? null : rows[active];
  const tickStep =
    caption === 'trend' || caption === 'overdue' ? Math.max(1, Math.ceil(max / 4)) : max / 4;
  const ticks = Array.from({ length: 5 }, (_, index) => index * tickStep).filter(
    (value) => value <= max,
  );
  const barFields = fields.filter((field) => !field.kind || field.kind === 'bar');
  return (
    <>
      <div
        ref={container}
        className="stats-chart"
        role="group"
        aria-label={summary}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setActive(null);
        }}
      >
        <Surface
          width={size.width}
          height={size.height}
          viewBox={{ x: 0, y: 0, width: size.width, height: size.height }}
          aria-label={summary}
        >
          <title>{summary}</title>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={size.width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={theme.border}
              />
              <text
                x={left - 6}
                y={y(tick) + 4}
                textAnchor="end"
                fill={theme.inkFaint}
                fontSize="var(--fs-xs)"
              >
                {number(tick)}
              </text>
            </g>
          ))}
          {rate ? (
            <g>
              <line
                x1={left}
                x2={size.width - right}
                y1={y(80)}
                y2={y(80)}
                stroke={theme.success}
                strokeDasharray="4 4"
              />
              <text x={left + 4} y={y(80) - 4} fill={theme.ink2} fontSize="var(--fs-xs)">
                80 %
              </text>
            </g>
          ) : null}
          {fields.map((field, fieldIndex) => {
            const cumulative = (row: Row) =>
              stack
                ? fields
                    .slice(0, fieldIndex)
                    .reduce((sum, previous) => sum + value(row, previous.key), 0)
                : 0;
            const points = rows.map((row, index) => ({
              x: position(index),
              y:
                row[field.key] === null
                  ? null
                  : y(value(row, field.key) + cumulative(row), field.axis),
            }));
            const opacity = active === null ? 1 : 0.45;
            if (field.kind === 'line')
              return (
                <g key={field.key}>
                  <Curve
                    points={points}
                    type="linear"
                    connectNulls={false}
                    fill="none"
                    stroke={field.color}
                    strokeWidth={2}
                  />
                  {points.map((point, index) =>
                    point.y === null ? null : (
                      <circle
                        key={index}
                        cx={point.x}
                        cy={point.y}
                        r={active === index ? 4 : 2}
                        fill={field.color}
                      />
                    ),
                  )}
                </g>
              );
            if (field.kind === 'area')
              return (
                <g key={field.key}>
                  <Curve
                    key={field.key}
                    points={points}
                    baseLine={
                      stack
                        ? rows.map((row, index) => ({ x: position(index), y: y(cumulative(row)) }))
                        : bottom
                    }
                    type="linear"
                    connectNulls={false}
                    fill={field.color}
                    fillOpacity={stack ? (fieldIndex === 0 ? 0.5 : 0.85) : 0.08}
                    stroke={field.color}
                    strokeWidth={2}
                  />
                  {points.map((point, index) =>
                    point.y === null ? null : (
                      <circle key={index} cx={point.x} cy={point.y} r={3} fill={field.color} />
                    ),
                  )}
                </g>
              );
            const barWidth =
              ((width / Math.max(rows.length, 1)) * 0.65) / Math.max(barFields.length, 1);
            const offset = barFields.indexOf(field);
            return (
              <g key={field.key}>
                {rows.map((row, index) => (
                  <Rectangle
                    key={index}
                    x={position(index) - (barWidth * barFields.length) / 2 + offset * barWidth}
                    y={y(value(row, field.key))}
                    width={Math.max(1, barWidth)}
                    height={bottom - y(value(row, field.key))}
                    radius={[3, 3, 0, 0]}
                    fill={field.color}
                    opacity={active === index ? 1 : opacity}
                  />
                ))}
              </g>
            );
          })}
          {rows.map((row, index) => (
            <g
              key={index}
              role="button"
              tabIndex={0}
              aria-label={`${row.label} · ${fields.map((field) => `${t(field.label)} ${number(value(row, field.key))}`).join(' · ')}`}
              onMouseEnter={() => {
                setActive(index);
              }}
              onMouseLeave={() => {
                setActive(null);
              }}
              onFocus={() => {
                setActive(index);
              }}
              onBlur={() => {
                setActive(null);
              }}
              onClick={() => {
                setActive(active === index ? null : index);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActive(active === index ? null : index);
                }
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  const target =
                    event.currentTarget.parentElement?.querySelectorAll<SVGGElement>(
                      '[role=button]',
                    )[(index + (event.key === 'ArrowRight' ? 1 : -1) + rows.length) % rows.length];
                  target?.focus();
                }
              }}
            >
              <rect
                x={position(index) - width / Math.max(rows.length, 1) / 2}
                y={top}
                width={width / Math.max(rows.length, 1)}
                height={height}
                fill="transparent"
              />
              {index % Math.max(1, Math.ceil(rows.length / (size.width < 500 ? 4 : 8))) === 0 ? (
                <text
                  x={position(index)}
                  y={bottom + 20}
                  textAnchor="middle"
                  fill={theme.inkFaint}
                  fontSize="var(--fs-xs)"
                >
                  {row.label}
                </text>
              ) : null}
            </g>
          ))}
          {secondary ? (
            <>
              <text
                x={size.width - 4}
                y={top}
                textAnchor="end"
                fill={theme.inkFaint}
                fontSize="var(--fs-xs)"
              >
                {number(pomMax)}
              </text>
              <text
                x={size.width - 4}
                y={bottom}
                textAnchor="end"
                fill={theme.inkFaint}
                fontSize="var(--fs-xs)"
              >
                0
              </text>
            </>
          ) : null}
        </Surface>
        {selected ? (
          <div className="stats-chart-tooltip" role="status">
            <strong>{selected.label}</strong>
            {fields.map((field) => (
              <p key={field.key}>
                {t(field.label)}:{' '}
                {selected[field.key] === null ? '—' : number(value(selected, field.key))}
              </p>
            ))}
            {rate && 'planned' in selected ? (
              <p>
                {number(value(selected, 'completed'))}/{number(value(selected, 'planned'))}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {series.length > 1 ? (
        <div className="stats-legend">
          {series.map((field) => (
            <button
              key={field.key}
              type="button"
              aria-pressed={!hidden.includes(field.key)}
              onClick={() => {
                setHidden(
                  hidden.includes(field.key)
                    ? hidden.filter((key) => key !== field.key)
                    : [...hidden, field.key],
                );
              }}
            >
              <span style={{ background: field.color }} />
              {t(field.label)}
            </button>
          ))}
        </div>
      ) : null}
      <DataTable
        caption={t(caption)}
        headers={[
          t(x === 'date' ? 'date' : 'hour'),
          ...series.map((field) => t(field.label)),
          ...(rate ? [t('completed'), t('planned')] : []),
        ]}
        rows={rows.map((row) => [
          row.label,
          ...series.map((field) =>
            typeof row[field.key] === 'number' ? number(Number(row[field.key])) : '—',
          ),
          ...(rate ? [number(Number(row.completed ?? 0)), number(Number(row.planned ?? 0))] : []),
        ])}
      />
    </>
  );
}
export function TrendChart({ data }: { readonly data: readonly Row[] }) {
  const theme = useChartTheme();
  return (
    <MetricChart
      data={data}
      caption="trend"
      series={[
        { key: 'completed', label: 'completed', color: theme.accent },
        { key: 'created', label: 'created', color: theme.ink2, kind: 'line' },
      ]}
    />
  );
}
export function RateChart({ data }: { readonly data: readonly Row[] }) {
  const theme = useChartTheme();
  return (
    <MetricChart
      data={data}
      caption="rate"
      rate
      series={[{ key: 'rate', label: 'rate', color: theme.success, kind: 'area' }]}
    />
  );
}
export function FocusTrendChart({ data }: { readonly data: readonly Row[] }) {
  const theme = useChartTheme();
  return (
    <MetricChart
      data={data}
      caption="focusTrend"
      series={[
        { key: 'minutes', label: 'minutes', color: theme.accent },
        {
          key: 'pomodoros',
          label: 'pomodoros',
          color: theme.accentActive,
          kind: 'line',
          axis: 'pom',
        },
      ]}
    />
  );
}
export function HourHistogram({
  data,
  bestHour,
}: {
  readonly data: readonly Row[];
  readonly bestHour: number | null;
}) {
  const theme = useChartTheme();
  const { t } = useStatisticsText();
  return (
    <>
      <MetricChart
        data={data}
        caption="bestHour"
        x="hour"
        series={[{ key: 'minutes', label: 'minutes', color: theme.accent }]}
      />
      {bestHour !== null ? (
        <p>
          {t('bestHour')}: {bestHour}–{bestHour + 1} h
        </p>
      ) : null}
    </>
  );
}
export function HabitLineChart({ data }: { readonly data: readonly Row[] }) {
  const theme = useChartTheme();
  return (
    <MetricChart
      data={data}
      caption="global"
      rate
      series={[{ key: 'percent', label: 'percent', color: theme.success, kind: 'line' }]}
    />
  );
}
export function OverdueChart({ data }: { readonly data: readonly Row[] }) {
  const theme = useChartTheme();
  return (
    <MetricChart
      data={data}
      caption="overdue"
      stack
      series={[
        { key: 'under_7', label: 'under7', color: theme.warning, kind: 'area' },
        { key: 'days_7_30', label: 'mid', color: theme.warning, kind: 'area' },
        { key: 'over_30', label: 'over30', color: theme.danger, kind: 'area' },
      ]}
    />
  );
}
export function AchievementChart({ data }: { readonly data: readonly Row[] }) {
  const theme = useChartTheme();
  return (
    <MetricChart
      data={data}
      caption="history"
      series={[{ key: 'score', label: 'points', color: theme.accent, kind: 'line' }]}
    />
  );
}
