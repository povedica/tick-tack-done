import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import './settings-wt-e.css';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
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
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await api.updateMe(patch);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : messages.settingsFailed);
    } finally {
      setBusy(false);
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
    <section className="token-settings workday-settings">
      <h1>{messages.workdayTitle}</h1>
      <p className="lede">{messages.workdayHelp}</p>
      {data === undefined ? null : (
        <form
          className="workday-form"
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
          {[
            [
              'work_day_start',
              messages.workdayStart,
              messages.workdayStartHelp,
              'time',
              data.work_day_start ?? '',
            ],
            [
              'work_day_end',
              messages.workdayEnd,
              messages.workdayEndHelp,
              'time',
              data.work_day_end ?? '',
            ],
            [
              'default_task_duration_minutes',
              messages.defaultDuration,
              messages.defaultDurationHelp,
              'number',
              data.default_task_duration_minutes,
            ],
            [
              'deadline_soon_days',
              messages.deadlineSoon,
              messages.deadlineSoonHelp,
              'number',
              data.deadline_soon_days,
            ],
            [
              'evening_start',
              messages.eveningStart,
              messages.eveningStartHelp,
              'time',
              data.evening_start,
            ],
            [
              'shutdown_reminder_time',
              messages.shutdownTime,
              messages.shutdownTimeHelp,
              'time',
              data.shutdown_reminder_time ?? '',
            ],
          ].map(([key, label, help, type, initial]) => (
            <div className="workday-setting-row" key={key}>
              <label htmlFor={`workday-${String(key)}`}>{label}</label>
              <input
                id={`workday-${String(key)}`}
                name={String(key)}
                type={type === 'time' ? 'text' : String(type)}
                {...(type === 'time'
                  ? { pattern: '([01][0-9]|2[0-3]):[0-5][0-9]', placeholder: 'HH:mm' }
                  : {})}
                defaultValue={initial}
                aria-describedby={`workday-${String(key)}-help`}
                {...(key === 'default_task_duration_minutes'
                  ? { min: 5, max: 240, required: true }
                  : key === 'deadline_soon_days'
                    ? { min: 1, max: 14, required: true }
                    : {})}
              />
              <p id={`workday-${String(key)}-help`}>{help}</p>
            </div>
          ))}
          <Button variant="primary" type="submit" loading={busy}>
            {messages.repeatSave}
          </Button>
          {saved ? <span role="status">{messages.saved}</span> : null}
        </form>
      )}
      {error !== null ? <p role="alert">{error}</p> : null}
    </section>
  );
}
