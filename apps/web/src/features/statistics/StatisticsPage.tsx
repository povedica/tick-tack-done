/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-condition -- stats screen uses SDK unknowns and prefetch */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Download,
  Flame,
  Minus,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useMessages } from '../../i18n';
import { Button } from '../../components/ui';
import { statsApi, type StatsParams } from './api';
import { Charts } from './ChartSuspense';
import { DayTimeline } from './DayTimeline';
import { YearHeatmap } from './YearHeatmap';
import { useChartTheme } from './chart-theme';
import {
  formatDuration,
  formatHumanDay,
  rangeFor,
  readStoredRange,
  shiftRange,
  writeStoredRange,
  type RangeKey,
} from './range';
import './statistics.css';

type Tab = 'overview' | 'tasks' | 'focus' | 'habits';

const TABS: readonly { key: Tab; path: string; label: string }[] = [
  { key: 'overview', path: '/statistics', label: 'Resumen' },
  { key: 'tasks', path: '/statistics/tasks', label: 'Tareas' },
  { key: 'focus', path: '/statistics/focus', label: 'Foco' },
  { key: 'habits', path: '/statistics/habits', label: 'Hábitos' },
];

export function StatisticsPage() {
  const messages = useMessages();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const [search, setSearch] = useSearchParams();
  const queryClient = useQueryClient();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  const tab: Tab =
    tabParam === 'tasks' || tabParam === 'focus' || tabParam === 'habits' ? tabParam : 'overview';
  const rangeKey = (search.get('range') as RangeKey | null) ?? readStoredRange();
  const customFrom = search.get('from');
  const customTo = search.get('to');
  const bounds = useMemo(
    () =>
      rangeFor(
        rangeKey,
        tz,
        customFrom && customTo ? { from: customFrom, to: customTo } : undefined,
      ),
    [rangeKey, tz, customFrom, customTo],
  );
  const list = search.get('list');
  const tag = search.get('tag');
  const priority = search.get('priority');
  const params: StatsParams = {
    from: bounds.from,
    to: bounds.to,
    tz,
    ...(list !== null && list.length > 0 ? { list } : {}),
    ...(tag !== null && tag.length > 0 ? { tag } : {}),
    ...(priority !== null && priority.length > 0 ? { priority } : {}),
  };
  const filterCount = [list, tag, priority].filter(
    (value) => value !== null && value.length > 0,
  ).length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    writeStoredRange(rangeKey);
  }, [rangeKey]);

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ['stats', 'tasks', params],
      queryFn: () => statsApi.tasks(params),
    });
    void queryClient.prefetchQuery({
      queryKey: ['stats', 'focus', params],
      queryFn: () => statsApi.focus(params),
    });
    void queryClient.prefetchQuery({
      queryKey: ['stats', 'habits', params],
      queryFn: () => statsApi.habits(params),
    });
  }, [params.from, params.to, params.list, params.tag, params.priority, queryClient]);

  const overview = useQuery({
    queryKey: ['stats', 'overview', params],
    queryFn: () => statsApi.overview(params),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const tasks = useQuery({
    queryKey: ['stats', 'tasks', params],
    queryFn: () => statsApi.tasks(params),
    enabled: tab === 'tasks' || tab === 'overview',
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const focus = useQuery({
    queryKey: ['stats', 'focus', params],
    queryFn: () => statsApi.focus(params),
    enabled: tab === 'focus',
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const habits = useQuery({
    queryKey: ['stats', 'habits', params],
    queryFn: () => statsApi.habits(params),
    enabled: tab === 'habits',
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  function setRange(next: RangeKey) {
    const nextBounds = rangeFor(next, tz);
    const copy = new URLSearchParams(search);
    copy.set('range', next);
    copy.set('from', nextBounds.from);
    copy.set('to', nextBounds.to);
    setSearch(copy, { replace: true });
  }

  function nudge(direction: -1 | 1) {
    const next = shiftRange(rangeKey, bounds.from, bounds.to, direction);
    const copy = new URLSearchParams(search);
    copy.set('range', rangeKey === 'today' ? 'custom' : rangeKey);
    copy.set('from', next.from);
    copy.set('to', next.to);
    setSearch(copy, { replace: true });
  }

  async function exportFormat(format: 'csv' | 'json') {
    setExporting(true);
    try {
      const blob = await statsApi.export(params, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `stats-${params.from}_${params.to}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const summary = isRecord(overview.data?.summary) ? overview.data.summary : null;
  const phrase = typeof overview.data?.phrase === 'string' ? overview.data.phrase : '';

  return (
    <section className="stats-page">
      <header className="stats-header">
        <div className="stats-header-row">
          <h1>{messages.navStatistics}</h1>
          <div className="stats-range">
            <button type="button" className="stats-icon-btn" onClick={() => { nudge(-1); }} aria-label="Período anterior">
              ‹
            </button>
            {(
              [
                ['today', 'Hoy'],
                ['week', 'Semana'],
                ['month', 'Mes'],
                ['year', 'Año'],
                ['custom', 'Personalizado'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={rangeKey === key ? 'is-active' : undefined}
                onClick={() => { setRange(key); }}
              >
                {label}
              </button>
            ))}
            <button type="button" className="stats-icon-btn" onClick={() => { nudge(1); }} aria-label="Período siguiente">
              ›
            </button>
          </div>
          <div className="stats-actions">
            <button
              type="button"
              className="stats-filter-btn"
              onClick={() => { setFiltersOpen((value) => !value); }}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filtros{filterCount > 0 ? ` · ${String(filterCount)}` : ''}
            </button>
            <details className="stats-export">
              <summary aria-label="Exportar">
                <Download size={16} aria-hidden="true" />
                {exporting ? 'Generando…' : ''}
              </summary>
              <div>
                <button type="button" onClick={() => void exportFormat('csv')}>
                  CSV
                </button>
                <button type="button" onClick={() => void exportFormat('json')}>
                  JSON
                </button>
              </div>
            </details>
            <Link className="stats-link" to="/reports/weekly">
              Reporte semanal
            </Link>
          </div>
        </div>
        {rangeKey === 'custom' ? (
          <div className="stats-custom">
            <label>
              Desde
              <input
                type="date"
                value={bounds.from}
                onChange={(event) => {
                  const copy = new URLSearchParams(search);
                  copy.set('range', 'custom');
                  copy.set('from', event.target.value);
                  copy.set('to', bounds.to);
                  setSearch(copy, { replace: true });
                }}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={bounds.to}
                onChange={(event) => {
                  const copy = new URLSearchParams(search);
                  copy.set('range', 'custom');
                  copy.set('from', bounds.from);
                  copy.set('to', event.target.value);
                  setSearch(copy, { replace: true });
                }}
              />
            </label>
          </div>
        ) : null}
        {filtersOpen ? (
          <div className="stats-filters-panel">
            <p>Los filtros de lista, etiqueta y prioridad se aplican a Resumen, Tareas y Foco.</p>
            <label>
              Lista (id)
              <input
                value={list ?? ''}
                onChange={(event) => {
                  const copy = new URLSearchParams(search);
                  if (event.target.value) copy.set('list', event.target.value);
                  else copy.delete('list');
                  setSearch(copy, { replace: true });
                }}
              />
            </label>
            <label>
              Etiqueta (id)
              <input
                value={tag ?? ''}
                onChange={(event) => {
                  const copy = new URLSearchParams(search);
                  if (event.target.value) copy.set('tag', event.target.value);
                  else copy.delete('tag');
                  setSearch(copy, { replace: true });
                }}
              />
            </label>
            <label>
              Prioridad
              <select
                value={priority ?? ''}
                onChange={(event) => {
                  const copy = new URLSearchParams(search);
                  if (event.target.value) copy.set('priority', event.target.value);
                  else copy.delete('priority');
                  setSearch(copy, { replace: true });
                }}
              >
                <option value="">Todas</option>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
                <option value="none">Ninguna</option>
              </select>
            </label>
            {filterCount > 0 ? (
              <Button
                onClick={() => {
                  const copy = new URLSearchParams(search);
                  copy.delete('list');
                  copy.delete('tag');
                  copy.delete('priority');
                  setSearch(copy, { replace: true });
                }}
              >
                Quitar filtros
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="stats-chips">
          {list ? (
            <span className="stats-chip">
              lista <button type="button" onClick={() => {
                const copy = new URLSearchParams(search);
                copy.delete('list');
                setSearch(copy, { replace: true });
              }}>×</button>
            </span>
          ) : null}
          {tag ? (
            <span className="stats-chip">
              etiqueta <button type="button" onClick={() => {
                const copy = new URLSearchParams(search);
                copy.delete('tag');
                setSearch(copy, { replace: true });
              }}>×</button>
            </span>
          ) : null}
          {priority ? (
            <span className="stats-chip">
              {priority}{' '}
              <button type="button" onClick={() => {
                const copy = new URLSearchParams(search);
                copy.delete('priority');
                setSearch(copy, { replace: true });
              }}>×</button>
            </span>
          ) : null}
        </div>
        <nav className="stats-tabs" role="tablist" aria-label="Secciones de estadísticas">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? 'is-active' : undefined}
              onClick={() => {
                void navigate(`${item.path}?${search.toString()}`);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="stats-phrase">
          {overview.isLoading ? 'Cargando resumen…' : phrase || `Del ${formatHumanDay(bounds.from)} al ${formatHumanDay(bounds.to)}.`}
        </p>
      </header>

      {tab === 'overview' ? (
        <OverviewTab
          loading={overview.isLoading && !overview.data}
          error={overview.isError}
          onRetry={() => void overview.refetch()}
          summary={summary}
          trend={arrayOf(overview.data?.trend)}
          completion={arrayOf(overview.data?.completion_series)}
          onOpen={(next) => {
            void navigate(`/statistics/${next}?${search.toString()}`);
          }}
        />
      ) : null}
      {tab === 'tasks' ? (
        <TasksTab
          loading={tasks.isLoading && !tasks.data}
          error={tasks.isError}
          onRetry={() => void tasks.refetch()}
          data={tasks.data}
        />
      ) : null}
      {tab === 'focus' ? (
        <FocusTab
          loading={focus.isLoading && !focus.data}
          error={focus.isError}
          onRetry={() => void focus.refetch()}
          data={focus.data}
        />
      ) : null}
      {tab === 'habits' ? (
        <HabitsTab
          loading={habits.isLoading && !habits.data}
          error={habits.isError}
          onRetry={() => void habits.refetch()}
          data={habits.data}
          filtersIgnored={filterCount > 0}
        />
      ) : null}
    </section>
  );
}

function OverviewTab({
  loading,
  error,
  onRetry,
  summary,
  trend,
  completion,
  onOpen,
}: {
  readonly loading: boolean;
  readonly error: boolean;
  readonly onRetry: () => void;
  readonly summary: Record<string, unknown> | null;
  readonly trend: readonly Record<string, unknown>[];
  readonly completion: readonly Record<string, unknown>[];
  readonly onOpen: (tab: Tab) => void;
}) {
  if (loading) {
    return <SkeletonGrid />;
  }
  if (error || summary === null) {
    return <BlockError onRetry={onRetry} />;
  }
  const achievement = isRecord(summary.achievement) ? summary.achievement : null;
  return (
    <div className="stats-body">
      <div className="stats-kpi-grid">
        <Kpi
          label="Completadas"
          value={String(num(summary.completed))}
          delta={numOrNull(summary.completed_delta_percent)}
          onClick={() => { onOpen('tasks'); }}
        />
        <Kpi
          label="Tasa de completitud"
          value={summary.completion_rate === null ? '—' : `${String(summary.completion_rate)} %`}
          hint={`${String(num(summary.completion_completed))}/${String(num(summary.completion_planned))}`}
          delta={numOrNull(summary.completion_rate_delta_pt)}
          onClick={() => { onOpen('tasks'); }}
        />
        <Kpi
          label="Tiempo de foco"
          value={formatDuration(num(summary.focus_minutes))}
          hint={`${String(num(summary.pomodoros))} pomodoros`}
          delta={numOrNull(summary.focus_minutes_delta_percent)}
          onClick={() => { onOpen('focus'); }}
        />
        <Kpi
          label="Hábitos cumplidos"
          value={`${String(num(summary.habit_percent))} %`}
          hint={`${String(num(summary.habit_done))}/${String(num(summary.habit_expected))} días`}
          delta={numOrNull(summary.habit_delta_pt)}
          worseIsUp={false}
          onClick={() => { onOpen('habits'); }}
        />
        <Kpi
          label="Racha de días productivos"
          value={`${String(num(summary.streak_current))} días`}
          hint={`mejor: ${String(num(summary.streak_best_year))}`}
          onClick={() => { onOpen('tasks'); }}
        />
        <article className="stats-card stats-kpi stats-achievement">
          <p className="stats-kpi-label">Valor de logro</p>
          <p className="stats-kpi-value">
            <Award size={20} aria-hidden="true" />{' '}
            {achievement?.enabled === true
              ? `Nivel ${String(num(achievement.level_index) + 1)} · ${String(achievement.level ?? '')}`
              : 'Desactivado'}
          </p>
          {typeof achievement?.score === 'number' ? (
            <>
              <p className="stats-kpi-hint">{String(achievement.score)} puntos</p>
              <div className="stats-progress">
                <span style={{ width: `${String(num(achievement.progress_to_next))}%` }} />
              </div>
            </>
          ) : null}
          <details className="stats-formula">
            <summary>¿Cómo se calcula?</summary>
            <Formula formula={isRecord(achievement?.formula) ? achievement.formula : null} />
          </details>
          <button type="button" className="stats-link-btn" onClick={() => { onOpen('tasks'); }}>
            Ver detalle
          </button>
        </article>
      </div>
      <article className="stats-card stats-span-12">
        <h2>Tendencia: completadas vs creadas</h2>
        <Charts.TrendChart
          data={trend.map((row) => ({
            date: String(row.date ?? ''),
            completed: num(row.completed),
            created: num(row.created),
          }))}
        />
      </article>
      <article className="stats-card stats-span-6">
        <h2>Tasa de completitud</h2>
        <Charts.RateChart
          data={completion.map((row) => ({
            date: String(row.date ?? ''),
            rate: typeof row.rate === 'number' ? row.rate : null,
            completed: num(row.completed),
            planned: num(row.planned),
          }))}
        />
      </article>
      <article className="stats-card stats-span-6">
        <h2>Mejor momento</h2>
        <BestMoment summary={summary} />
      </article>
    </div>
  );
}

function TasksTab({
  loading,
  error,
  onRetry,
  data,
}: {
  readonly loading: boolean;
  readonly error: boolean;
  readonly onRetry: () => void;
  readonly data: Record<string, unknown> | undefined;
}) {
  const theme = useChartTheme();
  if (loading) return <SkeletonGrid />;
  if (error || data === undefined) return <BlockError onRetry={onRetry} />;
  const punctuality = isRecord(data.punctuality) ? data.punctuality : {};
  const age = isRecord(data.age_on_complete) ? data.age_on_complete : {};
  return (
    <div className="stats-body">
      <article className="stats-card stats-span-12">
        <h2>Tendencia</h2>
        <Charts.TrendChart
          data={arrayOf(data.trend).map((row) => ({
            date: String(row.date ?? ''),
            completed: num(row.completed),
            created: num(row.created),
          }))}
        />
      </article>
      <article className="stats-card stats-span-6">
        <h2>Tasa de completitud</h2>
        <Charts.RateChart
          data={arrayOf(data.completion_series).map((row) => ({
            date: String(row.date ?? ''),
            rate: typeof row.rate === 'number' ? row.rate : null,
            completed: num(row.completed),
            planned: num(row.planned),
          }))}
        />
      </article>
      <article className="stats-card stats-span-6">
        <h2>Puntualidad</h2>
        <StackedBar
          left={num(punctuality.on_time_percent)}
          leftColor={theme.success}
          right={100 - num(punctuality.on_time_percent)}
          rightColor={theme.danger}
          leftLabel="A tiempo"
          rightLabel="Tarde"
        />
        <p className="stats-caption">
          Retraso medio {String(punctuality.mean_delay_days ?? '—')} días · mediana{' '}
          {String(punctuality.median_delay_days ?? '—')} días
        </p>
      </article>
      <DistributionCard title="Por lista" rows={arrayOf(data.by_list)} />
      <DistributionCard title="Por etiqueta" rows={arrayOf(data.by_tag)} />
      <DistributionCard title="Por prioridad" rows={arrayOf(data.by_priority)} priority />
      <article className="stats-card stats-span-6">
        <h2>Edad al completar</h2>
        <p className="stats-kpi-value">{String(age.mean_days ?? '—')} d</p>
        <p className="stats-kpi-hint">media · mediana {String(age.median_days ?? '—')} d</p>
      </article>
      <article className="stats-card stats-span-6">
        <h2>Vencidas arrastradas</h2>
        <OverdueList rows={arrayOf(data.overdue_stock)} />
      </article>
    </div>
  );
}

function FocusTab({
  loading,
  error,
  onRetry,
  data,
}: {
  readonly loading: boolean;
  readonly error: boolean;
  readonly onRetry: () => void;
  readonly data: Record<string, unknown> | undefined;
}) {
  if (loading) return <SkeletonGrid />;
  if (error || data === undefined) return <BlockError onRetry={onRetry} />;
  return (
    <div className="stats-body">
      <div className="stats-kpi-grid is-four">
        <Kpi label="Minutos de foco" value={formatDuration(num(data.focus_minutes))} />
        <Kpi label="Pomodoros" value={String(num(data.pomodoros))} />
        <Kpi
          label="% sesiones completadas"
          value={data.completed_percent === null ? '—' : `${String(data.completed_percent)} %`}
        />
        <Kpi label="Interrupciones / sesión" value={String(data.interruptions_per_session ?? 0)} />
      </div>
      <article className="stats-card stats-span-8">
        <h2>Tendencia de foco</h2>
        <Charts.FocusTrendChart
          data={arrayOf(data.trend).map((row) => ({
            date: String(row.date ?? ''),
            minutes: num(row.minutes),
            pomodoros: num(row.pomodoros),
          }))}
        />
      </article>
      <article className="stats-card stats-span-4">
        <h2>Hora más enfocada</h2>
        <Charts.HourHistogram
          data={arrayOf(data.hours).map((row) => ({
            hour: num(row.hour),
            minutes: num(row.minutes),
          }))}
          bestHour={typeof data.best_hour === 'number' ? data.best_hour : null}
        />
      </article>
      <article className="stats-card stats-span-12">
        <h2>Línea temporal · {String(data.timeline_day ?? '')}</h2>
        <DayTimeline
          day={String(data.timeline_day ?? '')}
          blocks={arrayOf(data.timeline).map((row) => ({
            id: String(row.id ?? ''),
            start: String(row.start ?? ''),
            end: typeof row.end === 'string' ? row.end : null,
            minutes: num(row.minutes),
            task_title: typeof row.task_title === 'string' ? row.task_title : null,
          }))}
        />
      </article>
      <article className="stats-card stats-span-12">
        <h2>Rejilla anual</h2>
        <YearHeatmap
          cells={arrayOf(data.heatmap).map((row) => ({
            date: String(row.date ?? ''),
            minutes: num(row.minutes),
            pomodoros: num(row.pomodoros),
            level: num(row.level),
          }))}
        />
      </article>
      <DistributionCard title="Foco por lista" rows={arrayOf(data.by_list)} />
      <DistributionCard title="Foco por etiqueta" rows={arrayOf(data.by_tag)} />
      <DistributionCard title="Foco por tarea" rows={arrayOf(data.by_task)} span={12} />
    </div>
  );
}

function HabitsTab({
  loading,
  error,
  onRetry,
  data,
  filtersIgnored,
}: {
  readonly loading: boolean;
  readonly error: boolean;
  readonly onRetry: () => void;
  readonly data: Record<string, unknown> | undefined;
  readonly filtersIgnored: boolean;
}) {
  if (loading) return <SkeletonGrid />;
  if (error || data === undefined) return <BlockError onRetry={onRetry} />;
  const cards = arrayOf(data.habits);
  return (
    <div className="stats-body">
      {filtersIgnored ? (
        <p className="stats-note">Los filtros no aplican a hábitos.</p>
      ) : null}
      <article className="stats-card stats-span-12">
        <h2>Cumplimiento global</h2>
        <Charts.HabitLineChart
          data={arrayOf(data.global_series).map((row) => ({
            date: String(row.date ?? ''),
            percent: typeof row.percent === 'number' ? row.percent : null,
          }))}
        />
      </article>
      {cards.length === 0 ? (
        <p className="stats-empty">Aún no hay hábitos activos. Crea uno desde Hábitos.</p>
      ) : (
        cards.map((habit) => (
          <article key={String(habit.id)} className="stats-card stats-span-4">
            <h2>
              <span aria-hidden="true">{String(habit.icon ?? '🌱')}</span> {String(habit.name)}
            </h2>
            <p className="stats-habit-metrics">
              <Flame size={14} aria-hidden="true" /> {String(num(habit.streak_current))} · mejor{' '}
              {String(num(habit.streak_best))} · {String(num(habit.percent))} %
            </p>
            <YearHeatmap
              {...(typeof habit.color === 'string' ? { color: habit.color } : {})}
              cells={arrayOf(habit.heatmap).map((row) => ({
                date: String(row.date ?? ''),
                count: num(row.count),
                level: num(row.level),
              }))}
            />
          </article>
        ))
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  worseIsUp,
  onClick,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly delta?: number | null;
  readonly worseIsUp?: boolean;
  readonly onClick?: () => void;
}) {
  if (onClick !== undefined) {
    return (
      <button type="button" className="stats-card stats-kpi" onClick={onClick}>
        <p className="stats-kpi-label">{label}</p>
        <p className="stats-kpi-value">{value}</p>
        {hint ? <p className="stats-kpi-hint">{hint}</p> : null}
        {delta !== undefined && delta !== null ? (
          <Delta value={delta} {...(worseIsUp !== undefined ? { worseIsUp } : {})} />
        ) : null}
      </button>
    );
  }
  return (
    <article className="stats-card stats-kpi">
      <p className="stats-kpi-label">{label}</p>
      <p className="stats-kpi-value">{value}</p>
      {hint ? <p className="stats-kpi-hint">{hint}</p> : null}
      {delta !== undefined && delta !== null ? (
        <Delta value={delta} {...(worseIsUp !== undefined ? { worseIsUp } : {})} />
      ) : null}
    </article>
  );
}

function Delta({ value, worseIsUp }: { readonly value: number; readonly worseIsUp?: boolean }) {
  if (value === 0) {
    return (
      <p className="stats-delta is-flat">
        <Minus size={14} aria-hidden="true" /> sin cambio
      </p>
    );
  }
  const up = value > 0;
  const good = worseIsUp === true ? !up : up;
  return (
    <p className={good ? 'stats-delta is-up' : 'stats-delta is-down'}>
      {up ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
      {up ? '+' : ''}
      {String(value)} %
    </p>
  );
}

function DistributionCard({
  title,
  rows,
  priority,
  span = 4,
}: {
  readonly title: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly priority?: boolean;
  readonly span?: 4 | 12;
}) {
  const theme = useChartTheme();
  return (
    <article className={`stats-card stats-span-${String(span)}`}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="stats-empty">Sin datos en este rango.</p>
      ) : (
        <ul className="stats-bars">
          {rows.map((row, index) => {
            const color = priority
              ? theme.prio[String(row.key) as 'high' | 'medium' | 'low' | 'none'] ?? theme.charts[index % 8]
              : typeof row.color === 'string' && row.color.length > 0
                ? row.color
                : theme.charts[index % 8];
            return (
              <li key={String(row.key)}>
                <span className="stats-bars-label">{String(row.label)}</span>
                <span className="stats-bars-track">
                  <span style={{ width: `${String(num(row.percent))}%`, background: color }} />
                </span>
                <span className="stats-bars-value">
                  {String(num(row.value))} · {String(num(row.percent))} %
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function StackedBar({
  left,
  right,
  leftColor,
  rightColor,
  leftLabel,
  rightLabel,
}: {
  readonly left: number;
  readonly right: number;
  readonly leftColor: string;
  readonly rightColor: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
}) {
  return (
    <div className="stats-stacked">
      <div className="stats-stacked-bar">
        <span style={{ width: `${String(left)}%`, background: leftColor }} />
        <span style={{ width: `${String(right)}%`, background: rightColor }} />
      </div>
      <p>
        {leftLabel} {String(left)} % · {rightLabel} {String(right)} %
      </p>
    </div>
  );
}

function OverdueList({ rows }: { readonly rows: readonly Record<string, unknown>[] }) {
  const last = rows[rows.length - 1];
  if (last === undefined) {
    return <p className="stats-empty">Sin vencidas arrastradas.</p>;
  }
  return (
    <ul className="stats-overdue">
      <li>&lt;7 días: {String(num(last.under_7))}</li>
      <li>7–30 días: {String(num(last.days_7_30))}</li>
      <li>&gt;30 días: {String(num(last.over_30))}</li>
    </ul>
  );
}

function BestMoment({ summary }: { readonly summary: Record<string, unknown> }) {
  const best = isRecord(summary.best_moment) ? summary.best_moment : null;
  const weekdays = arrayOf(best?.by_weekday);
  const band = isRecord(best?.by_band) ? best.by_band : {};
  const names = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  return (
    <div className="stats-best">
      <div className="stats-best-days">
        {weekdays.map((row, index) => (
          <div key={names[index]}>
            <strong>{names[index]}</strong>
            <span>{String(num(row.completed))}</span>
          </div>
        ))}
      </div>
      <p className="stats-caption">
        Mañana {String(num(band.morning))} · Tarde {String(num(band.afternoon))} · Noche{' '}
        {String(num(band.evening))}
      </p>
    </div>
  );
}

function Formula({ formula }: { readonly formula: Record<string, unknown> | null }) {
  if (formula === null) {
    return <p>Activa la puntuación en el Jardín para ver el desglose.</p>;
  }
  const weights = isRecord(formula.weights) ? formula.weights : {};
  return (
    <ul>
      <li>
        A tiempo: {String(num(formula.on_time_points))} (×{String(num(weights.on_time_base))})
      </li>
      <li>Tarde: {String(num(formula.late_points))}</li>
      <li>Prioridad: {String(num(formula.priority_points))}</li>
      <li>Pomodoros: {String(num(formula.pomodoro_points))}</li>
      <li>Hábitos: {String(num(formula.habit_points))}</li>
      <li>Penalización vencidas: −{String(num(formula.overdue_penalty))}</li>
    </ul>
  );
}

function SkeletonGrid() {
  return (
    <div className="stats-body">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="stats-skeleton kpi" />
      ))}
      <div className="stats-skeleton chart stats-span-12" />
    </div>
  );
}

function BlockError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="stats-error">
      <p>No se pudo cargar</p>
      <Button onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function arrayOf(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
