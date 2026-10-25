/* Boceto SIMPLIFICADO (no producción) de «Planifica tu día». Look real de ttd. Datos inventados. */
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import {
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Flag,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Repeat,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { Button, Kbd, TagChip } from '../../../components/ui';
import { TASKS, type RTask } from './realData';
import './simple-mock.css';

const T = (id: string) => TASKS.find((t) => t.id === id) as RTask;
const contrato: RTask = { ...T('contrato'), dur: null };
type Day = { k: string; name: string; date: string; load: 'ok' | 'tight' | 'over' | 'off' };
const DAYS: Day[] = [
  { k: 'd0', name: 'Hoy', date: '26', load: 'tight' },
  { k: 'd1', name: 'Mañana', date: '27', load: 'ok' },
  { k: 'd2', name: 'Mié', date: '28', load: 'tight' },
  { k: 'd3', name: 'Jue', date: '29', load: 'over' },
  { k: 'd4', name: 'Vie', date: '30', load: 'ok' },
  { k: 'd5', name: 'Sáb', date: '31', load: 'off' },
];
const loadWord = { ok: 'Cabe', tight: 'Va justo', over: 'Lleno', off: 'Libre' };

function Meta({ t, compact }: { t: RTask; compact?: boolean }) {
  return (
    <div className={`sp-meta ${compact ? 'is-compact' : ''}`}>
      {t.overdue ? (
        <span className="sp-late">
          {t.when.replace('Venció el ', '')} · hace {t.overdue} {t.overdue === 1 ? 'día' : 'días'}
        </span>
      ) : (
        <span>{t.when}</span>
      )}
      <span className="sp-proj">
        <span className="sp-dot" style={{ background: t.color }} />
        {t.project}
      </span>
      {t.prio !== 'none' ? (
        <span style={{ color: `var(--prio-${t.prio})` }}>
          <Flag size={13} /> {{ high: 'Alta', medium: 'Media', low: 'Baja' }[t.prio as 'high']}
        </span>
      ) : null}
      {t.rec ? (
        <span>
          <Repeat size={13} /> {t.rec}
        </span>
      ) : null}
    </div>
  );
}
function Extras({ t }: { t: RTask }) {
  return (
    <div className="sp-extras">
      {t.tags.map((g) => (
        <TagChip key={g} label={g} />
      ))}
      {t.sub ? (
        <span>
          <ListChecks size={14} /> {t.sub[0]}/{t.sub[1]}
        </span>
      ) : null}
      {t.check ? (
        <span>
          <ListChecks size={14} /> {t.check[0]}/{t.check[1]}
        </span>
      ) : null}
    </div>
  );
}
function Files({ t }: { t: RTask }) {
  return t.attach ? (
    <div className="sp-files">
      {t.attach.map((a) => (
        <span key={a} className="sp-file">
          <Paperclip size={14} />
          {a.split(' · ')[0]}
        </span>
      ))}
    </div>
  ) : null;
}

function Duration({ sel = '30 min' }: { sel?: string }) {
  return (
    <div className="sp-dur" role="radiogroup" aria-label="Duración">
      <Clock size={15} className="sp-ink3" />
      {['15 min', '30 min', '45 min', '1 h', 'Otra'].map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={d === sel}
          className={`sp-chip ${d === sel ? 'is-on' : ''}`}
        >
          {d}
        </button>
      ))}
      <span className="sp-sep" />
      <button type="button" className="sp-chip is-ghost">
        Sin hora ▾
      </button>
    </div>
  );
}

