import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { ErrorState, SkeletonRows } from '../../components/ui';
import { fill, useMessages } from '../../i18n';

interface WorkdayMe {
  readonly work_day_start: string | null;
  readonly work_day_end: string | null;
  readonly default_task_duration_minutes: number;
  readonly deadline_soon_days: number;
  readonly evening_start: string;
  readonly shutdown_reminder_time: string | null;
}

export function WorkdaySettings() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const data = me.data as WorkdayMe | undefined;
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>): Promise<void> {
    setError(null);
    try {
      await api.updateMe(patch);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : messages.settingsFailed);
    }
  }

  if (me.isPending) {
    return (
      <section>
        <h1>{messages.workdayTitle}</h1>
        <SkeletonRows />
      </section>
    );
  }
  if (me.isError) {
    return (
      <section>
        <h1>{messages.workdayTitle}</h1>
        <ErrorState
          title={fill(messages.loadFailed, messages.workdayTitle)}
          retryLabel={messages.retry}
          onRetry={() => {
            runAction(me.refetch());
          }}
        />
      </section>
    );
  }

  return (
    <section>
      <h1>{messages.workdayTitle}</h1>
      <p>{messages.workdayHelp}</p>
      {data === undefined ? null : (
        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const text = (key: string) => {
              const raw = form.get(key);
              const value = typeof raw === 'string' ? raw : '';
              return value.length === 0 ? null : value;
            };
            runAction(
              save({
                work_day_start: text('work_day_start'),
                work_day_end: text('work_day_end'),
                evening_start: text('evening_start') ?? '18:00',
                shutdown_reminder_time: text('shutdown_reminder_time'),
                default_task_duration_minutes: Number(form.get('default_task_duration_minutes')),
                deadline_soon_days: Number(form.get('deadline_soon_days')),
              }),
            );
          }}
        >
          <label>
            {messages.workdayStart}
            <input
              name="work_day_start"
              defaultValue={data.work_day_start ?? ''}
              placeholder="09:00"
            />
          </label>
          <p>{messages.workdayStartHelp}</p>
          <label>
            {messages.workdayEnd}
            <input name="work_day_end" defaultValue={data.work_day_end ?? ''} placeholder="18:00" />
          </label>
          <p>{messages.workdayEndHelp}</p>
          <label>
            {messages.defaultDuration}
            <input
              name="default_task_duration_minutes"
              type="number"
              min={5}
              max={240}
              defaultValue={data.default_task_duration_minutes}
            />
          </label>
          <p>{messages.defaultDurationHelp}</p>
          <label>
            {messages.deadlineSoon}
            <input
              name="deadline_soon_days"
              type="number"
              min={1}
              max={14}
              defaultValue={data.deadline_soon_days}
            />
          </label>
          <p>{messages.deadlineSoonHelp}</p>
          <label>
            {messages.eveningStart}
            <input name="evening_start" defaultValue={data.evening_start} />
          </label>
          <p>{messages.eveningStartHelp}</p>
          <label>
            {messages.shutdownTime}
            <input
              name="shutdown_reminder_time"
              defaultValue={data.shutdown_reminder_time ?? ''}
              placeholder="21:30"
            />
          </label>
          <p>{messages.shutdownTimeHelp}</p>
          <button type="submit">{messages.repeatSave}</button>
        </form>
      )}
      {error !== null ? <p role="alert">{error}</p> : null}
    </section>
  );
}
