import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCheck,
  CircleAlert,
  Clock3,
  GripVertical,
  Leaf,
  Settings2,
  X,
} from 'lucide-react';
import { api } from '../../api';
import { Button, SkeletonRows } from '../../components/ui';
import { countdownsApi } from '../countdowns/api';
import { countdownLabel } from '../countdowns/presentation';
import { formatDuration } from '../product/duration';
import { humanDate } from '@reflexionia/domain';
import {
  WIDGETS,
  count,
  label,
  parseLayout,
  row,
  rows,
  type GardenWidget,
  type WidgetKey,
} from './model';
import './dashboard.css';
import { useControlSummary } from '../statistics/ControlSummary';
import { ProjectContext } from './ProjectContext';

const number = (value: number) => value.toLocaleString('es-ES');

export function DashboardPage() {
  const cache = useQueryClient();
  const data = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboardData(),
    refetchInterval: 60_000,
  });
  const layout = useQuery({ queryKey: ['dashboard-layout'], queryFn: () => api.dashboardLayout() });
  const score = useControlSummary();
  const countdowns = useQuery({
    queryKey: ['countdowns', 'dashboard'],
    queryFn: () => countdownsApi.list(false, 365),
  });
  const [draft, setDraft] = useState<GardenWidget[] | null>(null);
  const [dragged, setDragged] = useState<WidgetKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgets = row(data.data?.widgets);
  const saved = parseLayout(layout.data?.widgets);
  const visible = draft ?? saved;
  const overdue = typeof widgets.overdue === 'number' ? widgets.overdue : null;
  const load = rows(row(widgets.load).by_list);
  const week = row(widgets.completed_week);
  const habits = row(widgets.habits);
  const calendar = row(widgets.calendar);
  const period = row(data.data?.period);
  const updated = label(data.data?.generated_at);
  const unconfigured = visible.filter(
    (item) =>
      (item.widget_key === 'habits' && habits.configured === false) ||
      (item.widget_key === 'calendar' && calendar.configured === false) ||
      (item.widget_key === 'next_countdowns' &&
        countdowns.isSuccess &&
        row(widgets.next_countdowns).configured === false),
  );
  const configured = visible.filter(
    (item) =>
      !unconfigured.includes(item) &&
      !(
        item.widget_key === 'focus' &&
        data.isSuccess &&
        Object.hasOwn(widgets, 'focus') &&
        count(row(widgets.focus).seconds) === 0
      ),
  );
  const controlScore = typeof score.achievement.score === 'number' ? score.achievement.score : null;
  const controlState =
    controlScore === null
      ? 'Sin datos'
      : controlScore >= 75
        ? 'Al día'
        : controlScore >= 50
          ? 'Justo'
          : 'Atrasado';

  function move(source: WidgetKey, target: WidgetKey) {
    if (draft === null || source === target) return;
    const index = draft.findIndex((item) => item.widget_key === target);
    const next = draft.filter((item) => item.widget_key !== source);
    const item = draft.find((item) => item.widget_key === source);
    if (item !== undefined) next.splice(index, 0, item);
    setDraft(next);
  }
  async function save() {
    if (draft === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveDashboardLayout({
        name: label(layout.data?.name) || 'Mi jardín',
        is_default: true,
        widgets: draft.map((item, position) => ({ ...item, position, config: {} })),
      });
      cache.setQueryData(['dashboard-layout'], result);
      setDraft(null);
    } catch {
      setError('No se ha podido guardar. Tu selección sigue aquí; vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  function content(key: WidgetKey): ReactNode {
    if (!Object.hasOwn(widgets, key) && key !== 'next_countdowns')
      return <p className="garden-empty">Este dato no está disponible todavía.</p>;
    switch (key) {
      case 'projects':
        return <ProjectContext value={widgets.projects} />;
      case 'completed_today':
        return (
          <>
            <strong className="garden-metric">{number(count(widgets.completed_today))}</strong>
            <p>Según la zona horaria de tu cuenta.</p>
          </>
        );
      case 'completed_week':
        return (
          <>
            <strong className="garden-metric">{number(count(week.value))}</strong>
            <p>Últimos 7 días. Puede incluir cierres en lote.</p>
          </>
        );
      case 'overdue':
        return (
          <>
            {overdue !== null && overdue > 0 ? (
              <details className="garden-overdue">
                <summary>
                  <strong className="garden-metric is-attention">{number(overdue)}</strong>
                  <span>Ver vencidas por lista y antigüedad</span>
                </summary>
                <ul>
                  {rows(widgets.overdue_by_list).map((item) => (
                    <li key={label(item.list_id) || 'none'}>
                      <strong>
                        {label(item.name)} · {number(count(item.total))}
                      </strong>
                      <span>Menos de 7 días: {number(count(item.under_7))}</span>
                      <span>7–30 días: {number(count(item.days_7_30))}</span>
                      <span>Más de 30 días: {number(count(item.over_30))}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <>
                <strong className="garden-metric">{number(count(widgets.overdue))}</strong>
                <p>No tienes tareas vencidas.</p>
              </>
            )}
          </>
        );
      case 'next_7_days':
        return (
          <>
            <strong className="garden-metric">{number(count(widgets.next_7_days))}</strong>
            <p>Tareas con fecha por delante.</p>
          </>
        );
      case 'load': {
        const max = Math.max(1, ...load.map((item) => count(item.active)));
        return load.length === 0 ? (
          <p className="garden-empty">
            No tienes tareas pendientes. Aquí verás cómo se reparten por lista.
          </p>
        ) : (
          <>
            <p className="garden-context">
              Tareas activas, incluidas subtareas ·{' '}
              {number(load.reduce((sum, item) => sum + count(item.active), 0))} en total
            </p>
            <ul className="garden-load">
              {load.slice(0, 5).map((item) => (
                <li key={label(item.list_id)}>
                  <Link to={`/list/${label(item.list_id)}`}>
                    <span>{label(item.name)}</span>
                    <strong>{number(count(item.active))}</strong>
                    <span className="garden-track" aria-hidden="true">
                      <span style={{ width: `${String((count(item.active) / max) * 100)}%` }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {load.length > 5 ? (
              <p className="garden-context">
                Y {String(load.length - 5)} listas más. Consulta el reparto completo en
                Estadísticas.
              </p>
            ) : null}
          </>
        );
      }
      case 'habits':
        return count(habits.total) === 0 ? (
          <div className="garden-empty">
            <Leaf size={26} aria-hidden="true" />
            <p>Sin hábitos activos.</p>
            <span>Puedes activar o crear un hábito desde Hábitos.</span>
          </div>
        ) : (
          <>
            <strong className="garden-metric">
              {number(count(habits.percent))}
              <small>%</small>
            </strong>
            <progress
              max={100}
              value={count(habits.percent)}
              aria-label="Cumplimiento de hábitos de hoy"
            />
            <p>Porcentaje de tus {number(count(habits.total))} hábitos activos completados hoy.</p>
          </>
        );
      case 'focus':
        return (
          <>
            <strong className="garden-metric">
              {formatDuration(count(row(widgets.focus).seconds))}
            </strong>
            <p>Tiempo de concentración de hoy.</p>
            <p className="garden-insight">Abre Foco para empezar una sesión.</p>
          </>
        );
      case 'calendar':
        return count(calendar.upcoming) === 0 ? (
          <div className="garden-empty">
            <Clock3 size={26} aria-hidden="true" />
            <p>Sin eventos externos próximos.</p>
            <span>
              No hay eventos externos en los próximos 7 días. Tus tareas con fecha están en Agenda.
            </span>
          </div>
        ) : (
          <>
            <p className="garden-context">
              {number(count(calendar.upcoming))} eventos externos · próximos 7 días
            </p>
            <ul className="garden-events">
              {rows(calendar.items).map((item) => (
                <li key={label(item.id)}>
                  <time dateTime={label(item.starts_at)}>
                    {humanDate(label(item.starts_on) || label(item.starts_at).slice(0, 10))}
                  </time>
                  <span>{label(item.title)}</span>
                </li>
              ))}
            </ul>
          </>
        );
      case 'next_countdowns':
        return countdowns.isError ? (
          <p role="alert">No se han podido cargar las fechas.</p>
        ) : countdowns.isPending ? (
          <p role="status">Cargando fechas…</p>
        ) : countdowns.data.items.length === 0 ? (
          <div className="garden-empty">
            <p>Sin fechas próximas.</p>
            <span>Añade una fecha especial para tenerla a la vista.</span>
          </div>
        ) : (
          <ul className="garden-countdowns">
            {countdowns.data.items.slice(0, 3).map((item) => (
              <li key={item.id}>
                <span className="garden-emoji" aria-hidden="true">
                  {item.emoji ?? '◷'}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{countdownLabel(item.kind, item.days, item.effectiveDate)}</span>
                </div>
              </li>
            ))}
          </ul>
        );
    }
  }

  return (
    <section className="screen-page is-wide digital-garden" aria-labelledby="garden-title">
      <header className="page-header garden-header">
        <div>
          <h1 id="garden-title">Jardín digital</h1>
          <p className="lede">Actividad reciente, estado de tus proyectos y próximos pasos.</p>
        </div>
        <Button
          disabled={!layout.isSuccess || draft !== null}
          onClick={() => {
            setDraft(saved);
            setError(null);
          }}
        >
          <Settings2 size={16} aria-hidden="true" /> Personalizar
        </Button>
      </header>
      <nav className="page-toolbar" aria-label="Acciones de Jardín">
        <Link className="ui-button is-primary is-md" to="/review/weekly">
          Revisar mis pendientes
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className="ui-button is-secondary is-md" to="/reports/weekly">
          Ver mi reporte semanal
        </Link>
      </nav>
      <section className="garden-score" aria-labelledby="garden-score-title">
        <div className="garden-score-heading">
          <h2 id="garden-score-title">Puntuación de control</h2>
          {score.isSuccess && score.achievement.enabled !== false ? (
            <p
              className="garden-control-value"
              data-state={
                controlScore === null
                  ? 'empty'
                  : controlScore >= 75
                    ? 'good'
                    : controlScore >= 50
                      ? 'fair'
                      : 'behind'
              }
            >
              <strong>{controlScore === null ? '—' : number(controlScore)}</strong> {controlState}
            </p>
          ) : null}
        </div>
        {score.isPending ? (
          <p role="status">Cargando puntuación…</p>
        ) : score.isError ? (
          <div role="alert">
            <p>No se ha podido cargar la puntuación.</p>
            <Button
              onClick={() => {
                void score.refetch();
              }}
            >
              Reintentar puntuación
            </Button>
          </div>
        ) : score.achievement.enabled === false ? (
          <p>La puntuación está desactivada.</p>
        ) : (
          <>
            {typeof score.achievement.topDeduction === 'string' ? (
              <p className="garden-control-reason">{score.achievement.topDeduction}</p>
            ) : null}
            <button
              type="button"
              className="garden-control-action"
              onClick={() => {
                Array.from(document.querySelectorAll<HTMLButtonElement>('.control-chip'))
                  .find((button) => button.getClientRects().length > 0)
                  ?.click();
              }}
            >
              Ver desglose
            </button>
          </>
        )}
      </section>
      <div className="garden-section-heading">
        <h2>Tu jardín de un vistazo</h2>
        <span>
          {updated ? (
            <>
              Actualizado a las{' '}
              {new Date(updated).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </>
          ) : (
            'Datos de tu cuenta'
          )}
        </span>
      </div>
      {draft !== null ? (
        <section className="garden-customize" aria-label="Personalizar widgets">
          <div>
            <h3>Personalizar widgets</h3>
            <p>
              Arrastra para ordenar, usa las flechas o cambia el tamaño. Desmarca lo que no quieras
              ver. Foco solo aparece cuando hay actividad hoy.
            </p>
          </div>
          <div className="garden-editor-list">
            {[
              ...draft.map((item) => item.widget_key),
              ...(Object.keys(WIDGETS) as WidgetKey[]).filter(
                (key) => !draft.some((item) => item.widget_key === key),
              ),
            ].map((key) => {
              const index = draft.findIndex((item) => item.widget_key === key);
              const item = draft[index];
              return (
                <div
                  key={key}
                  data-garden-editor={key}
                  draggable={item !== undefined && !saving}
                  onDragStart={() => {
                    setDragged(key);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                  }}
                  onDragOver={(event) => {
                    if (dragged !== null && item !== undefined) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragged !== null && item !== undefined) move(dragged, key);
                    setDragged(null);
                  }}
                >
                  <GripVertical size={16} aria-hidden="true" />
                  <label>
                    <input
                      type="checkbox"
                      checked={item !== undefined}
                      disabled={saving}
                      onChange={(event) => {
                        setDraft(
                          event.target.checked
                            ? [...draft, { widget_key: key, size: WIDGETS[key].size }]
                            : draft.filter((widget) => widget.widget_key !== key),
                        );
                      }}
                    />
                    {WIDGETS[key].title}
                  </label>
                  {item !== undefined ? (
                    <>
                      <select
                        aria-label={`Tamaño: ${WIDGETS[key].title}`}
                        value={item.size}
                        disabled={saving}
                        onChange={(event) => {
                          const size = event.target.value;
                          if (size === 's' || size === 'm' || size === 'l')
                            setDraft(
                              draft.map((widget) =>
                                widget.widget_key === key ? { ...widget, size } : widget,
                              ),
                            );
                        }}
                      >
                        <option value="s">Pequeño</option>
                        <option value="m">Mediano</option>
                        <option value="l">Ancho</option>
                      </select>
                      <button
                        aria-label={`Subir: ${WIDGETS[key].title}`}
                        disabled={saving || index === 0}
                        onClick={() => {
                          const target = draft[index - 1];
                          if (target !== undefined) move(key, target.widget_key);
                        }}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        aria-label={`Bajar: ${WIDGETS[key].title}`}
                        disabled={saving || index === draft.length - 1}
                        onClick={() => {
                          const target = draft[index + 1];
                          if (target !== undefined) move(key, target.widget_key);
                        }}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          {error !== null ? <p role="alert">{error}</p> : null}
          <div className="garden-editor-actions">
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => {
                void save();
              }}
            >
              {saving ? 'Guardando…' : 'Guardar mi jardín'}
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              <X size={14} /> Cancelar
            </Button>
          </div>
        </section>
      ) : null}
      {data.isError ? (
        <div className="garden-error" role="alert">
          <CircleAlert size={22} />
          <p>No hemos podido cargar tu jardín. Los datos no se han perdido.</p>
          <Button
            onClick={() => {
              void data.refetch();
            }}
          >
            Volver a intentar
          </Button>
        </div>
      ) : data.isPending || layout.isPending ? (
        <div role="status" aria-label="Cargando Jardín">
          <SkeletonRows />
        </div>
      ) : layout.isError ? (
        <div className="garden-error" role="alert">
          <p>No se ha podido cargar tu distribución.</p>
          <Button
            onClick={() => {
              void layout.refetch();
            }}
          >
            Volver a intentar
          </Button>
        </div>
      ) : (
        <div className="garden-widgets">
          {configured.map((item) => (
            <article
              className={`garden-widget garden-size-${item.size}`}
              key={item.widget_key}
              data-garden-widget={item.widget_key}
            >
              <header>
                <h3>{WIDGETS[item.widget_key].title}</h3>
                {item.widget_key === 'overdue' ? (
                  <CircleAlert size={17} aria-hidden="true" />
                ) : item.widget_key === 'completed_today' ? (
                  <CheckCheck size={17} aria-hidden="true" />
                ) : null}
              </header>
              <div className="garden-widget-body">{content(item.widget_key)}</div>
              <Link className="garden-widget-action" to={WIDGETS[item.widget_key].to}>
                {
                  (
                    {
                      habits: 'Ir a mis hábitos',
                      focus: 'Iniciar una sesión',
                      calendar: 'Abrir Agenda',
                      next_countdowns: 'Ver mis fechas',
                      load: 'Ver todas mis tareas',
                      overdue: 'Revisar pendientes',
                      next_7_days: 'Ver próximas tareas',
                      completed_today: 'Ver completadas',
                      completed_week: 'Explorar estadísticas',
                      projects: 'Abrir revisión semanal',
                    } satisfies Record<WidgetKey, string>
                  )[item.widget_key]
                }
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      )}
      {unconfigured.length > 0 && data.isSuccess ? (
        <details className="garden-configuration">
          <summary>Pendiente de configurar ({number(unconfigured.length)})</summary>
          <ul>
            {unconfigured.map((item) => (
              <li key={item.widget_key}>
                <Link
                  to={
                    item.widget_key === 'calendar'
                      ? '/settings/calendar'
                      : WIDGETS[item.widget_key].to
                  }
                >
                  {WIDGETS[item.widget_key].title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {visible.length === 0 && data.isSuccess && layout.isSuccess ? (
        <div className="garden-empty">
          <p>No hay widgets visibles.</p>
          <span>Pulsa Personalizar para elegir qué quieres ver.</span>
        </div>
      ) : null}
      <footer className="garden-footer">
        <details>
          <summary>Cómo se calculan estos datos</summary>
          <p>
            La actividad cubre los últimos siete días
            {label(period.from) ? `, desde el ${humanDate(label(period.from).slice(0, 10))}` : ''}.
            Hoy sigue la zona horaria de tu cuenta. Las vencidas y el reparto por lista incluyen
            subtareas. El calendario muestra eventos externos; las tareas con fecha se consultan en
            Agenda.
          </p>
          <p>
            Los proyectos por revisar siguen el criterio existente: abiertos sin tareas pendientes o
            sin cambios en tareas durante más de 30 días. Las listas de notas y los proyectos
            cerrados quedan excluidos.
          </p>
          <p>
            Si una tarea importada no traía fecha de completado, cuenta el día de importación. Por
            eso una importación puede producir un pico de actividad.
          </p>
        </details>
      </footer>
    </section>
  );
}
