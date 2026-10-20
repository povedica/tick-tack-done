import { useState } from 'react';
import { Link } from 'react-router';
import { humanDate } from '@reflexionia/domain';
import { count, label, row, rows } from './model';

const STATES: Record<string, string> = {
  new: 'Nuevo',
  active: 'En marcha',
  stale: 'Sin actividad reciente',
  no_pending: 'Sin pendientes',
  closed: 'Cerrado',
  deleted: 'Eliminado',
  notes: 'Notas',
};
export function ProjectContext({ value }: { readonly value: unknown }) {
  const data = row(value);
  const projects = rows(data.items);
  const [filter, setFilter] = useState<'all' | 'review' | 'changes'>('all');
  const [search, setSearch] = useState('');
  const filtered = projects
    .filter(
      (item) =>
        (filter === 'all' ||
          (filter === 'review' && item.needs_review === true) ||
          (filter === 'changes' && (item.state === 'new' || item.state === 'deleted'))) &&
        label(item.name).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')),
    )
    .sort(
      (left, right) =>
        Number(right.needs_review === true) - Number(left.needs_review === true) ||
        Number(left.state === 'deleted') - Number(right.state === 'deleted') ||
        Number(left.state === 'closed') - Number(right.state === 'closed'),
    );
  return (
    <div className="garden-projects">
      <p className="garden-context">
        {String(count(data.open))} proyectos abiertos · {String(count(data.created_7d))}{' '}
        {count(data.created_7d) === 1 ? 'nuevo' : 'nuevos'} y {String(count(data.deleted_7d))}{' '}
        {count(data.deleted_7d) === 1 ? 'eliminado' : 'eliminados'} en los últimos 7 días
      </p>
      <div className="page-toolbar">
        <div className="segmented" role="group" aria-label="Filtrar proyectos">
          {(
            [
              ['all', 'Todos'],
              ['review', `Por revisar (${String(count(data.needs_review))})`],
              ['changes', 'Nuevos y eliminados'],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              className={filter === key ? 'is-active' : ''}
              onClick={() => {
                setFilter(key);
              }}
            >
              {text}
            </button>
          ))}
        </div>
        <input
          className="garden-project-search"
          type="search"
          aria-label="Buscar proyecto en Jardín"
          placeholder="Buscar proyecto"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="garden-empty">
          {projects.length === 0
            ? 'Aún no tienes proyectos. Crea una lista para organizar algo que quieras llevar adelante.'
            : 'No hay proyectos que coincidan con este filtro.'}
        </p>
      ) : (
        <ul className="garden-project-list">
          {filtered.map((item) => {
            const state = label(item.state);
            const last = label(item.last_activity_at);
            const reason =
              state === 'stale'
                ? `Sin cambios en tareas durante más de ${String(count(data.review_after_days))} días. Revisa si sigue vigente o necesita un próximo paso.`
                : state === 'no_pending'
                  ? 'No quedan tareas activas. Si el objetivo está cumplido, puedes cerrar el proyecto.'
                  : state === 'new'
                    ? 'Creado en los últimos 7 días.'
                    : state === 'closed'
                      ? 'Proyecto cerrado. Se conserva para consulta.'
                      : state === 'deleted'
                        ? 'Eliminado en los últimos 7 días.'
                        : state === 'notes'
                          ? 'Lista de notas: su valor no se mide por tareas completadas.'
                          : 'Actividad de tareas en los últimos 7 días.';
            return (
              <li key={label(item.id)}>
                <div className="garden-project-name">
                  <strong>
                    {state === 'deleted' ? (
                      label(item.name)
                    ) : (
                      <Link to={`/list/${label(item.id)}`}>{label(item.name)}</Link>
                    )}
                  </strong>
                  <span
                    className={`garden-project-state${item.needs_review === true ? ' needs-review' : ''}`}
                  >
                    {STATES[state] ?? 'Proyecto'}
                  </span>
                  <p>{reason}</p>
                </div>
                <div className="garden-project-activity">
                  <span>
                    <strong>{String(count(item.active_tasks))}</strong>{' '}
                    {count(item.active_tasks) === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                  <span>
                    {String(count(item.created_7d))}{' '}
                    {count(item.created_7d) === 1 ? 'creada' : 'creadas'} ·{' '}
                    {String(count(item.completed_7d))}{' '}
                    {count(item.completed_7d) === 1 ? 'completada' : 'completadas'}
                  </span>
                  <small>
                    {last
                      ? `Último cambio en tareas: ${humanDate(last.slice(0, 10))}`
                      : 'Todavía no hay actividad en tareas'}
                  </small>
                  {state === 'deleted' ? (
                    <span>Eliminado el {humanDate(label(item.deleted_at).slice(0, 10))}</span>
                  ) : (
                    <Link to={`/list/${label(item.id)}`}>
                      {item.needs_review === true ? 'Revisar proyecto' : 'Abrir proyecto'}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <details className="garden-project-method">
        <summary>Criterio para revisar proyectos</summary>
        <p>
          Se señalan proyectos abiertos sin tareas pendientes o sin cambios en tareas durante más de
          30 días. La actividad incluye tareas creadas, completadas, editadas o eliminadas y sus
          subtareas. La falta de actividad es una señal para revisar, no una conclusión sobre la
          utilidad del proyecto. Las listas de notas y los proyectos cerrados no reciben esta
          sugerencia.
        </p>
      </details>
    </div>
  );
}
