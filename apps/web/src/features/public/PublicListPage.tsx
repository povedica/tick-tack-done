import { BrandMark } from '../../components/BrandMark';
import { useMessages } from '../../i18n';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import './public-list.css';

interface PublicTask {
  readonly ref: string;
  readonly title: string;
  readonly notes: string | null;
  readonly status: 'active' | 'completed';
  readonly priority: string;
  readonly checklist: readonly { title: string; done: boolean }[];
  readonly subtasks: readonly { title: string; status: string }[];
}

interface PublicList {
  readonly name: string;
  readonly tasks: readonly PublicTask[];
}

export function PublicListPage() {
  const { token = '' } = useParams();
  const messages = useMessages();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'limited' | 'error'>(
    'loading',
  );
  const [list, setList] = useState<PublicList | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    document.title = 'Lista compartida';
    const robots = meta('robots', 'noindex, nofollow');
    const referrer = meta('referrer', 'no-referrer');
    return () => {
      robots.remove();
      referrer.remove();
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    setState('loading');
    void fetch(`/api/v1/public/lists/${encodeURIComponent(token)}`, { credentials: 'omit' })
      .then(async (response) => {
        if (cancel) {
          return;
        }
        if (response.status === 404) {
          setState('missing');
          return;
        }
        if (response.status === 429) {
          setState('limited');
          return;
        }
        if (!response.ok) {
          setState('error');
          return;
        }
        const body = (await response.json()) as PublicList;
        document.title = `${body.name} · ${messages.publicLinkReadonly}`;
        setList(body);
        setState('ready');
      })
      .catch(() => {
        if (!cancel) {
          setState('error');
        }
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  const active = list?.tasks.filter((task) => task.status === 'active') ?? [];
  const done = list?.tasks.filter((task) => task.status === 'completed') ?? [];

  return (
    <main className="public-list">
      <header className="public-list-bar">
        <BrandMark />
      </header>
      <p className="public-list-note" role="note">
        <strong>{messages.publicLinkReadonly}.</strong> {messages.publicLinkReadonlyBody}
      </p>
      {state === 'loading' ? <p>Cargando…</p> : null}
      {state === 'missing' ? <p>{messages.publicLinkMissing}</p> : null}
      {state === 'limited' ? <p>{messages.publicLinkLimited}</p> : null}
      {state === 'error' ? (
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          {messages.publicLinkRetry}
        </button>
      ) : null}
      {state === 'ready' && list !== null ? (
        <>
          <h1>{list.name}</h1>
          <ul>
            {active.map((task) => (
              <TaskRow key={task.ref} task={task} />
            ))}
          </ul>
          {done.length > 0 ? (
            <section>
              <button
                type="button"
                onClick={() => {
                  setShowDone((value) => !value);
                }}
              >
                {messages.publicLinkCompleted.replace('{count}', String(done.length))}
              </button>
              {showDone ? (
                <ul>
                  {done.map((task) => (
                    <TaskRow key={task.ref} task={task} />
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
      <p className="public-list-foot">
        <Link to="/register">{messages.publicLinkSignup}</Link>
      </p>
    </main>
  );
}

function TaskRow({ task }: { readonly task: PublicTask }) {
  return (
    <li>
      <span aria-disabled="true">{task.status === 'completed' ? '☑' : '☐'}</span> {task.title}
      {task.notes !== null && task.notes.length > 0 ? <p>{task.notes}</p> : null}
    </li>
  );
}

function meta(name: string, content: string): HTMLMetaElement {
  const element = document.createElement('meta');
  element.name = name;
  element.content = content;
  document.head.append(element);
  return element;
}
