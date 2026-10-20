import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useMessages } from '../../i18n';
import { tickyApi, type GuidanceBody } from './api';
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
  const [threadId, setThreadId] = useState<string | null>(null);

  const flags = useQuery({
    queryKey: ['ticky', 'flags'],
    queryFn: () => tickyApi.flags(),
  });

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
      const body = await tickyApi.postMessage(id, clientMessageId, draft.trim());
      return body;
    },
    onSuccess: (body) => {
      const guidance = body as GuidanceBody;
      const line =
        typeof guidance.message === 'string' ? guidance.message : messages.tickyGenericReply;
      setLog((prev) => [...prev, line]);
      setPhase(guidance.status === 'model_not_configured' ? 'done' : 'review');
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['ticky'] });
    },
    onError: (error: Error) => {
      setPhase(error.message.includes('scope') ? 'error' : 'error');
      setLog((prev) => [...prev, error.message]);
    },
  });

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
      <p className="ticky-phase" aria-live="polite">
        {phaseLabel(phase, messages)}
      </p>
      <ul className="ticky-log">
        {log.map((line, index) => (
          <li key={`${String(index)}-${line.slice(0, 12)}`}>{line}</li>
        ))}
      </ul>
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
          onChange={(event) => { setDraft(event.target.value); }}
          placeholder={messages.tickyPlaceholder}
          rows={3}
          disabled={!online || send.isPending}
        />
        <div className="ticky-actions">
          <button type="submit" disabled={!online || send.isPending || draft.trim().length === 0}>
            {messages.tickySend}
          </button>
        </div>
      </form>
      {!online ? <p role="status">{messages.tickyOfflineApprove}</p> : null}
    </section>
  );
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