/* ---------- escritorio ---------- */
type QItem = { id: string; dest?: string };
const QUEUE: QItem[] = [
  { id: 'dni', dest: 'Hoy 11:00' },
  { id: 'fotos', dest: 'Vie 30' },
  { id: 'iva', dest: 'Hoy' },
  { id: 'contrato' },
  { id: 'weekly' },
  { id: 'excursion' },
  { id: 'propuesta' },
  { id: 'moto' },
  { id: 'factura' },
  { id: 'repaso' },
  { id: 'grafana' },
  { id: 'pintar' },
];
function Queue({ cur }: { cur: string }) {
  const done = QUEUE.filter((q) => q.dest).length;
  return (
    <aside className="sp-queue" aria-label="Por decidir">
      <div className="sp-qhead">
        <strong>Por decidir</strong>
        <span className="sp-ink3">
          {done + 1} de {QUEUE.length}
        </span>
      </div>
      <div className="sp-progress">
        <span style={{ width: `${(done / QUEUE.length) * 100}%` }} />
      </div>
      <ul>
        {QUEUE.map((q) => {
          const t = T(q.id);
          return (
            <li
              key={q.id}
              className={`sp-q ${q.id === cur ? 'is-current' : ''} ${q.dest ? 'is-done' : ''}`}
            >
              {q.dest ? (
                <Check size={14} className="sp-q-ic" />
              ) : (
                <span className="sp-dot" style={{ background: t.color }} />
              )}
              <span className="sp-q-title">{t.title}</span>
              {q.dest ? (
                <span className="sp-q-dest">{q.dest}</span>
              ) : t.overdue ? (
                <span className="sp-q-late" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

type Blk = { from: number; to: number; t: string; kind?: 'event' | 'task' | 'ghost' };
const TODAY: Blk[] = [
  { from: 9, to: 9.5, t: 'Daily del equipo', kind: 'event' },
  { from: 10, to: 11, t: 'Revisión del sprint', kind: 'event' },
  { from: 11, to: 11.5, t: 'Cita previa DNI', kind: 'task' },
  { from: 12, to: 12.75, t: '1:1 con Laura', kind: 'task' },
  { from: 13.5, to: 14.5, t: 'Comida', kind: 'event' },
  { from: 15.5, to: 16.25, t: 'Llamada proveedor', kind: 'event' },
  { from: 16.5, to: 17.25, t: 'Recoger a Martín y Lucía', kind: 'event' },
];
const TUE: Blk[] = [
  { from: 9, to: 9.5, t: 'Daily del equipo', kind: 'event' },
  { from: 11, to: 12.5, t: 'Planning sprint 44', kind: 'event' },
  { from: 13.5, to: 14.5, t: 'Comida', kind: 'event' },
  { from: 17, to: 17.75, t: 'Tutoría de Lucía', kind: 'task' },
];
const hh = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
function Timeline({ blocks, ghost }: { blocks: Blk[]; ghost?: Blk }) {
  const all = ghost ? [...blocks, ghost] : blocks;
  return (
    <div className="sp-tl">
      {Array.from({ length: 10 }, (_, i) => 9 + i).map((h) => (
        <div key={h} className="sp-hr">
          <span>{h}:00</span>
        </div>
      ))}
      {all.map((b) => (
        <div
          key={b.t}
          className={`sp-blk is-${b.kind ?? 'task'}`}
          style={{
            top: `calc(${b.from - 9} * var(--sp-hour))`,
            height: `calc(${b.to - b.from} * var(--sp-hour) - 2px)`,
          }}
        >
          <span>
            {b.kind === 'ghost' ? (
              b.t
            ) : (
              <>
                <em>{hh(b.from)}</em> {b.t}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
function DayRail({ sel = 'd0', drop }: { sel?: string; drop?: string }) {
  return (
    <div className="sp-rail" aria-label="Días">
      <button
        type="button"
        className="ui-button is-ghost is-icon is-sm"
        aria-label="Días anteriores"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="sp-rail-days">
        {DAYS.slice(0, 5).map((d) => (
          <button
            key={d.k}
            type="button"
            className={`sp-day is-${d.load} ${d.k === sel ? 'is-sel' : ''} ${d.k === drop ? 'is-drop' : ''}`}
          >
            <span className="sp-day-n">{d.name}</span>
            <span className="sp-day-d">{d.date}</span>
            <span className="sp-day-bar" />
          </button>
        ))}
      </div>
      <button
        type="button"
        className="ui-button is-ghost is-icon is-sm"
        aria-label="Días siguientes"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
function DayPanel({ tue, ghost, drop }: { tue?: boolean; ghost?: Blk; drop?: string }) {
  const d = tue ? DAYS[1] : DAYS[0];
  return (
    <aside className="sp-panel" aria-label="Tu día">
      <DayRail sel={tue ? 'd1' : 'd0'} drop={drop} />
      <div className="sp-dayhead">
        <strong>{tue ? 'Martes 27' : 'Hoy, lunes 26'}</strong>
        <span className={`sp-load is-${d.load}`}>
          <i />
          {loadWord[d.load]} · {tue ? '3 h 10 libres' : '50 min libres'}
        </span>
      </div>
      <Timeline blocks={tue ? TUE : TODAY} ghost={ghost} />
      <p className="sp-untimed">{tue ? 'Sin hora: 2 tareas' : 'Sin hora: 5 tareas'}</p>
    </aside>
  );
}

function Actions() {
  const main: [string, ReactNode, string][] = [
    ['Hoy', <Sun size={18} key="i" />, 'H'],
    ['Mañana', <ArrowRight size={18} key="i" />, 'M'],
    ['Otro día', <CalendarDays size={18} key="i" />, 'O'],
  ];
  return (
    <div className="sp-actions">
      <div className="sp-act-group">
        {main.map(([l, i, k]) => (
          <button key={l} type="button" className="sp-act">
            {i}
            <span>{l}</span>
            <Kbd>{k}</Kbd>
          </button>
        ))}
      </div>
      <div className="sp-act-group is-close">
        <button type="button" className="sp-act is-quiet">
          <CircleCheck size={18} />
          <span>Hecha</span>
          <Kbd>C</Kbd>
        </button>
        <button type="button" className="sp-act is-quiet">
          <Ban size={18} />
          <span>No lo haré</span>
          <Kbd>N</Kbd>
        </button>
        <button
          type="button"
          className="ui-button is-ghost is-icon"
          aria-label="Más: Algún día, Eliminar"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
function Footer({ sum }: { sum?: boolean }) {
  if (sum)
    return (
      <footer className="sp-foot">
        <span>
          <Kbd>Intro</Kbd> confirmar
        </span>
        <span>
          <Kbd>Esc</Kbd> volver a decidir
        </span>
      </footer>
    );
  return (
    <footer className="sp-foot" aria-label="Atajos">
      <span>
        <Kbd>H</Kbd> Hoy
      </span>
      <span>
        <Kbd>M</Kbd> Mañana
      </span>
      <span>
        <Kbd>O</Kbd> Otro día
      </span>
      <span>
        <Kbd>C</Kbd> Hecha
      </span>
      <span>
        <Kbd>N</Kbd> No lo haré
      </span>
      <span>
        <Kbd>1</Kbd>…<Kbd>4</Kbd> duración
      </span>
      <span>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd> anterior / siguiente
      </span>
      <span>
        <Kbd>Ctrl+Z</Kbd> deshacer
      </span>
      <span>
        <Kbd>?</Kbd> más
      </span>
      <span>
        <GripVertical size={12} /> arrastra a la agenda o a un día
      </span>
    </footer>
  );
}
function Head({ n }: { n: number }) {
  return (
    <header className="sp-head">
      <div>
        <h1>Planifica tu día</h1>
        <p className="sp-ink3">Lunes 26 de octubre</p>
      </div>
      <div className="sp-head-act">
        <Button variant="ghost">
          <Undo2 size={16} /> Deshacer
        </Button>
        <Button variant="ghost">Terminar luego</Button>
        <Button variant="primary">Revisar plan ({n})</Button>
      </div>
    </header>
  );
}

function Desktop({ drag }: { drag?: boolean }) {
  const t = contrato;
  return (
    <section className="sp-page">
      <Head n={3} />
      <div className="sp-cols">
        <Queue cur="contrato" />
        <main className="sp-main">
          <article className={`sp-card ${drag ? 'is-lifted' : ''}`}>
            <div className="sp-card-top">
              <span className="sp-grip" title="Arrastra a la agenda o a un día">
                <GripVertical size={16} />
              </span>
              <Meta t={t} />
            </div>
            <h2 className="sp-title">{t.title}</h2>
            <Extras t={t} />
            <div className="sp-desc detail-markdown">
              <Markdown>{t.desc}</Markdown>
            </div>
            <Files t={t} />
            <div className="sp-decide">
              <Duration />
              <Actions />
            </div>
          </article>
          {drag ? (
            <div className="sp-dragging">
              <GripVertical size={14} /> Revisar contrato del alquiler… · 30 min
            </div>
          ) : null}
        </main>
        <DayPanel
          tue={drag}
          drop={undefined}
          ghost={
            drag
              ? { from: 9.5, to: 10, t: '9:30 – 10:00 · Revisar contrato', kind: 'ghost' }
              : undefined
          }
        />
      </div>
      <Footer />
    </section>
  );
}

function DesktopSummary() {
  const today: [string, string][] = [
    ['11:00', 'Pedir cita previa DNI'],
    ['12:00', '1:1 con Laura'],
    ['', 'Llamar a la gestoría · IVA'],
    ['', 'Propuesta Kubernetes para el comité'],
    ['', 'Llevar la moto al taller'],
    ['', 'Enviar factura de octubre a Acme'],
    ['', 'Repaso diario de pendientes'],
  ];
  const moved: [string, string[]][] = [
    ['Mañana, mar 27', ['Revisar contrato Cadaqués', 'Revisión semanal']],
    ['Viernes 30', ['Ordenar fotos de Londres']],
    ['Mié 28', ['Presupuesto para pintar']],
    ['Algún día', ['Informe de rendimiento del clúster']],
  ];
  return (
    <section className="sp-page">
      <header className="sp-head">
        <div>
          <h1>Tu plan para hoy</h1>
          <p className="sp-ink3">Aún no se ha cambiado nada. Confirma cuando te parezca bien.</p>
        </div>
        <div className="sp-head-act">
          <Button variant="ghost">
            <ChevronLeft size={16} /> Volver
          </Button>
          <Button variant="primary">
            Confirmar plan <Kbd>Intro</Kbd>
          </Button>
        </div>
      </header>
      <div className="sp-sum">
        <div className="sp-sum-col">
          <div className="sp-dayhead">
            <strong>Hoy, lunes 26</strong>
            <span className="sp-load is-tight">
              <i />
              Va justo · 50 min libres
            </span>
          </div>
          <ul className="sp-sum-list">
            {today.map(([h, t]) => (
              <li key={t}>
                <span className="sp-sum-h">{h || '—'}</span>
                {t}
              </li>
            ))}
          </ul>
          <p className="sp-ink3 sp-small">
            <CircleCheck size={14} /> Autorización excursión de Martín: hecha
          </p>
        </div>
        <div className="sp-sum-col">
          <div className="sp-dayhead">
            <strong>Para otros días</strong>
            <span className="sp-ink3">5 tareas</span>
          </div>
          {moved.map(([d, ts]) => (
            <div key={d} className="sp-sum-group">
              <h3>{d}</h3>
              <ul className="sp-sum-list">
                {ts.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <Footer sum />
    </section>
  );
}

/* ---------- móvil ---------- */
function MTop({ i, undo }: { i: string; undo?: boolean }) {
  return (
    <div className="sm-top">
      <button type="button" className="ui-button is-ghost is-icon" aria-label="Cerrar">
        <X size={22} />
      </button>
      <span className="sm-count">{i}</span>
      <span className="sm-top-r">
        <button type="button" className="ui-button is-ghost is-icon" aria-label="Anterior">
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          className="ui-button is-ghost is-icon"
          aria-label="Deshacer"
          disabled={!undo}
        >
          <Undo2 size={20} />
        </button>
      </span>
    </div>
  );
}
function MCard({ t, peekPrev }: { t: RTask; peekPrev?: boolean }) {
  return (
    <div className={`sm-track ${peekPrev ? 'has-prev' : ''}`}>
      {peekPrev ? <div className="sm-card is-peek is-prev" /> : null}
      <article className="sm-card">
        <div className="sm-card-head">
          <Meta t={t} compact />
          <button type="button" className="ui-button is-ghost is-icon is-sm" aria-label="Más">
            <MoreHorizontal size={18} />
          </button>
        </div>
        <h2 className="sm-title">{t.title}</h2>
        <div className="sp-extras">
          <span className="sm-dur">
            <Clock size={13} />{' '}
            {t.dur ? (t.dur >= 60 ? `${t.dur / 60} h` : `${t.dur} min`) : '30 min'}
          </span>
          {t.tags.map((g) => (
            <TagChip key={g} label={g} />
          ))}
          {t.sub ? (
            <span>
              <ListChecks size={14} /> {t.sub[0]}/{t.sub[1]}
            </span>
          ) : null}
        </div>
        <div className="sm-desc detail-markdown">
          <Markdown>{t.desc}</Markdown>
        </div>
        <Files t={t} />
      </article>
      <div className="sm-card is-peek" />
    </div>
  );
}
function MBar() {
  const a: [string, ReactNode][] = [
    ['Hecha', <CircleCheck size={22} key="i" />],
    ['Hoy', <Sun size={22} key="i" />],
    ['Mañana', <ArrowRight size={22} key="i" />],
    ['Otro día', <CalendarDays size={22} key="i" />],
    ['No lo haré', <Ban size={22} key="i" />],
  ];
  return (
    <nav className="sm-bar">
      {a.map(([l, i]) => (
        <button key={l} type="button">
          {i}
          <span>{l}</span>
        </button>
      ))}
    </nav>
  );
}
function Mobile({ v }: { v: string }) {
  if (v === 'm4') {
    return (
      <section className="sm-page">
        <div className="sm-top">
          <button type="button" className="ui-button is-ghost is-icon" aria-label="Volver">
            <ChevronLeft size={22} />
          </button>
          <span className="sm-count">Resumen</span>
          <span />
        </div>
        <div className="sm-sum">
          <h2>Tu día está listo</h2>
          <p className="sp-ink3">12 tareas decididas. Aún no se ha cambiado nada.</p>
          <div className="sm-sum-card">
            <div className="sp-dayhead">
              <strong>Hoy</strong>
              <span className="sp-load is-tight">
                <i />
                Va justo
              </span>
            </div>
            <ul className="sp-sum-list">
              {[
                ['11:00', 'Cita previa DNI'],
                ['12:00', '1:1 con Laura'],
                ['', 'Propuesta Kubernetes'],
                ['', 'Moto al taller'],
                ['', 'Factura Acme'],
                ['', '+2 más'],
              ].map(([h, t]) => (
                <li key={t} className={t.startsWith('+') ? 'is-more' : ''}>
                  <span className="sp-sum-h">{t.startsWith('+') ? '' : h || '—'}</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="sm-sum-card">
            <div className="sp-dayhead">
              <strong>Lo demás</strong>
              <span />
            </div>
            <ul className="sp-sum-list is-rows">
              {[
                ['Mañana', '2'],
                ['Vie 30', '2'],
                ['Algún día', '1'],
                ['Hechas', '1'],
              ].map(([d, n]) => (
                <li key={d}>
                  <span>{d}</span>
                  <span className="sp-ink3">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="sm-cta">
          <Button variant="primary" className="sm-full">
            Confirmar plan
          </Button>
          <Button variant="ghost" className="sm-full">
            Volver a revisar
          </Button>
        </div>
      </section>
    );
  }
  const t = v === 'm3' ? T('weekly') : contrato;
  return (
    <section className="sm-page">
      <MTop i={v === 'm3' ? '4 / 12' : '3 / 12'} undo={v !== 'm1'} />
      <MCard t={t} peekPrev={v === 'm3'} />
      {v === 'm3' ? (
        <div className="sm-toast">
          <Check size={16} />
          <span>
            Contrato → <strong>vie 30, 9:30</strong>
          </span>
          <button type="button">Deshacer</button>
        </div>
      ) : null}
      <MBar />
      {v === 'm2' ? (
        <div className="sm-scrim">
          <div className="sm-sheet" role="dialog" aria-label="Otro día">
            <div className="sm-grab" />
            <h3>¿Cuándo?</h3>
            <div className="sm-days">
              {DAYS.map((d) => (
                <button
                  key={d.k}
                  type="button"
                  className={`sp-day is-${d.load} ${d.k === 'd4' ? 'is-sel' : ''}`}
                >
                  <span className="sp-day-n">{d.name}</span>
                  <span className="sp-day-d">{d.date}</span>
                  <span className="sp-day-bar" />
                </button>
              ))}
            </div>
            <button type="button" className="sm-link">
              <CalendarDays size={16} /> Elegir otra fecha
            </button>
            <h4>
              Hora <span className="sp-ink3">(opcional)</span>
            </h4>
            <div className="sm-chips">
              {['Sin hora', '9:30', '12:45', '16:00'].map((h) => (
                <button key={h} type="button" className={`sp-chip ${h === '9:30' ? 'is-on' : ''}`}>
                  {h}
                </button>
              ))}
            </div>
            <h4>Duración</h4>
            <div className="sm-chips">
              {['15 min', '30 min', '45 min', '1 h', 'Otra'].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`sp-chip ${d === '30 min' ? 'is-on' : ''}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <Button variant="primary" className="sm-full">
              Planificar el viernes 30 a las 9:30
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SimpleMock({ v }: { v: string }) {
  if (v === 'd1') return <Desktop />;
  if (v === 'd2') return <Desktop drag />;
  if (v === 'd3') return <DesktopSummary />;
  return <Mobile v={v} />;
}
