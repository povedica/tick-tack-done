import { runAction } from '../../components/run-action';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { closingRequest, type ClosingSession } from '../closing/api';
import { refreshTaskSurfaces } from '../tasks/refresh';
import './planning.css';

export function AdjustmentPage() {
  const m = useMessages();
  const cache = useQueryClient();
  const [session, setSession] = useState<ClosingSession | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    let cancelled = false;
    void api
      .getMe()
      .then(async (me) => {
        const zone = me.time_zone;
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        return closingRequest<ClosingSession>('/api/v1/planning/replan/sessions', 'POST', {
          local_date: date,
          time_zone: zone,
          apply_suggestions: false,
        });
      })
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function choose(id: string, decision: string, target: string | null) {
    if (!session || busy) return;
    setBusy(true);
    setError(false);
    try {
      const next = await closingRequest<ClosingSession>(
        `/api/v1/planning/replan/sessions/${session.id}/decisions/${id}`,
        'PUT',
        { decision, target_date: target },
      );
      setSession({ ...session, ...next });
      key.current = crypto.randomUUID();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!session || busy) return;
    setBusy(true);
    setError(false);
    try {
      await closingRequest(
        `/api/v1/planning/replan/sessions/${session.id}/apply`,
        'POST',
        { expected_revision: session.revision },
        key.current,
      );
      setApplied(true);
      await refreshTaskSurfaces(cache);
      await cache.invalidateQueries({ queryKey: ['day-plan-status'] });
      await cache.invalidateQueries({ queryKey: ['day-load'] });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const decisions = (session?.decisions ?? []).filter((item) => item.decision !== 'skip');
  const cards = session?.queue?.cards ?? [];
  return (
    <section className="screen-page plan-day">
      <header className="page-header">
        <div>
          <h1>{m.todayPlanTitle}</h1>
          <p className="lede">{m.planAdjustHint}</p>
        </div>
        <Link to="/today">{m.navToday}</Link>
      </header>
      {error ? <p role="alert">{m.settingsFailed}</p> : null}
      {!session && !error ? <p role="status">{m.saving}</p> : null}
      {applied ? (
        <p role="status">{m.saved}</p>
      ) : (
        <>
          {session?.load ? (
            <p className="plan-overview">
              {m.loadBefore}: {session.load.today.task_minutes} min /{' '}
              {session.load.today.available_minutes ?? '—'} min
            </p>
          ) : null}
          <ul className="plan-adjust-list">
            {cards.map((card) => {
              const picked = decisions.find((item) => item.task_id === card.task_id);
              return (
                <li key={card.task_id}>
                  <strong>{card.title}</strong>
                  {card.suggested ? (
                    <small>
                      {m.planSuggestion}: {card.suggested.target_date ?? m.somedayAction}
                    </small>
                  ) : null}
                  <div className="plan-adjust-actions">
                    <Button
                      size="sm"
                      variant={picked?.decision === 'skip' || !picked ? 'primary' : 'ghost'}
                      disabled={busy}
                      onClick={() => {
                        runAction(choose(card.task_id, 'skip', null));
                      }}
                    >
                      {m.planKeep}
                    </Button>
                    {card.suggested ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          runAction(
                            choose(
                              card.task_id,
                              card.suggested?.decision ?? 'skip',
                              card.suggested?.target_date ?? null,
                            ),
                          );
                        }}
                      >
                        {m.planUseSuggestion}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        runAction(choose(card.task_id, 'done', null));
                      }}
                    >
                      {m.decisionDone}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        runAction(choose(card.task_id, 'plan_day', null));
                      }}
                    >
                      {m.decisionTomorrow}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        runAction(choose(card.task_id, 'someday', null));
                      }}
                    >
                      {m.somedayAction}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        runAction(choose(card.task_id, 'cancel', null));
                      }}
                    >
                      {m.decisionCancel}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {decisions.length ? (
            <aside className="plan-preview">
              <h2>{m.planChangesPreview}</h2>
              <ul>
                {decisions.map((item) => (
                  <li key={item.task_id}>
                    <strong>{cards.find((card) => card.task_id === item.task_id)?.title}</strong> ·{' '}
                    {item.decision === 'done'
                      ? m.decisionDone
                      : item.decision === 'cancel'
                        ? m.decisionCancel
                        : item.decision === 'someday'
                          ? m.somedayAction
                          : m.decisionTomorrow}
                    {item.target_date ? ` · ${item.target_date}` : ''}
                  </li>
                ))}
              </ul>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  runAction(apply());
                }}
              >
                {m.applyReplan}
              </Button>
            </aside>
          ) : (
            <p className="ui-muted">{m.planKeepHint}</p>
          )}
        </>
      )}
    </section>
  );
}
