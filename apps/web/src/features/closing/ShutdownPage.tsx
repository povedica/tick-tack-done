import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMessages } from '../../i18n';
import { closingRequest, type ClosingSession } from './api';

export function ShutdownPage({ kind }: { readonly kind: 'shutdown' | 'replan' }) {
  const messages = useMessages();
  const [session, setSession] = useState<ClosingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  useEffect(() => {
    const path =
      kind === 'shutdown'
        ? '/api/v1/planning/shutdown/sessions'
        : '/api/v1/planning/replan/sessions';
    void closingRequest<ClosingSession>(path, 'POST', { local_date: today, time_zone: zone })
      .then(setSession)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : messages.settingsFailed);
      });
  }, [kind, messages.settingsFailed, today, zone]);

  async function choose(taskId: string, decision: string, target: string | null): Promise<void> {
    if (session === null) {
      return;
    }
    const root = kind === 'shutdown' ? 'shutdown' : 'replan';
    const next = await closingRequest<ClosingSession>(
      `/api/v1/planning/${root}/sessions/${session.id}/decisions/${taskId}`,
      'PUT',
      { decision, target_date: target },
    );
    setSession({ ...session, revision: next.revision });
  }

  async function apply(): Promise<void> {
    if (session === null) {
      return;
    }
    const root = kind === 'shutdown' ? 'shutdown' : 'replan';
    await closingRequest(
      `/api/v1/planning/${root}/sessions/${session.id}/apply`,
      'POST',
      { expected_revision: session.revision },
      crypto.randomUUID(),
    );
    setClosed(true);
  }

  const cards = session?.queue?.cards ?? [];
  return (
    <section className="plan">
      <h1>{kind === 'shutdown' ? messages.closeDay : messages.replanDay}</h1>
      {error !== null ? <p role="alert">{error}</p> : null}
      {closed ? (
        <p>{cards.length === 0 ? messages.dayClosedEmpty : messages.dayClosed}</p>
      ) : (
        <>
          {kind === 'shutdown' ? (
            <p>
              {messages.doneToday}: {session?.review?.done_today.length ?? 0}.{' '}
              {messages.focusMinutes}: {session?.review?.focus_minutes ?? 0}
            </p>
          ) : (
            <p>
              {messages.loadBefore}: {session?.load?.today.status ?? '…'} →{' '}
              {session?.load?.tomorrow.status ?? '…'}
            </p>
          )}
          {cards.length === 0 ? <p>{messages.dayClosedEmpty}</p> : null}
          <ul>
            {cards.map((card) => (
              <li key={card.task_id}>
                <strong>{card.title}</strong>
                {card.suggested?.reason !== undefined ? (
                  <span> — {card.suggested.reason}</span>
                ) : null}
                <div>
                  <button type="button" onClick={() => void choose(card.task_id, 'done', null)}>
                    {messages.decisionDone}
                  </button>
                  <button type="button" onClick={() => void choose(card.task_id, 'plan_day', null)}>
                    {messages.decisionTomorrow}
                  </button>
                  <button type="button" onClick={() => void choose(card.task_id, 'someday', null)}>
                    {messages.somedayAction}
                  </button>
                  <button type="button" onClick={() => void choose(card.task_id, 'cancel', null)}>
                    {messages.decisionCancel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {kind === 'replan' ? (
            <button type="button" onClick={() => void apply()}>
              {messages.applyProposal}
            </button>
          ) : null}
          <button type="button" onClick={() => void apply()}>
            {kind === 'shutdown' ? messages.closeDay : messages.applyReplan}
          </button>
        </>
      )}
      <p>
        <Link to="/today">{messages.navToday}</Link>
      </p>
    </section>
  );
}
