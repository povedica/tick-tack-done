/* Boceto navegable (no producción) de «Planifica tu día». Usa tokens, Button, Kbd, ProgressBar y lucide-react reales de ttd. */
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowRight,
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Cloud,
  Flag,
  GripVertical,
  Keyboard,
  Lightbulb,
  Repeat,
  SkipForward,
  Sun,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { Button, Kbd, ProgressBar } from '../../../components/ui';
import './triage-mock.css';
import { TriageReal } from './TriageReal';
import { SimpleMock } from './SimpleMock';

type Day = { key: string; top: string; sub: string; pct: number; free: string };
const DAYS: Day[] = [
  { key: 'd0', top: 'Hoy', sub: 'sáb 24', pct: 51, free: '3 h 40 libres' },
  { key: 'd1', top: 'Mañana', sub: 'dom 25', pct: 64, free: '2 h 40 libres' },
  { key: 'd2', top: 'Lun', sub: '26', pct: 52, free: '3 h 35 libres' },
  { key: 'd3', top: 'Mar', sub: '27', pct: 96, free: '20 min libres' },
  { key: 'd4', top: 'Mié', sub: '28', pct: 30, free: '5 h 15 libres' },
  { key: 'd5', top: 'Jue', sub: '29', pct: 12, free: '6 h 35 libres' },
];
const tone = (p: number) => (p > 100 ? 'is-over' : p > 85 ? 'is-tight' : 'is-ok');

type Act = {
  id: string;
  icon: ReactNode;
  label: string;
  effect: string;
  keys: string[];
  group: string;
  danger?: boolean;
  rec?: boolean;
};
const ACTS: Act[] = [
  {
    id: 'today',
    icon: <Sun size={18} />,
    label: 'Hoy',
    effect: 'Sin hora · +45 min hoy',
    keys: ['H'],
    group: 'Hacerla',
    rec: true,
  },
  {
    id: 'block',
    icon: <Clock size={18} />,
    label: 'Bloque horario',
    effect: 'Hoy 16:00 · o arrástrala',
    keys: ['B'],
    group: 'Hacerla',
  },
  {
    id: 'tomorrow',
    icon: <ArrowRight size={18} />,
    label: 'Mañana',
    effect: 'Dom 25 · quedará al 72 %',
    keys: ['M'],
    group: 'Moverla',
  },
  {
    id: 'other',
    icon: <CalendarDays size={18} />,
    label: 'Otro día…',
    effect: 'Eliges viendo la carga',
    keys: ['O'],
    group: 'Moverla',
  },
  {
    id: 'someday',
    icon: <Cloud size={18} />,
    label: 'Algún día',
    effect: 'Sin fecha, fuera del día',
    keys: ['A'],
    group: 'Moverla',
  },
  {
    id: 'done',
    icon: <CircleCheck size={18} />,
    label: 'Completar',
    effect: 'Ya está hecha',
    keys: ['Espacio'],
    group: 'Cerrarla',
  },
  {
    id: 'wont',
    icon: <Ban size={18} />,
    label: 'No haré',
    effect: 'A la lista «No haré»',
    keys: ['N'],
    group: 'Cerrarla',
  },
  {
    id: 'trash',
    icon: <Trash2 size={18} />,
    label: 'Eliminar',
    effect: 'A la papelera',
    keys: ['Supr'],
    group: 'Cerrarla',
    danger: true,
  },
];

