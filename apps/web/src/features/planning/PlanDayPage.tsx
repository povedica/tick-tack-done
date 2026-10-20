import { ApiError } from '@reflexionia/sdk';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { closingRequest } from '../closing/api';
import { useAppLocale } from '../../i18n/locale';
import './planning.css';

type Decision = 'done' | 'plan_day' | 'later' | 'someday' | 'cancel' | 'trash' | 'skip';

interface PlanCard {
  readonly task_id: string;
  readonly title: string;
  readonly section: string;
  readonly reason_text: string;
  readonly project_name: string;
}

interface PlanDecisionRow {
  readonly task_id: string;
  readonly decision: Decision;
  readonly target_date: string | null;
}

interface PlanEffect {
  readonly task_id: string;
  readonly summary: string;
}

interface PlanSession {
  readonly id: string;
  readonly local_date: string;
  readonly revision: number;
  readonly state: string;
  readonly hidden_overdue: number;
  readonly cards: readonly PlanCard[];
  readonly decisions: readonly PlanDecisionRow[];
  readonly preview: {
    readonly effects: readonly PlanEffect[];
  };
}

interface AppliedPlan {
  readonly applied: readonly {
    readonly task_id: string;
    readonly decision: string;
    readonly effect: string;
  }[];
}

const DECISIONS = ['done', 'plan_day', 'later', 'someday', 'cancel', 'trash'] as const;

