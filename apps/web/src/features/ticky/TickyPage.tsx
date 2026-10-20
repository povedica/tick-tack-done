import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useMessages } from '../../i18n';
import { tickyApi, waitForTickyRun } from './api';
import { ProposalReview } from './ProposalReview';
import './ticky.css';

type Phase =
  | 'idle'
  | 'consulting'
  | 'preparing'
  | 'review'
  | 'applying'
  | 'verifying'
  | 'done'
  | 'offline'
  | 'error'
  | 'disabled';

export function TickyPage({ taskHint }: { readonly taskHint?: string }) {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState(taskHint ?? '');
  const [log, setLog] = useState<string[]>([]);
  const [modelId, setModelId] = useState('');
  const [threadId, setThreadId] = useState<string | null>(() => {
    const id = new URLSearchParams(window.location.search).get('ticky_thread');
    return id !== null && /^[a-f0-9-]{36}$/i.test(id) ? id : null;
  });
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const streamAbort = useRef<AbortController | null>(null);

  const flags = useQuery({
    queryKey: ['ticky', 'flags'],
    queryFn: () => tickyApi.flags(),
  });

  const models = useQuery({
    queryKey: ['ticky', 'models'],
    queryFn: () => tickyApi.models(),
    enabled: flags.data?.model === true,
  });
  const threads = useQuery({
    queryKey: ['ticky', 'threads'],
    queryFn: tickyApi.listThreads,
    enabled: flags.data?.read === true,
  });
  const history = useQuery({
    queryKey: ['ticky', 'history', threadId],
    queryFn: () => tickyApi.history(threadId ?? ''),
    enabled: flags.data?.read === true && threadId !== null,
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (threadId === null) url.searchParams.delete('ticky_thread');
    else url.searchParams.set('ticky_thread', threadId);
    window.history.replaceState(window.history.state, '', url);
  }, [threadId]);
  useEffect(
    () => () => {
      streamAbort.current?.abort();
    },
    [],
  );

  function selectThread(id: string | null) {
    streamAbort.current?.abort();
    setThreadId(id);
    setLatest(null);
    setLog([]);
    setRunId(null);
    setPhase('idle');
  }

  async function receive(id: string) {
    const abort = new AbortController();
    streamAbort.current = abort;
    setRunId(id);
    return waitForTickyRun(id, AbortSignal.any([abort.signal, AbortSignal.timeout(195_000)]));
  }

  useEffect(() => {
    if (!online) {
      setPhase('offline');
    }
  }, [online]);

  useEffect(() => {
    if (flags.data !== undefined && !flags.data.ui) {
      setPhase('disabled');
    }
  }, [flags.data]);

  const send = useMutation({
    mutationFn: async () => {
      if (!online) {
        throw new Error(messages.tickyOffline);
      }
      setPhase('consulting');
      let id = threadId;
      if (id === null) {
        const opened = await tickyApi.openThread();
        id = opened.id;
        setThreadId(id);
      }
      setPhase('preparing');
      const clientMessageId = crypto.randomUUID();
      const body = await tickyApi.postMessage(
        id,
        clientMessageId,
        draft.trim(),
        modelId.length > 0 ? modelId : undefined,
      );
      if (typeof body.run_id === 'string' && body.status === 'accepted') {
        return receive(body.run_id);
      }
      return body;
    },
    onSuccess: (body) => {
      setLatest(body);
      setRunId(null);
      setPhase(body.proposal === null || body.proposal === undefined ? 'done' : 'review');
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['ticky'] });
    },
    onError: (error: Error) => {
      setPhase(error.message.includes('scope') ? 'error' : 'error');
      setLog((prev) => [...prev, error.message]);
    },
  });

  const results = new Map<string, Record<string, unknown>>();
  for (const message of history.data?.messages ?? []) {
    if (message.result !== null) results.set(message.run_id, message.result);
  }
  if (latest !== null)
    results.set(typeof latest.run_id === 'string' ? latest.run_id : 'latest', latest);

  if (phase === 'disabled' || (flags.data !== undefined && !flags.data.ui)) {
    return (
      <section className="ticky-page" aria-labelledby="ticky-title">
        <h1 id="ticky-title">{messages.tickyTitle}</h1>
        <p>{messages.tickyDisabled}</p>
      </section>
    );
  }

  return (
    <section className="ticky-page" aria-labelledby="ticky-title">
      <h1 id="ticky-title">{messages.tickyTitle}</h1>
      <p className="ticky-hint">{messages.tickyHint}</p>
      <div className="ticky-actions">
        <label>
          Conversación{' '}
          <select
            aria-label="Conversación"
            value={threadId ?? ''}
            disabled={send.isPending}
            onChange={(event) => {
              selectThread(event.target.value || null);
            }}
          >
            <option value="">Nueva conversación</option>
            {threadId !== null && !threads.data?.items.some((item) => item.id === threadId) ? (
              <option value={threadId}>Conversación actual</option>
            ) : null}
            {threads.data?.items.map((item, index) => (
              <option key={item.id} value={item.id}>
                Conversación {index + 1}
              </option>
            ))}
          </select>
        </label>
        {threadId === null ? null : (
          <button
            type="button"
            disabled={send.isPending}
            onClick={() => {
              void tickyApi
                .deleteThread(threadId)
                .then((result) => {
                  selectThread(null);
                  setLog([
                    result.state === 'deleted'
                      ? 'Conversación borrada.'
                      : 'Borrado solicitado; quedan ejecuciones o checkpoints pendientes.',
                  ]);
                  void queryClient.invalidateQueries({ queryKey: ['ticky'] });
                })
                .catch(() => {
                  setLog([
                    'No se pudo confirmar el borrado. Consulta el historial antes de repetir.',
                  ]);
                });
            }}
          >
            Borrar conversación
          </button>
        )}
      </div>
      <p className="ticky-phase" aria-live="polite">
        {phaseLabel(phase, messages)}
      </p>
      <ul className="ticky-log">
        {[...results.entries()].map(([id, body]) => (
          <li key={id}>
            {resultLines(body, messages.tickyGenericReply).map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            {body.proposal === null || body.proposal === undefined ? null : (
              <ProposalReview
                value={body.proposal}
                executionEnabled={flags.data?.execution === true}
              />
            )}
          </li>
        ))}
        {log.map((line, index) => (
          <li key={`${String(index)}-${line.slice(0, 12)}`}>{line}</li>
        ))}
      </ul>
      {history.isError ? (
        <p role="alert">
          No se ha podido recuperar el historial. No repitas una acción sin verificar su estado.
        </p>
      ) : null}
      {history.data?.messages
        .filter(
          (message) => message.result === null && ['accepted', 'running'].includes(message.state),
        )
        .map((message) => (
          <button
            key={message.run_id}
            type="button"
            disabled={send.isPending}
            onClick={() => {
              void receive(message.run_id)
                .then((body) => {
                  setLatest(body);
                  setRunId(null);
                  void queryClient.invalidateQueries({ queryKey: ['ticky'] });
                })
                .catch(() => {
                  setLog(['No se pudo recuperar la consulta. Revisa su estado antes de repetir.']);
                });
            }}
          >
            Recuperar consulta pendiente
          </button>
        ))}
      {flags.data?.model === true && models.data !== undefined ? (
        <label>
          Modelo
          <select
            value={modelId}
            onChange={(event) => {
              setModelId(event.target.value);
            }}
            disabled={send.isPending}
          >
            <option value="">Sin IA</option>
            {models.data.items.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <form
        className="ticky-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length === 0 || !online || phase === 'applying') {
            return;
          }
          send.mutate();
        }}
      >
        <label className="sr-only" htmlFor="ticky-input">
          {messages.tickyPlaceholder}
        </label>
        <textarea
          id="ticky-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder={messages.tickyPlaceholder}
          rows={3}
          disabled={!online || send.isPending}
        />
        <div className="ticky-actions">
          <button type="submit" disabled={!online || send.isPending || draft.trim().length === 0}>
            {messages.tickySend}
          </button>
          {runId === null ? null : (
            <button
              type="button"
              onClick={() => {
                void tickyApi
                  .cancel(runId)
                  .then(() => {
                    streamAbort.current?.abort();
                    setRunId(null);
                    setLog(['Cancelación solicitada. Los efectos ya aplicados no se deshacen.']);
                    void queryClient.invalidateQueries({ queryKey: ['ticky'] });
                  })
                  .catch(() => {
                    setLog(['No se pudo confirmar la cancelación. Revisa el historial.']);
                  });
              }}
            >
              Cancelar consulta
            </button>
          )}
        </div>
      </form>
      {!online ? <p role="status">{messages.tickyOfflineApprove}</p> : null}
    </section>
  );
}

