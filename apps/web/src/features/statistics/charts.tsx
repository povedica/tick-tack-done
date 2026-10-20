import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChartTheme } from './chart-theme';
import { formatHumanDay } from './range';

export function TrendChart({
  data,
}: {
  readonly data: readonly {
    readonly date: string;
    readonly completed: number;
    readonly created: number;
  }[];
}) {
  const theme = useChartTheme();
  const rows = data.map((row) => ({ ...row, label: formatHumanDay(row.date) }));
  return (
    <div className="stats-chart" role="img" aria-label="Tendencia de completadas y creadas">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} stroke={theme.border} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle(theme)} />
          <Legend />
          <Bar dataKey="completed" name="Completadas" fill={theme.accent} radius={[3, 3, 0, 0]} />
          <Line
            dataKey="created"
            name="Creadas"
            type="monotone"
            stroke={theme.ink2}
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <DataTable
        caption="Tendencia"
        rows={rows.map((row) => [row.label, String(row.completed), String(row.created)])}
        headers={['Fecha', 'Completadas', 'Creadas']}
      />
    </div>
  );
}

export function RateChart({
  data,
}: {
  readonly data: readonly {
    readonly date: string;
    readonly rate: number | null;
    readonly completed: number;
    readonly planned: number;
  }[];
}) {
  const theme = useChartTheme();
  const rows = data.map((row) => ({
    label: formatHumanDay(row.date),
    rate: row.rate,
    completed: row.completed,
    planned: row.planned,
  }));
  return (
    <div className="stats-chart" role="img" aria-label="Tasa de completitud">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={rows}>
          <CartesianGrid vertical={false} stroke={theme.border} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle(theme)} />
          <Area
            type="monotone"
            dataKey="rate"
            name="%"
            stroke={theme.success}
            fill={theme.success}
            fillOpacity={0.08}
            strokeWidth={2}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FocusTrendChart({
  data,
}: {
  readonly data: readonly {
    readonly date: string;
    readonly minutes: number;
    readonly pomodoros: number;
  }[];
}) {
  const theme = useChartTheme();
  const rows = data.map((row) => ({ ...row, label: formatHumanDay(row.date) }));
  return (
    <div className="stats-chart" role="img" aria-label="Tendencia de foco">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows}>
          <CartesianGrid vertical={false} stroke={theme.border} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="min"
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="pom"
            orientation="right"
            allowDecimals={false}
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle(theme)} />
          <Bar
            yAxisId="min"
            dataKey="minutes"
            name="Minutos"
            fill={theme.accent}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="pom"
            dataKey="pomodoros"
            name="Pomodoros"
            stroke={theme.accentActive}
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourHistogram({
  data,
  bestHour,
}: {
  readonly data: readonly { readonly hour: number; readonly minutes: number }[];
  readonly bestHour: number | null;
}) {
  const theme = useChartTheme();
  const rows = data.map((row) => ({
    ...row,
    fill: row.hour === bestHour ? theme.accentActive : theme.accent,
  }));
  return (
    <div className="stats-chart" role="img" aria-label="Hora más enfocada">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows}>
          <XAxis
            dataKey="hour"
            tick={{ fill: theme.inkFaint, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle(theme)} />
          <Bar dataKey="minutes" name="Minutos" fill={theme.accent} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {bestHour !== null ? (
        <p className="stats-caption">
          Tu mejor hora: {String(bestHour)}–{String(bestHour + 1)} h
        </p>
      ) : null}
    </div>
  );
}

export function HabitLineChart({
  data,
}: {
  readonly data: readonly { readonly date: string; readonly percent: number | null }[];
}) {
  const theme = useChartTheme();
  const rows = data.map((row) => ({ label: formatHumanDay(row.date), percent: row.percent }));
  return (
    <div className="stats-chart" role="img" aria-label="Cumplimiento global de hábitos">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={rows}>
          <CartesianGrid vertical={false} stroke={theme.border} />
          <XAxis
            dataKey="label"
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: theme.inkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={tooltipStyle(theme)} />
          <Area
            type="monotone"
            dataKey="percent"
            stroke={theme.success}
            fill={theme.success}
            fillOpacity={0.08}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function tooltipStyle(theme: { surface: string; border: string }) {
  return {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 12,
  };
}

function DataTable({
  caption,
  headers,
  rows,
}: {
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}) {
  return (
    <details className="stats-table">
      <summary>Ver como tabla · {caption}</summary>
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('-')}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
