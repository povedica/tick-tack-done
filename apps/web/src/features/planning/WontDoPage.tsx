import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { useAppLocale } from '../../i18n/locale';
import './planning.css';
export function WontDoPage() {
  const locale = useAppLocale();
  const text = locale.toLowerCase().startsWith('en') ? english : spanish;
  const [titles, setTitles] = useState<readonly { id: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listTasks({ status: 'cancelled', flat: true, limit: 100 })
      .then((page) => {
        if (!cancelled) {
          setTitles(page.items.map((task) => ({ id: task.id, title: task.title })));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <section className="screen-page plan-day">
      <header className="page-header">
        <h1>{text.wontDo}</h1>
        <p className="lede">{text.wontDoLede}</p>
      </header>
      {error !== null ? <p className="plan-error">{error}</p> : null}
      {titles.length === 0 ? <p className="ui-muted">{text.wontDoEmpty}</p> : null}
      <ul className="plan-cards">
        {titles.map((task) => (
          <li key={task.id} className="plan-card">
            <Link to={`/task/${task.id}`}>{task.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const spanish = {
  wontDo: 'No haré',
  wontDoLede: 'Estas tareas están canceladas. No cuentan como completadas.',
  wontDoEmpty: 'No hay tareas canceladas.',
};
const english = {
  wontDo: 'I won’t do it',
  wontDoLede: 'These tasks are cancelled. They do not count as completed.',
  wontDoEmpty: 'There are no cancelled tasks.',
};
