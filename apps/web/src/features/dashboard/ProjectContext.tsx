import { useMessages, fill } from '../../i18n';
import { Link } from 'react-router';
import { count, label, row, rows } from './model';

export function ProjectContext({ value }: { readonly value: unknown }) {
  const messages = useMessages();
  const data = row(value);
  const projects = rows(data.items)
    .filter(
      (item) => item.needs_review === true && item.state !== 'deleted' && item.state !== 'closed',
    )
    .slice(0, 3);
  return (
    <div className="garden-projects">
      {projects.length === 0 ? (
        <p className="garden-empty">{messages.projectsNoReview}</p>
      ) : (
        <ul className="garden-project-list">
          {projects.map((item) => (
            <li key={label(item.id)}>
              <Link to={`/list/${label(item.id)}`}>{label(item.name)}</Link>
              <span>
                <strong>{String(count(item.active_tasks))}</strong>{' '}
                {count(item.active_tasks) === 1
                  ? messages.projectPendingOne
                  : messages.projectPendingMany}
              </span>
              <p>
                {item.state === 'stale'
                  ? fill(messages.projectStale, String(count(data.review_after_days)))
                  : messages.projectReviewComplete}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
