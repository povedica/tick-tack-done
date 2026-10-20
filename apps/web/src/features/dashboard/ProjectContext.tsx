import { Link } from 'react-router';
import { count, label, row, rows } from './model';

export function ProjectContext({ value }: { readonly value: unknown }) {
  const data = row(value);
  const projects = rows(data.items)
    .filter(
      (item) => item.needs_review === true && item.state !== 'deleted' && item.state !== 'closed',
    )
    .slice(0, 3);
  return (
    <div className="garden-projects">
      {projects.length === 0 ? (
        <p className="garden-empty">Ningún proyecto necesita revisión.</p>
      ) : (
        <ul className="garden-project-list">
          {projects.map((item) => (
            <li key={label(item.id)}>
              <Link to={`/list/${label(item.id)}`}>{label(item.name)}</Link>
              <span>
                <strong>{String(count(item.active_tasks))}</strong>{' '}
                {count(item.active_tasks) === 1 ? 'pendiente' : 'pendientes'}
              </span>
              <p>
                {item.state === 'stale'
                  ? `Sin actividad en más de ${String(count(data.review_after_days))} días.`
                  : 'Sin tareas pendientes; revisa si está terminado.'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