function DayStrip({
  selected = 'd0',
  drop,
  compact,
}: {
  selected?: string;
  drop?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`tri-days ${compact ? 'is-compact' : ''}`}
      role="tablist"
      aria-label="Día que planificas"
    >
      <button type="button" className="ui-button is-ghost is-icon" aria-label="Día anterior">
        <ChevronLeft size={16} />
      </button>
      {DAYS.slice(0, compact ? 5 : 6).map((d) => (
        <button
          key={d.key}
          type="button"
          role="tab"
          aria-selected={d.key === selected}
          className={`tri-day ${tone(d.pct)} ${d.key === selected ? 'is-selected' : ''} ${d.key === drop ? 'is-drop' : ''}`}
        >
          <span className="tri-day-top">{d.top}</span>
          <span className="tri-day-sub">{d.sub}</span>
          <span className="tri-day-meter">
            <span style={{ width: `${Math.min(d.pct, 100)}%` }} />
          </span>
          <span className="tri-day-pct">
            {d.key === drop ? (d.key === 'd1' ? '64 → 72 %' : '52 → 59 %') : `${d.pct} %`}
          </span>
        </button>
      ))}
      <button type="button" className="ui-button is-ghost is-icon" aria-label="Día siguiente">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function Capacity({
  title,
  used,
  label,
  state,
  preview,
}: {
  title: string;
  used: number;
  label: string;
  state: string;
  preview?: number;
}) {
  return (
    <div className="tri-cap">
      <div className="tri-cap-head">
        <strong>{title}</strong>
        <span className={`tri-state ${state}`}>
          {state === 'is-ok' ? 'Cabe' : state === 'is-tight' ? 'Justo' : 'No cabe'}
        </span>
      </div>
      <div className="tri-cap-value">{label}</div>
      <div className="tri-meter" aria-hidden="true">
        <span className="is-events" style={{ width: '17%' }} />
        <span className="is-tasks" style={{ width: `${used}%` }} />
        {preview ? <span className="is-preview" style={{ width: `${preview}%` }} /> : null}
        <i style={{ left: '85%' }} />
      </div>
      <div className="tri-legend">
        <span>
          <b className="is-events" />
          Reuniones 1 h 30
        </span>
        <span>
          <b className="is-tasks" />
          Tareas
        </span>
        {preview ? (
          <span>
            <b className="is-preview" />
            Esta tarea
          </span>
        ) : null}
        <span>| margen 15 %</span>
      </div>
    </div>
  );
}

type Blk = { top: number; h: number; t: string; kind?: string };
function Timeline({
  ghost,
  hours = 9,
  compact,
}: {
  ghost?: Blk;
  hours?: number;
  compact?: boolean;
}) {
  const H = Array.from({ length: hours }, (_, i) => 9 + i);
  const blocks: Blk[] = [
    { top: 0, h: 0.5, t: 'Daily equipo', kind: 'event' },
    { top: 0.5, h: 1.5, t: 'Preparar propuesta cliente' },
    { top: 3, h: 1, t: 'Comida', kind: 'event' },
    { top: 4, h: 0.5, t: 'Llamar al taller' },
    { top: 4.5, h: 0.5, t: 'Repaso diario', kind: 'habit' },
  ];
  return (
    <div className={`tri-tl ${compact ? 'is-compact' : ''}`} aria-label="Línea de tiempo del día">
      {H.map((h) => (
        <div key={h} className="tri-hr">
          <span>{h}:00</span>
        </div>
      ))}
      {blocks.map((b) => (
        <div
          key={b.t}
          className={`tri-blk is-${b.kind ?? 'task'}`}
          style={{
            top: `calc(${b.top} * var(--tri-hour))`,
            height: `calc(${b.h} * var(--tri-hour) - 2px)`,
          }}
        >
          {b.kind === 'habit' ? <Repeat size={11} /> : null}
          {b.t}
        </div>
      ))}
      {ghost ? (
        <div
          className="tri-blk is-ghost"
          style={{
            top: `calc(${ghost.top} * var(--tri-hour))`,
            height: `calc(${ghost.h} * var(--tri-hour) - 2px)`,
          }}
        >
          {ghost.t}
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({
  dragging,
  hover,
  mobile,
}: {
  dragging?: boolean;
  hover?: string;
  mobile?: boolean;
}) {
  const groups = ['Hacerla', 'Moverla', 'Cerrarla'];
  return (
    <article className={`tri-card ${dragging ? 'is-dragging' : ''}`} aria-labelledby="tri-title">
      <div className="tri-card-top">
        {!mobile ? (
          <span className="tri-grip" title="Arrastra al día o a un bloque">
            <GripVertical size={16} />
          </span>
        ) : null}
        <span className="tri-chip is-danger">
          <TriangleAlert size={12} />
          Vencida hace 3 días
        </span>
        <span className="tri-chip">
          <Clock size={12} />
          45 min
        </span>
        <span className="tri-chip is-prio">
          <Flag size={12} />
          Media
        </span>
      </div>
      <h2 id="tri-title" className="tri-title">
        Revisar contrato del alquiler
      </h2>
      <p className="tri-meta">Casa · inicio mié 21 oct · sin subtareas</p>
      <p className="tri-suggest">
        <Lightbulb size={14} />
        <span>
          <strong>Te sugerimos Hoy:</strong> está vencida y hoy aún caben 3 h 40.
        </span>
      </p>
      {dragging ? null : (
        <>
          <p className="tri-question">¿Qué haces con esta tarea?</p>
          {groups.map((g) => (
            <div key={g} className="tri-group" role="group" aria-label={g}>
              <span className="tri-group-label">{g}</span>
              <div className={mobile ? 'tri-acts-list' : 'tri-acts'}>
                {ACTS.filter((a) => a.group === g).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-keyshortcuts={a.keys.join(' ')}
                    className={`tri-act ${a.rec ? 'is-rec' : ''} ${a.danger ? 'is-danger' : ''} ${hover === a.id ? 'is-hover' : ''}`}
                  >
                    <span className="tri-act-icon">{a.icon}</span>
                    <span className="tri-act-text">
                      <span className="tri-act-label">
                        {a.label}
                        {a.rec ? <span className="tri-rec">Sugerida</span> : null}
                      </span>
                      <span className="tri-act-effect">{a.effect}</span>
                    </span>
                    {mobile ? (
                      <ChevronRight size={16} className="tri-act-chev" />
                    ) : (
                      <span className="tri-act-keys">
                        {a.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </article>
  );
}

const QUEUE: [string, string, string?][] = [
  ['Vencidas', ''],
  ['Preparar propuesta cliente', 'Hoy'],
  ['Ordenar fotos del viaje', 'Lun 26'],
  ['Pagar recibo de la luz', 'Hecha'],
  ['Revisar contrato del alquiler', 'now'],
  ['Renovar el DNI', ''],
  ['Previstas para hoy', ''],
  ['Llamar al taller', '16:00'],
  ['Leer informe trimestral', 'No haré'],
  ['Comprar regalo de Ana', ''],
  ['Enviar factura de octubre', ''],
  ['Rutinas de hoy', ''],
  ['Repaso diario de pendientes', ''],
];
function Queue({ dragRow }: { dragRow?: boolean }) {
  return (
    <aside className="tri-queue" aria-label="Tareas por decidir">
      <div className="tri-queue-head">
        <strong>5 de 12 decididas</strong>
        <span className="ui-muted">≈ 2 min</span>
      </div>
      <ProgressBar value={42} />
      <ul>
        {QUEUE.map(([t, d], i) =>
          d === '' && ['Vencidas', 'Previstas para hoy', 'Rutinas de hoy'].includes(t) ? (
            <li key={i} className="tri-q-section">
              {t}
            </li>
          ) : (
            <li
              key={i}
              className={`tri-q ${d === 'now' ? 'is-current' : ''} ${d && d !== 'now' ? 'is-decided' : ''} ${dragRow && t === 'Renovar el DNI' ? 'is-lifted' : ''}`}
            >
              <GripVertical size={14} className="tri-q-grip" />
              <span className="tri-q-title">{t}</span>
              {d && d !== 'now' ? (
                <span className="tri-q-badge">{d}</span>
              ) : d === 'now' ? (
                <span className="tri-q-now">Ahora</span>
              ) : null}
            </li>
          ),
        )}
      </ul>
      <p className="tri-hint">Arrastra una fila al día o a la línea de tiempo.</p>
    </aside>
  );
}

function ShortcutBar() {
  return (
    <div className="tri-keys" aria-label="Atajos">
      <span>
        <Kbd>H</Kbd>
        <Kbd>B</Kbd>
        <Kbd>M</Kbd>
        <Kbd>O</Kbd>… acción
      </span>
      <span>
        <Kbd>S</Kbd> saltar
      </span>
      <span>
        <Kbd>←</Kbd> anterior
      </span>
      <span>
        <Kbd>Ctrl+Z</Kbd> deshacer
      </span>
      <span>
        <Kbd>⇧←/→</Kbd> cambiar de día
      </span>
      <span>
        <Kbd>?</Kbd> todos los atajos
      </span>
    </div>
  );
}

function Help() {
  const rows: [string, string][] = [
    ['H · 1', 'Hoy, sin hora'],
    ['B · 2', 'Bloque horario: ↑/↓ 15 min, ⇧↑/↓ 1 h, Intro coloca'],
    ['M · 3', 'Mañana'],
    ['O · 4', 'Otro día (←/→ elige día, Intro)'],
    ['A · 5', 'Algún día'],
    ['Espacio · C · 6', 'Completar'],
    ['N · 7', 'No haré'],
    ['Supr · 8', 'Eliminar (a la papelera)'],
    ['S · →', 'Saltar'],
    ['←', 'Tarea anterior'],
    ['Ctrl/Cmd+Z', 'Deshacer'],
    ['⇧← / ⇧→', 'Día anterior / siguiente (también RePág/AvPág)'],
    ['Inicio', 'Volver a hoy'],
    ['Intro', 'Revisar y confirmar'],
    ['Esc', 'Cerrar (guarda el borrador)'],
  ];
  return (
    <div className="ui-scrim" role="presentation">
      <div
        className="ui-modal tri-help"
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de Planifica tu día"
      >
        <h2>Atajos de Planifica tu día</h2>
        <div className="tri-help-cols">
          <table className="shortcut-table">
            <tbody>
              <tr>
                <th colSpan={2}>Decidir</th>
              </tr>
              {rows.slice(0, 8).map(([k, l]) => (
                <tr key={k}>
                  <td>{l}</td>
                  <td>
                    <Kbd>{k}</Kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="shortcut-table">
            <tbody>
              <tr>
                <th colSpan={2}>Moverse</th>
              </tr>
              {rows.slice(8).map(([k, l]) => (
                <tr key={k}>
                  <td>{l}</td>
                  <td>
                    <Kbd>{k}</Kbd>
                  </td>
                </tr>
              ))}
              <tr>
                <td>Arrastrar sin ratón</td>
                <td>
                  <Kbd>B</Kbd>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="ui-muted">
          Mientras planificas, estas teclas sustituyen a las globales (N, Espacio, ↑/↓). También
          funcionan con el ratón y el arrastre.
        </p>
        <Button variant="primary">Entendido</Button>
      </div>
    </div>
  );
}

function Desktop({ v }: { v: string }) {
  const drag = v === 'd-drag';
  const dragDay = v === 'd-dragday';
  const hover = v === 'd-hover' ? 'tomorrow' : undefined;
  return (
    <section className="tri-page is-desktop">
      <header className="tri-header">
        <div>
          <h1>Planifica tu día</h1>
          <p className="tri-lede">
            Decide qué haces con cada tarea; pasamos a la siguiente solo. Nada cambia hasta que
            confirmes.
          </p>
        </div>
        <div className="tri-header-actions">
          <Button variant="ghost">
            <Keyboard size={16} /> Atajos <Kbd>?</Kbd>
          </Button>
          <Button>Terminar luego</Button>
          <Button variant="primary">Revisar y confirmar (5)</Button>
        </div>
      </header>
      <div className="tri-planning">
        <span className="ui-muted">Planificando</span>
        <DayStrip drop={dragDay ? 'd2' : hover ? 'd1' : undefined} />
        {dragDay ? (
          <div className="tri-floating">
            <GripVertical size={14} />
            Renovar el DNI · 30 min → Lun 26
          </div>
        ) : null}
      </div>
      <div className="tri-cols">
        <Queue dragRow={dragDay} />
        <main className="tri-main">
          <div className="tri-main-top">
            <span className="ui-muted">Tarea 6 de 12</span>
            <span className="tri-nav">
              <Button variant="ghost" size="sm">
                <ChevronLeft size={14} /> Anterior
              </Button>
              <Button variant="ghost" size="sm">
                <Undo2 size={14} /> Deshacer
              </Button>
              <Button variant="ghost" size="sm">
                Saltar <SkipForward size={14} />
              </Button>
            </span>
          </div>
          {drag ? (
            <div className="tri-drop-hint">
              Suelta en la línea de tiempo para reservar un bloque, o en un día de arriba para
              moverla.
            </div>
          ) : null}
          <TaskCard dragging={drag} hover={hover} />
          {hover ? (
            <p className="tri-preview-line">
              Al elegir <strong>Mañana</strong>: sale de hoy (−45 min, hoy al 41 %) y mañana pasa
              del 64 % al 72 %.
            </p>
          ) : null}
          <ShortcutBar />
        </main>
        <aside className="tri-day-panel" aria-label="Así va tu día">
          <Capacity
            title="Hoy, sábado 24"
            used={hover ? 27 : 34}
            preview={drag ? 8 : undefined}
            label={
              hover
                ? '3 h 05 de 7 h 30 libres'
                : drag
                  ? '3 h 50 + 45 min de 7 h 30'
                  : '3 h 50 de 7 h 30 libres'
            }
            state="is-ok"
          />
          <Timeline
            ghost={
              drag
                ? { top: 7, h: 0.75, t: 'Soltar: 16:00–16:45 · Revisar contrato' }
                : hover
                  ? undefined
                  : { top: 7, h: 0.75, t: 'Bloque sugerido 16:00' }
            }
          />
        </aside>
      </div>
      {v === 'd-help' ? <Help /> : null}
    </section>
  );
}

function MobileHead({ step = '3 / 12', pct = 25 }: { step?: string; pct?: number }) {
  return (
    <>
      <div className="tri-m-head">
        <Button variant="ghost" className="is-icon" aria-label="Cerrar y guardar">
          <X size={18} />
        </Button>
        <strong>Planifica tu día</strong>
        <span className="ui-muted">{step}</span>
      </div>
      <ProgressBar value={pct} />
    </>
  );
}

function Mobile({ v }: { v: string }) {
  if (v === 'm-empty')
    return (
      <section className="tri-page is-mobile">
        <MobileHead step="" pct={0} />
        <div className="ui-empty tri-center">
          <Sun size={36} />
          <h2>Hoy no tienes nada pendiente</h2>
          <p>
            Ni vencidas ni previstas para hoy. ¿Planificamos mañana o traemos algo de la Bandeja?
          </p>
          <Button variant="primary">Planificar mañana</Button>
          <Button>Revisar la Bandeja (7)</Button>
        </div>
      </section>
    );
  if (v === 'm-error')
    return (
      <section className="tri-page is-mobile">
        <MobileHead step="7 / 12" pct={58} />
        <div className="ui-error tri-center" role="alert">
          <TriangleAlert size={32} />
          <h2>No hemos podido guardar tu día</h2>
          <p className="ui-muted">
            Sin conexión o el servidor no responde. Tus 7 decisiones siguen aquí; no se ha cambiado
            nada.
          </p>
          <Button variant="primary">Reintentar</Button>
        </div>
        <div className="tri-note">
          <strong>«Llamar al taller» cambió en otro dispositivo.</strong> La hemos quitado del
          resumen.
        </div>
      </section>
    );
  if (v === 'm-sum')
    return (
      <section className="tri-page is-mobile">
        <MobileHead step="12 / 12" pct={100} />
        <h1 className="tri-m-title">Así quedan tus días</h1>
        <div className="tri-sum-days">
          {DAYS.slice(0, 4).map((d) => (
            <div key={d.key} className={`tri-sum-day ${tone(d.pct)}`}>
              <span>
                {d.top} {d.sub}
              </span>
              <span className="tri-day-meter">
                <span style={{ width: `${Math.min(d.pct, 100)}%` }} />
              </span>
              <span>{d.key === 'd0' ? '78 %' : d.key === 'd1' ? '72 %' : `${d.pct} %`}</span>
            </div>
          ))}
        </div>
        <h2 className="tri-section">Lo que has decidido · 11</h2>
        <ul className="tri-sum-list">
          <li>
            <Sun size={16} />
            <span>Hoy</span>
            <span>4 tareas · 2 h 35</span>
          </li>
          <li>
            <Clock size={16} />
            <span>Bloque</span>
            <span>Revisar contrato · 16:00–16:45</span>
          </li>
          <li>
            <ArrowRight size={16} />
            <span>Mañana</span>
            <span>2 tareas · 1 h</span>
          </li>
          <li>
            <CalendarDays size={16} />
            <span>Lun 26</span>
            <span>1 tarea · 2 h</span>
          </li>
          <li>
            <CircleCheck size={16} />
            <span>Hecha</span>
            <span>1 tarea</span>
          </li>
          <li>
            <Ban size={16} />
            <span>No haré</span>
            <span>1 tarea</span>
          </li>
          <li>
            <SkipForward size={16} />
            <span>Saltadas</span>
            <span>1 · se quedan como estaban</span>
          </li>
        </ul>
        <p className="ui-muted tri-small">
          Cambia la fecha de inicio; ninguna fecha límite se mueve. Podrás deshacerlo.
        </p>
        <div className="tri-m-foot">
          <Button>Volver</Button>
          <Button variant="primary" className="tri-grow">
            Confirmar mi día
          </Button>
        </div>
      </section>
    );
  if (v === 'm-done')
    return (
      <section className="tri-page is-mobile">
        <div className="ui-empty tri-center">
          <CircleCheck size={40} />
          <h2>Día planificado</h2>
          <p>11 cambios. Hoy te quedan 1 h 40 libres.</p>
          <Button variant="primary">Ir a Hoy</Button>
          <Button>Planificar mañana</Button>
        </div>
        <div className="toast-stack tri-toast">
          <div className="toast" role="status">
            <span>Día planificado · 11 cambios</span>
            <button type="button">Deshacer</button>
          </div>
        </div>
      </section>
    );
  const sheet = v === 'm-days' || v === 'm-block';
  return (
    <section className={`tri-page is-mobile ${sheet ? 'has-sheet' : ''}`}>
      <MobileHead />
      <DayStrip compact />
      <div className="tri-m-cap">
        <span>
          Hoy: <strong>3 h 50</strong> de 7 h 30 libres
        </span>
        <span className="tri-state is-ok">Cabe</span>
      </div>
      <TaskCard mobile />
      <div className="tri-m-foot">
        <Button>
          <Undo2 size={16} /> Deshacer
        </Button>
        <span className="tri-grow" />
        <Button>
          Saltar <SkipForward size={16} />
        </Button>
      </div>
      {v === 'm-days' ? (
        <div className="tri-sheet" role="dialog" aria-label="Mover a otro día">
          <div className="tri-sheet-grab" />
          <h2>¿A qué día la mueves?</h2>
          <p className="ui-muted tri-small">
            Revisar contrato · 45 min. Ves cuánto queda libre cada día.
          </p>
          {DAYS.slice(1).map((d) => (
            <button
              key={d.key}
              type="button"
              className={`tri-day-row ${tone(d.pct)} ${d.key === 'd2' ? 'is-selected' : ''}`}
            >
              <span className="tri-day-row-name">
                {d.top === 'Mañana' ? 'Mañana, domingo 25' : `${d.top} ${d.sub}`}
              </span>
              <span className="tri-day-meter">
                <span style={{ width: `${Math.min(d.pct, 100)}%` }} />
              </span>
              <span className="tri-day-row-free">{d.pct > 85 ? 'Lleno' : d.free}</span>
            </button>
          ))}
          <button type="button" className="tri-day-row is-more">
            <CalendarDays size={16} /> Otra fecha…
          </button>
          <Button variant="primary" className="tri-full">
            Mover al lunes 26
          </Button>
        </div>
      ) : null}
      {v === 'm-block' ? (
        <div className="tri-sheet" role="dialog" aria-label="Bloque horario">
          <div className="tri-sheet-grab" />
          <h2>¿A qué hora, hoy?</h2>
          <p className="ui-muted tri-small">
            Arrastra el bloque o toca un hueco. Se ajusta cada 15 min.
          </p>
          <div className="tri-durs">
            {['15 min', '30 min', '45 min', '1 h'].map((d) => (
              <button
                key={d}
                type="button"
                className={`ui-button is-sm ${d === '45 min' ? 'is-primary' : ''}`}
              >
                {d}
              </button>
            ))}
          </div>
          <Timeline
            compact
            hours={6}
            ghost={{ top: 2.5, h: 0.75, t: '↕ 11:30–12:15 · Revisar contrato' }}
          />
          <Button variant="primary" className="tri-full">
            Reservar 11:30–12:15
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function TriageMock() {
  const [params] = useSearchParams();
  const v = params.get('v') ?? 'd-triage';
  const rs = params.get('s');
  if (rs) return <TriageReal s={Number(rs)} />;
  const sv = params.get('simple');
  if (sv) return <SimpleMock v={sv} />;
  return v.startsWith('d-') ? <Desktop v={v} /> : <Mobile v={v} />;
}
