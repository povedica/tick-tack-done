import { runAction } from '../../../components/run-action';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api';
import { planningRequest, type Choice, type PlanSession, type LoadRange } from '../api';
import { shiftCivilDate, type PlanningAction, type PlanSources } from '@reflexionia/domain';
export function useTriageSession() {
  const cache = useQueryClient();
  const [session, setSession] = useState<PlanSession | null>(null);
  const [load, setLoad] = useState<LoadRange | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (review) setNotice('');
  }, [review]);
  const [owner, setOwner] = useState('');
  const [sources, setSources] = useState<PlanSources>({
    today: true,
    overdue: true,
    inbox: false,
    undated: false,
  });
  const [history, setHistory] = useState<
    { taskId: string; previous: Choice | undefined; index: number }[]
  >([]);
  const initial = useRef<Promise<{
    session: PlanSession;
    load: LoadRange;
    owner: string;
    sources: PlanSources;
  }> | null>(null);
  const requestedDate = useRef<string | null>(null);
  async function prepare() {
    const me = await api.getMe();
    const zone = me.time_zone;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const date = requestedDate.current ?? today;
    let stored: Partial<PlanSources> = {};
    try {
      stored = JSON.parse(
        localStorage.getItem(`ttd.planDefaults.${me.id}`) ?? '{}',
      ) as Partial<PlanSources>;
    } catch {
      /* default sources */
    }
    const selected = {
      today: true,
      overdue: true,
      inbox: stored.inbox === true,
      undated: stored.undated === true,
    };
    const [next, range] = await Promise.all([
      planningRequest<PlanSession>('/api/v1/planning/sessions', 'POST', {
        local_date: date,
        time_zone: zone,
        ...selected,
      }),
      planningRequest<LoadRange>(`/api/v1/planning/load?from=${date}&days=14`, 'GET'),
    ]);
    return { session: next, load: range, owner: me.id, sources: selected };
  }
  function retry() {
    setError(null);
    initial.current = null;
    const promise = prepare();
    initial.current = promise;
    runAction(
      promise
        .then((data) => {
          setSession(data.session);
          setIndex(
            Math.max(
              0,
              data.session.cards.findIndex(
                (card) => !data.session.decisions.some((d) => d.task_id === card.task_id),
              ),
            ),
          );
          setLoad(data.load);
          setOwner(data.owner);
          setSources(data.sources);
        })
        .catch((reason: unknown) => {
          setError(String(reason));
        }),
    );
  }
  useEffect(() => {
    let mounted = true;
    const promise = initial.current ?? prepare();
    initial.current = promise;
    runAction(
      promise
        .then((data) => {
          if (mounted) {
            setSession(data.session);
            setIndex(
              Math.max(
                0,
                data.session.cards.findIndex(
                  (card) => !data.session.decisions.some((d) => d.task_id === card.task_id),
                ),
              ),
            );
            setLoad(data.load);
            setOwner(data.owner);
            setSources(data.sources);
          }
        })
        .catch((reason: unknown) => {
          if (mounted) setError(String(reason));
        }),
    );
    return () => {
      mounted = false;
    };
  }, []);
  const card = session?.cards[index];
  const chosen = session?.decisions.find((d) => d.task_id === card?.task_id);
  async function decide(choice: PlanningAction, taskId = card?.task_id) {
    if (!session || !taskId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const previous = session.decisions.find((d) => d.task_id === taskId);
      setSession({
        ...session,
        decisions: [
          ...session.decisions.filter((d) => d.task_id !== taskId),
          { task_id: taskId, ...choice },
        ],
      });
      const next = await planningRequest<PlanSession>(
        `/api/v1/planning/sessions/${session.id}/decisions/${taskId}`,
        'PUT',
        choice,
      );
      setHistory((h) => [
        ...h,
        { taskId, previous, index: session.cards.findIndex((c) => c.task_id === taskId) },
      ]);
      setSession(next);
      setNotice(taskId);
      const nextIndex = session.cards.findIndex(
        (c, i) => i > index && !next.decisions.some((d) => d.task_id === c.task_id),
      );
      if (nextIndex < 0) setReview(true);
      else setIndex(nextIndex);
    } catch (reason) {
      setSession(session);
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    const last = history.at(-1);
    if (!last || !session || busy) return;
    setBusy(true);
    try {
      const next = await planningRequest<PlanSession>(
        `/api/v1/planning/sessions/${session.id}/decisions/${last.taskId}`,
        last.previous ? 'PUT' : 'DELETE',
        last.previous
          ? {
              action: last.previous.action,
              ...(last.previous.date ? { date: last.previous.date } : {}),
              ...(last.previous.time ? { time: last.previous.time } : {}),
              ...(last.previous.duration ? { duration: last.previous.duration } : {}),
            }
          : undefined,
      );
      setSession(next);
      setHistory((h) => h.slice(0, -1));
      setIndex(last.index);
      setReview(false);
      setNotice('');
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  function navigate(delta: number) {
    if (!session) return;
    setReview(false);
    setIndex((i) => Math.max(0, Math.min(session.cards.length - 1, i + delta)));
  }
  async function addSource(key: 'inbox' | 'undated') {
    if (!session || busy) return;
    const nextSources = { ...sources, [key]: !sources[key] };
    setBusy(true);
    try {
      const next = await planningRequest<PlanSession>('/api/v1/planning/sessions', 'POST', {
        local_date: session.local_date,
        time_zone: session.time_zone,
        ...nextSources,
      });
      setSession(next);
      setSources(nextSources);
      localStorage.setItem(`ttd.planDefaults.${owner}`, JSON.stringify(nextSources));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  const applyKey = useRef(crypto.randomUUID());
  async function apply() {
    if (!session || busy || !session.decisions.some((d) => d.action !== 'skip')) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await planningRequest<{ operation_id: string }>(
        `/api/v1/planning/sessions/${session.id}/apply`,
        'POST',
        { expected_revision: session.revision },
        applyKey.current,
      );
      await cache.invalidateQueries();
      return result.operation_id;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      try {
        const body = JSON.parse(message) as {
          error?: { code?: string; details?: { task_ids?: string[] } };
        };
        if (body.error?.code === 'plan_conflict') {
          let next = session;
          for (const id of body.error.details?.task_ids ?? [])
            next = await planningRequest<PlanSession>(
              `/api/v1/planning/sessions/${session.id}/decisions/${id}`,
              'DELETE',
            );
          setSession(next);
        }
      } catch {
        /* The original confirmation error remains visible. */
      }
      setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return {
    session,
    load,
    index,
    card,
    chosen,
    busy,
    error,
    review,
    setReview,
    notice,
    setNotice,
    sources,
    history,
    decide,
    undo,
    navigate,
    setIndex,
    addSource,
    apply,
    retry,
    planTomorrow: () => {
      requestedDate.current = shiftCivilDate(
        session?.local_date ?? new Date().toISOString().slice(0, 10),
        1,
      );
      setSession(null);
      setReview(false);
      setIndex(0);
      retry();
    },
  };
}
export type TriageSession = ReturnType<typeof useTriageSession>;
