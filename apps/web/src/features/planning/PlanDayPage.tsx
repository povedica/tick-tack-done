import { runAction } from '../../components/run-action';
import { displayTitle } from '../tasks/displayTitle';
import { ApiError } from '@reflexionia/sdk';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Sun, CalendarDays, Ban } from 'lucide-react';
import { PriorityCheck } from '../../components/PriorityCheck';
import { Button } from '../../components/ui';
import { refreshTaskSurfaces } from '../tasks/refresh';
import '../product/weekly.css';
import { useWeeklyCopy } from '../product/weekly-text';
import { Link, useLocation } from 'react-router';
import { api } from '../../api';
import { closingRequest } from '../closing/api';
import { useAppLocale } from '../../i18n/locale';
import { taskQueryHref } from '../../shell/use-open-task';
import './planning.css';

type Decision = 'done' | 'plan_day' | 'later' | 'someday' | 'cancel' | 'trash' | 'skip';

interface PlanCard {
  readonly task_id: string;
  readonly title: string;
  readonly section: string;
  readonly reason_text: string;
  readonly project_name: string;
  readonly project_id: string;
  readonly due_date: string | null;
  readonly recurring: boolean | null;
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

export function PlanDayPage() {
  const locale = useAppLocale();
  const location = useLocation();
  const text: Copy = locale.startsWith('en') ? english : spanish;
  const weekly = useWeeklyCopy();
  const cache = useQueryClient();
  const [session, setSession] = useState<PlanSession | null>(null);
  const [applied, setApplied] = useState<AppliedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [loadLine, setLoadLine] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getMe()
      .then(async (me) => {
        const timeZone = me.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const localDate = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        void closingRequest<{ task_minutes: number; available_minutes: number | null }>(
          `/api/v1/planning/load?date=${localDate}&time_zone=${encodeURIComponent(timeZone)}`,
          'GET',
        )
          .then((load) => {
            if (!cancelled && load.available_minutes !== null)
              setLoadLine(`${String(load.task_minutes)} / ${String(load.available_minutes)} min`);
          })
          .catch(() => {
            if (!cancelled) setLoadLine(null);
          });
        return api.startPlan({
          local_date: localDate,
          time_zone: timeZone,
          today: true,
          overdue: false,
          inbox: false,
          undated: false,
        });
      })
      .then((body) => {
        if (!cancelled) setSession(readSession(body));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason, text));
      });
    return () => {
      cancelled = true;
    };
  }, [text, attempt]);
  const cards =
    session?.cards.filter((card) => card.section === 'today' || card.section === 'today_timed') ??
    [];
  const eligible = cards.filter(
    (card) => selected.includes(card.task_id) && card.recurring === false,
  );
  const chosen = new Map(
    session?.decisions
      .filter((item) => cards.some((card) => card.task_id === item.task_id))
      .map((item) => [item.task_id, item]) ?? [],
  );
  const actionable = [...chosen.values()].filter((item) => item.decision !== 'skip');
  async function choose(decision: Decision) {
    if (!session || busy || !eligible.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const card of eligible) {
        const next = await api.decidePlan(session.id, card.task_id, {
          decision,
          ...(decision === 'later' ? { target_date: nextCivil(session.local_date) } : {}),
        });
        setSession(readSession(next));
        setSelected((old) => old.filter((id) => id !== card.task_id));
      }
    } catch (reason) {
      setError(messageOf(reason, text));
    } finally {
      setBusy(false);
    }
  }
  async function reset(card: PlanCard) {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSession(readSession(await api.decidePlan(session.id, card.task_id, { decision: 'skip' })));
    } catch (reason) {
      setError(messageOf(reason, text));
    } finally {
      setBusy(false);
    }
  }
  async function apply(force = false) {
    if (!session || busy) return;
    const irreversible = actionable.filter(
      (item) => item.decision === 'done' || item.decision === 'cancel',
    );
    if (irreversible.length && !force) {
      setConfirmApply(true);
      return;
    }
    setConfirmApply(false);
    setBusy(true);
    setError(null);
    try {
      const result = await api.applyPlan(
        session.id,
        { expected_revision: session.revision },
        crypto.randomUUID(),
      );
      setApplied(readApplied(result));
      await refreshTaskSurfaces(cache);
      await cache.invalidateQueries({ queryKey: ['day-plan-status'] });
      await cache.invalidateQueries({ queryKey: ['day-load'] });
    } catch (reason) {
      setError(messageOf(reason, text));
      if (reason instanceof ApiError && reason.code === 'plan_revision')
        setSession(readSession(await api.planSession(session.id)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="screen-page is-wide weekly-page review-page plan-day">
      <header className="page-header">
        <div>
          <h1>{text.title}</h1>
          <p className="lede">{text.lede}</p>
        </div>
        <Link to="/today">{text.finish}</Link>
      </header>
      {error ? (
        <p className="plan-error" role="alert">
          {error}{' '}
          <Button
            disabled={busy}
            onClick={() => {
              if (session) {
                setBusy(true);
                void api
                  .planSession(session.id)
                  .then((body) => {
                    setSession(readSession(body));
                    setError(null);
                  })
                  .catch((reason: unknown) => {
                    setError(messageOf(reason, text));
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              } else setAttempt((old) => old + 1);
            }}
          >
            {text.retry}
          </Button>
        </p>
      ) : null}
      {applied ? (
        <div className="week-card plan-result" role="status">
          <h2>{text.applied}</h2>
          <p>
            {String(applied.applied.length)} {text.updated}
          </p>
          <Link to="/today">{text.back}</Link>
        </div>
      ) : !session ? (
        !error ? (
          <p role="status">{text.loading}</p>
        ) : null
      ) : (
        <>
          <div className="plan-overview">
            <span>
              {new Date(`${session.local_date}T12:00:00Z`).toLocaleDateString(locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
            {loadLine ? (
              <span>
                {text.load}: {loadLine}
              </span>
            ) : null}
          </div>
          <p className="ui-muted">{weekly.count(cards.length, eligible.length)}</p>
          {cards.length === 0 ? (
            <div className="week-card">
              <h2>{text.empty}</h2>
              <Link to="/today">{text.back}</Link>
            </div>
          ) : (
            <ul className="weekly-tasks plan-task-list">
              {cards.map((card) => {
                const decision = chosen.get(card.task_id);
                return (
                  <li
                    key={card.task_id}
                    className={selected.includes(card.task_id) ? 'is-selected' : ''}
                  >
                    <PriorityCheck
                      priority="none"
                      label={weekly.select(displayTitle(card.title))}
                      checked={selected.includes(card.task_id)}
                      disabled={busy || card.recurring !== false}
                      onChange={(event) => {
                        setSelected((old) =>
                          event.target.checked
                            ? [...old, card.task_id]
                            : old.filter((id) => id !== card.task_id),
                        );
                      }}
                    />
                    <Link
                      className="weekly-task-title"
                      to={taskQueryHref(location.pathname, location.search, card.task_id)}
                      title={card.title}
                    >
                      {displayTitle(card.title)}
                    </Link>
                    <span className="weekly-task-context">
                      <span>{card.project_name}</span>
                      <small>{card.reason_text}</small>
                      {decision && decision.decision !== 'skip' ? (
                        <button
                          type="button"
                          className="plan-decision-chip"
                          disabled={busy}
                          aria-label={`${text.reset}: ${displayTitle(card.title)}`}
                          onClick={() => {
                            runAction(reset(card));
                          }}
                        >
                          {text.decisions[decision.decision]} ×
                        </button>
                      ) : null}
                    </span>
                    {card.recurring !== false ? (
                      <span className="weekly-repeat">{weekly.recurring}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {actionable.length ? (
            <aside className="plan-preview week-card">
              <div>
                <h2>
                  {text.preview} · {String(actionable.length)}
                </h2>
                <p>{text.previewHelp}</p>
              </div>
              <ul>
                {session.preview.effects
                  .filter((effect) => actionable.some((item) => item.task_id === effect.task_id))
                  .map((effect) => (
                    <li key={effect.task_id}>
                      <strong>
                        {displayTitle(
                          cards.find((card) => card.task_id === effect.task_id)?.title ?? '',
                        )}
                      </strong>
                      <span>{effect.summary}</span>
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
                {text.apply}
              </Button>
              {confirmApply ? (
                <div className="token-confirm" role="alertdialog">
                  <p>
                    {text.confirmCount.replace(
                      '{count}',
                      String(
                        actionable.filter(
                          (item) => item.decision === 'done' || item.decision === 'cancel',
                        ).length,
                      ),
                    )}
                  </p>
                  <span className="token-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setConfirmApply(false);
                      }}
                    >
                      {text.dismiss}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        runAction(apply(true));
                      }}
                    >
                      {text.apply}
                    </Button>
                  </span>
                </div>
              ) : null}
            </aside>
          ) : null}
          {!actionable.length ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                runAction(apply());
              }}
            >
              {text.apply}
            </Button>
          ) : null}
          {eligible.length ? (
            <div className="weekly-actions" aria-label={weekly.actions}>
              <span className="weekly-selection-count">{weekly.selected(eligible.length)}</span>
              <Button
                disabled={busy}
                onClick={() => {
                  runAction(choose('done'));
                }}
              >
                <Check size={16} />
                {weekly.done}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  runAction(choose('plan_day'));
                }}
              >
                <Sun size={16} />
                {weekly.today}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  runAction(choose('later'));
                }}
              >
                <CalendarDays size={16} />
                {weekly.tomorrow}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  runAction(choose('cancel'));
                }}
              >
                <Ban size={16} />
                {weekly.cancel}
              </Button>
            </div>
          ) : null}
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
        project_id: stringOf(item.project_id),
        due_date: typeof item.due_date === 'string' ? item.due_date : null,
        recurring: typeof item.recurring === 'boolean' ? item.recurring : null,
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
  title: 'Plan del día',
  finish: 'Terminar planificación',
  retry: 'Reintentar',
  updated: 'tareas actualizadas',
  load: 'Carga del día',
  reset: 'Quitar decisión',
  previewHelp: 'Revisa tus decisiones. Las tareas sin decisión se quedan como están.',
  confirmCount: 'Vas a completar o marcar como «No haré» {count} tareas. ¿Confirmas?',
  dismiss: 'Cancelar',
  lede: 'Selecciona las tareas de hoy y decide cómo continuar. Nada cambia hasta confirmar el plan.',
  loading: 'Preparando el plan…',
  empty: 'No hay tareas para hoy.',
  hidden: 'Hay {count} vencidas que no caben en esta pasada. Siguen en la lista de vencidas.',
  preview: 'Qué va a pasar',
  apply: 'Confirmar plan',
  applied: 'Plan aplicado',
  back: 'Volver a Hoy',
  wontDo: 'No haré',
  wontDoLede: 'Estas tareas están canceladas. No cuentan como completadas.',
  wontDoEmpty: 'No hay tareas canceladas.',
  laterDate: 'Día del plan',
  failed: 'No se ha podido guardar el plan.',
  conflict: 'Alguna tarea cambió desde la vista previa. Vuelve a decidir antes de confirmar.',
  revision: 'El plan cambió. Revisa la vista previa otra vez.',
  decisions: {
    done: 'Hecho',
    plan_day: 'Hoy',
    later: 'Mañana',
    someday: 'Algún día',
    cancel: 'No haré',
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
  title: 'Day plan',
  finish: 'Finish planning',
  retry: 'Retry',
  updated: 'tasks updated',
  load: 'Day load',
  reset: 'Clear decision',
  previewHelp: 'Review your decisions. Tasks without a decision remain unchanged.',
  confirmCount: 'You will complete or mark {count} tasks as won’t do. Confirm?',
  dismiss: 'Cancel',
  lede: 'Select today’s tasks and decide what comes next. Nothing changes until you confirm the plan.',
  loading: 'Preparing the plan…',
  empty: 'No tasks for today.',
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
    plan_day: 'Today',
    later: 'Tomorrow',
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