function resultLines(body: Record<string, unknown>, fallback: string): string[] {
  const lines = [
    typeof body.text === 'string'
      ? body.text
      : typeof body.message === 'string'
        ? body.message
        : fallback,
  ];
  if (
    body.card !== null &&
    typeof body.card === 'object' &&
    'tasks' in body.card &&
    Array.isArray(body.card.tasks)
  ) {
    for (const task of body.card.tasks as readonly unknown[]) {
      if (
        task !== null &&
        typeof task === 'object' &&
        'title' in task &&
        typeof task.title === 'string'
      )
        lines.push(task.title);
    }
  }
  return lines;
}

function phaseLabel(phase: Phase, messages: ReturnType<typeof useMessages>): string {
  switch (phase) {
    case 'consulting':
      return messages.tickyPhaseConsulting;
    case 'preparing':
      return messages.tickyPhasePreparing;
    case 'review':
      return messages.tickyPhaseReview;
    case 'applying':
      return messages.tickyPhaseApplying;
    case 'verifying':
      return messages.tickyPhaseVerifying;
    case 'done':
      return messages.tickyPhaseDone;
    case 'offline':
      return messages.tickyOffline;
    case 'error':
      return messages.tickyError;
    case 'disabled':
      return messages.tickyDisabled;
    default:
      return messages.tickyPhaseIdle;
  }
}