export function PlanDayPage() {
  const locale = useAppLocale();
  const text: Copy = locale.toLowerCase().startsWith('en') ? english : spanish;
  const [session, setSession] = useState<PlanSession | null>(null);
  const [applied, setApplied] = useState<AppliedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [loadLine, setLoadLine] = useState<string | null>(null);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
    let cancelled = false;
    api
      .getMe()
      .then((me) => {
        const timeZone = me.time_zone || zone;
        const localDate = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        void closingRequest<{
          task_minutes: number;
          available_minutes: number | null;
          status: string;
        }>(
          `/api/v1/planning/load?date=${localDate}&time_zone=${encodeURIComponent(timeZone)}`,
          'GET',
        ).then((load) => {
          if (!cancelled && load.available_minutes !== null) {
            const moved = 0;
            setLoadLine(
              `${String(load.task_minutes - moved)} / ${String(load.available_minutes)} min · ${load.status}`,
            );
          }
        });
        return api.startPlan({
          local_date: localDate,
          time_zone: timeZone,
          today: true,
          overdue: true,
          inbox: false,
          undated: false,
        });
      })
      .then((body) => {
        if (!cancelled) {
          setSession(readSession(body));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(messageOf(reason, text));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  async function choose(card: PlanCard, decision: Decision, targetDate?: string): Promise<void> {
    if (session === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const target =
        decision === 'later'
          ? (targetDate ?? dates[card.task_id] ?? nextCivil(session.local_date))
          : undefined;
      const next = await api.decidePlan(session.id, card.task_id, {
        decision,
        ...(target === undefined ? {} : { target_date: target }),
      });
      setSession(readSession(next));
    } catch (reason) {
      setError(messageOf(reason, text));
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    if (session === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.applyPlan(
        session.id,
        { expected_revision: session.revision },
        crypto.randomUUID(),
      );
      setApplied(readApplied(result));
    } catch (reason) {
      setError(messageOf(reason, text));
      if (reason instanceof ApiError && reason.code === 'plan_revision') {
        const fresh = await api.planSession(session.id);
        setSession(readSession(fresh));
      }
    } finally {
      setBusy(false);
    }
  }

  const chosen = new Map(session?.decisions.map((decision) => [decision.task_id, decision]) ?? []);
  const actionable = session?.decisions.some((decision) => decision.decision !== 'skip') ?? false;

  return (
    <section className="screen-page plan-day">
      <header className="page-header">
        <h1>{text.title}</h1>
        <p className="lede">{text.lede}</p>
      </header>
      {error !== null ? <p className="plan-error">{error}</p> : null}
      {applied !== null ? (
        <div className="plan-result">
          <h2>{text.applied}</h2>
          <ul>
            {applied.applied.map((item) => (
              <li key={item.task_id}>{text.effects[item.effect] ?? item.effect}</li>
            ))}
          </ul>
          <p>
            <Link to="/today">{text.back}</Link>
            {' · '}
            <Link to="/wont-do">{text.wontDo}</Link>
          </p>
        </div>
      ) : session === null ? (
        <p className="ui-muted">{text.loading}</p>
      ) : (
        <>
          {loadLine !== null ? <p className="ui-muted">{loadLine}</p> : null}
          {session.hidden_overdue > 0 ? (
            <p className="ui-muted">
              {text.hidden.replace('{count}', String(session.hidden_overdue))}
            </p>
          ) : null}
          {session.cards.length === 0 ? <p className="ui-muted">{text.empty}</p> : null}
          <ol className="plan-cards">
            {session.cards.map((card) => {
              const decision = chosen.get(card.task_id);
              return (
                <li key={card.task_id} className="plan-card">
                  <div>
                    <p className="detail-title">{card.title}</p>
                    <p className="ui-muted">
                      {card.reason_text} · {card.project_name}
                    </p>
                  </div>
                  <div className="plan-choices" role="group" aria-label={card.title}>
                    {DECISIONS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={
                          decision?.decision === kind
                            ? 'ui-button is-primary is-sm'
                            : 'ui-button is-sm'
                        }
                        aria-pressed={decision?.decision === kind}
                        disabled={busy}
                        onClick={() => {
                          void choose(card, kind);
                        }}
                      >
                        {text.decisions[kind]}
                      </button>
                    ))}
                  </div>
                  {decision?.decision === 'later' ? (
                    <label className="plan-later">
                      {text.laterDate}
                      <input
                        type="date"
                        value={
                          dates[card.task_id] ??
                          decision.target_date ??
                          nextCivil(session.local_date)
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          setDates((current) => ({ ...current, [card.task_id]: value }));
                          void choose(card, 'later', value);
                        }}
                      />
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <aside className="plan-preview">
            <h2>{text.preview}</h2>
            <ul>
              {session.preview.effects
                .filter((effect) => chosen.has(effect.task_id))
                .map((effect) => (
                  <li key={effect.task_id}>{effect.summary}</li>
                ))}
            </ul>
            <button
              type="button"
              className="ui-button is-primary"
              disabled={busy || !actionable}
              onClick={() => {
                void apply();
              }}
            >
              {text.apply}
            </button>
          </aside>
        </>
      )}
    </section>
  );
}

export function WontDoPage() {
  const locale = useAppLocale();
  const text: Copy = locale.toLowerCase().startsWith('en') ? english : spanish;
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
          setError(messageOf(reason, text));
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

function readSession(value: unknown): PlanSession {
  const row = objectOf(value);
  const preview = objectOf(row.preview);
  return {
    id: stringOf(row.id),
    local_date: stringOf(row.local_date),
    revision: typeof row.revision === 'number' ? row.revision : 1,
    state: stringOf(row.state),
    hidden_overdue: typeof row.hidden_overdue === 'number' ? row.hidden_overdue : 0,
    cards: arrayOf(row.cards).map((card) => {
      const item = objectOf(card);
      return {
        task_id: stringOf(item.task_id),
        title: stringOf(item.title),
        section: stringOf(item.section),
        reason_text: stringOf(item.reason_text),
        project_name: stringOf(item.project_name),
      };
    }),
    decisions: arrayOf(row.decisions).flatMap((decision) => {
      const item = objectOf(decision);
      if (!isDecision(item.decision)) {
        return [];
      }
      return [
        {
          task_id: stringOf(item.task_id),
          decision: item.decision,
          target_date: typeof item.target_date === 'string' ? item.target_date : null,
        },
      ];
    }),
    preview: {
      effects: arrayOf(preview.effects).map((effect) => {
        const item = objectOf(effect);
        return { task_id: stringOf(item.task_id), summary: stringOf(item.summary) };
      }),
    },
  };
}

function readApplied(value: unknown): AppliedPlan {
  const row = objectOf(value);
  return {
    applied: arrayOf(row.applied).map((item) => {
      const effect = objectOf(item);
      return {
        task_id: stringOf(effect.task_id),
        decision: stringOf(effect.decision),
        effect: stringOf(effect.effect),
      };
    }),
  };
}

function objectOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isDecision(value: unknown): value is Decision {
  return (
    value === 'done' ||
    value === 'plan_day' ||
    value === 'later' ||
    value === 'someday' ||
    value === 'cancel' ||
    value === 'trash' ||
    value === 'skip'
  );
}

function nextCivil(localDate: string): string {
  const [year, month, day] = localDate.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function messageOf(reason: unknown, text: Copy): string {
  if (reason instanceof ApiError) {
    if (reason.code === 'plan_conflict') {
      return text.conflict;
    }
    if (reason.code === 'plan_revision') {
      return text.revision;
    }
    return reason.message.length > 0 ? reason.message : text.failed;
  }
  return text.failed;
}

const spanish = {
  title: 'Planifica tu día',
  lede: 'Nada cambia hasta que confirmas. «La haré hoy» no mueve la fecha de vencimiento. «No lo haré» no cuenta como completada.',
  loading: 'Preparando el plan…',
  empty: 'No hay compromisos para hoy ni vencidas pendientes.',
  hidden: 'Hay {count} vencidas que no caben en esta pasada. Siguen en la lista de vencidas.',
  preview: 'Qué va a pasar',
  apply: 'Confirmar plan',
  applied: 'Plan aplicado',
  back: 'Volver a Hoy',
  wontDo: 'No lo haré',
  wontDoLede: 'Estas tareas están canceladas. No cuentan como completadas.',
  wontDoEmpty: 'No hay tareas canceladas.',
  laterDate: 'Día del plan',
  failed: 'No se ha podido guardar el plan.',
  conflict: 'Alguna tarea cambió desde la vista previa. Vuelve a decidir antes de confirmar.',
  revision: 'El plan cambió. Revisa la vista previa otra vez.',
  decisions: {
    done: 'Hecho',
    plan_day: 'La haré hoy',
    later: 'Después',
    someday: 'Algún día',
    cancel: 'No lo haré',
    trash: 'Papelera',
  },
  effects: {
    completed: 'Completada',
    planned_today: 'En el plan de hoy, sin cambiar la fecha',
    planned_later: 'En el plan de otro día, sin cambiar la fecha',
    cancelled: 'Cancelada, sin contar como completada',
    trashed: 'En la papelera',
  },
};

type Copy = Omit<typeof spanish, 'effects'> & { readonly effects: Record<string, string> };

const english: Copy = {
  ...spanish,
  title: 'Plan your day',
  lede: 'Nothing changes until you confirm. “I’ll do it today” does not move the due date. “I won’t do it” is not a completion.',
  loading: 'Preparing the plan…',
  empty: 'Nothing is due today and nothing is overdue.',
  hidden: '{count} overdue tasks stay out of this pass. They remain in the overdue list.',
  preview: 'What will happen',
  apply: 'Confirm plan',
  applied: 'Plan applied',
  back: 'Back to Today',
  wontDo: 'I won’t do it',
  wontDoLede: 'These tasks are cancelled. They do not count as completed.',
  wontDoEmpty: 'There are no cancelled tasks.',
  laterDate: 'Plan day',
  failed: 'The plan could not be saved.',
  conflict: 'A task changed after the preview. Decide again before confirming.',
  revision: 'The plan changed. Review the preview again.',
  decisions: {
    done: 'Done',
    plan_day: 'I’ll do it today',
    later: 'Later',
    someday: 'Someday',
    cancel: 'I won’t do it',
    trash: 'Trash',
  },
  effects: {
    completed: 'Completed',
    planned_today: 'On today’s plan, due date unchanged',
    planned_later: 'On another day’s plan, due date unchanged',
    cancelled: 'Cancelled, not counted as completed',
    trashed: 'Moved to trash',
  },
};
