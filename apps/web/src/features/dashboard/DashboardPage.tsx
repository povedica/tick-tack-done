import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  GripVertical,
  Leaf,
  Settings2,
  TrendingUp,
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
  const score = useQuery({ queryKey: ['achievements'], queryFn: () => api.achievements() });
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
  const flow = row(widgets.flow);
  const load = rows(row(widgets.load).by_list);
  const week = row(widgets.completed_week);
  const habits = row(widgets.habits);
  const calendar = row(widgets.calendar);
  const connections = row(widgets.integrations);
  const period = row(data.data?.period);
  const updated = label(data.data?.generated_at);

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
            <p>
              <TrendingUp size={14} aria-hidden="true" />{' '}
              {count(week.trend) === 0
                ? 'Igual que los 7 días anteriores'
                : `${count(week.trend) > 0 ? '+' : ''}${number(count(week.trend))} frente a los 7 días anteriores`}
            </p>
          </>
        );
      case 'overdue':
        return (
          <>
            <strong className={`garden-metric${overdue === 0 ? '' : ' is-attention'}`}>
              {number(count(widgets.overdue))}
            </strong>
            <p>
              {overdue === 0
                ? 'No tienes tareas vencidas.'
                : 'Tareas vencidas para revisar con calma.'}
            </p>
          </>
        );
      case 'next_7_days':
        return (
          <>
            <strong className="garden-metric">{number(count(widgets.next_7_days))}</strong>
            <p>Tareas con fecha por delante.</p>
          </>
        );
      case 'flow': {
        const max = Math.max(1, count(flow.created), count(flow.completed));
        return (
          <>
            <p className="garden-context">Entradas y salidas · últimos 7 días</p>
            <div className="garden-bars">
              {[
                ['Creadas', count(flow.created)],
                ['Completadas', count(flow.completed)],
              ].map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <div className="garden-track">
                    <span style={{ width: `${String((Number(value) / max) * 100)}%` }} />
                  </div>
                  <strong>{number(Number(value))}</strong>
                </div>
              ))}
            </div>
            <p className="garden-insight">
              {count(flow.net) < 0
                ? `${number(-count(flow.net))} tareas más entraron de las que completaste.`
                : count(flow.net) > 0
                  ? `Has completado ${number(count(flow.net))} tareas más de las que has creado.`
                  : 'Has completado tantas tareas como has creado.'}
            </p>
          </>
        );
      }
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
            <p>Sin hábitos configurados.</p>
            <span>Crea tu primer hábito y sigue aquí tu constancia.</span>
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
      case 'integrations':
        return (
          <>
            <p className="garden-context">Conexiones de tu cuenta</p>
            <ul className="garden-connections">
              {(
                [
                  ['Telegram', connections.telegram],
                  ['Google Calendar', connections.google],
                  ['Google Drive', connections.drive],
                ] as const
              ).map(([name, connected]) => (
                <li key={name}>
                  <span>{name}</span>
                  <span className={connected === true ? 'is-connected' : ''}>
                    {connected === true ? <Check size={14} aria-hidden="true" /> : null}
                    {connected === true ? 'Conectado' : 'Sin conectar'}
                  </span>
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
        <Link
          className="ui-button is-primary is-md"
          to={overdue !== null && overdue > 0 ? '/review/weekly' : '/today'}
        >
          {overdue !== null && overdue > 0 ? 'Revisar mis pendientes' : 'Ir a mi día'}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className="ui-button is-secondary is-md" to="/reports/weekly">
          Ver mi reporte semanal
        </Link>
      </nav>
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
              ver.
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
          {visible.map((item) => (
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
                      integrations: 'Gestionar conexiones',
                      calendar: 'Abrir Agenda',
                      next_countdowns: 'Ver mis fechas',
                      load: 'Ver todas mis tareas',
                      overdue: 'Revisar pendientes',
                      next_7_days: 'Ver próximas tareas',
                      completed_today: 'Ver completadas',
                      completed_week: 'Explorar estadísticas',
                      flow: 'Ver mi actividad',
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
      {visible.length === 0 && data.isSuccess && layout.isSuccess ? (
        <div className="garden-empty">
          <p>No hay widgets visibles.</p>
          <span>Pulsa Personalizar para elegir qué quieres ver.</span>
        </div>
      ) : null}
      <footer className="garden-footer">
        <div>
          <Leaf size={18} aria-hidden="true" />
          <span>
            {score.isPending
              ? 'Cargando logros…'
              : score.isError
                ? 'Logros no disponibles.'
                : score.data.enabled === true
                  ? `Logros activos · ${number(count(score.data.score))} puntos`
                  : 'Logros desactivados.'}
          </span>
          <Link to="/settings/features">Configurar logros</Link>
        </div>
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
            Si una tarea importada no traía fecha de completado, cuenta el día de importación. Por
            eso una importación puede producir un pico de actividad.
          </p>
        </details>
      </footer>
    </section>
  );
}
