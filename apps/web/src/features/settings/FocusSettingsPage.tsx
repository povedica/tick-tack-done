import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { api } from '../../api';
import { Button, ErrorState, SkeletonRows } from '../../components/ui';
import { useMessages } from '../../i18n';
import { failureMessage } from '../../failure';
import { playFocusSound } from '../focus/sounds';
import { runAction } from '../../components/run-action';
import '../focus/focus.css';
export function FocusSettingsPage() {
  const m = useMessages();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['focus-settings'],
    queryFn: () => api.getFocusSettings(),
    refetchInterval: 4000,
  });
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const value = (key: string, fallback: string | number | boolean): string | number | boolean => {
    const found = draft[key] ?? query.data?.[key];
    return typeof found === 'string' || typeof found === 'number' || typeof found === 'boolean' ? found : fallback;
  };
  const set = (key: string, next: string | number | boolean) => { setDraft((old) => ({ ...old, [key]: next })); };
  const numbers = [
    ['pomodoroMinutes', 'pomodoro_minutes', m.focusPomoDuration, 5, 180, 5, 25],
    ['shortBreakMinutes', 'short_break_minutes', m.focusShortBreak, 1, 60, 1, 5],
    ['longBreakMinutes', 'long_break_minutes', m.focusLongBreak, 5, 90, 1, 15],
    ['cyclesBeforeLongBreak', 'cycles_before_long_break', m.focusCycles, 1, 12, 1, 4],
    ['dailyGoal', 'daily_goal', m.focusDailyGoal, 1, 20, 1, 8],
  ] as const;
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(
        numbers.map(([key, apiKey, , , , , initial]) => [apiKey, Number(value(key, initial))]),
      );
      const saved = await api.updateFocusSettings({
        ...body,
        auto_start_breaks: Boolean(value('autoStartBreaks', false)),
        auto_start_focus: Boolean(value('autoStartFocus', false)),
        alarm_sound: String(value('alarmSound', 'bell')),
        volume: Number(value('volume', 70)),
        ambient_sound: String(value('ambientSound', 'none')),
      });
      cache.setQueryData(['focus-settings'], saved);
      setDraft({});
    } catch (caught) {
      setError(failureMessage(caught, m.settingsFailed));
    } finally {
      setBusy(false);
    }
  };
  if (query.isPending) return <SkeletonRows />;
  if (query.isError)
    return (
      <ErrorState
        title={m.loadFailed}
        retryLabel={m.retry}
        onRetry={() => { runAction(query.refetch()); }}
      />
    );
  return (
    <section className="focus-settings-page token-settings">
      <h1>{m.focusSettingsTitle}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runAction(save());
        }}
      >
        {numbers.map(([key, , label, min, max, step, initial]) => (
          <div className="focus-setting-row" key={key}>
            <label htmlFor={`focus-${key}`}>{label}</label>
            <div className="focus-stepper">
              <button
                type="button"
                aria-label={m.focusDecrease.replace('{label}', label)}
                onClick={() => { set(key, Math.max(min, Number(value(key, initial)) - step)); }}
              >
                −
              </button>
              <input
                id={`focus-${key}`}
                type="number"
                required
                min={min}
                max={max}
                step={step}
                value={Number(value(key, initial))}
                onChange={(event) => { set(key, event.target.value); }}
              />
              <button
                type="button"
                aria-label={m.focusIncrease.replace('{label}', label)}
                onClick={() => { set(key, Math.min(max, Number(value(key, initial)) + step)); }}
              >
                +
              </button>
            </div>
          </div>
        ))}
        {(
          [
            ['autoStartBreaks', m.focusAutoBreak],
            ['autoStartFocus', m.focusAutoFocus],
          ] as const
        ).map(([key, label]) => (
          <label className="focus-setting-row" key={key}>
            {label}
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(value(key, false))}
              onChange={(event) => { set(key, event.target.checked); }}
            />
          </label>
        ))}
        <div className="focus-setting-row">
          <label htmlFor="focus-alarm">{m.focusAlarmSound}</label>
          <div className="focus-sound-control">
            <select
              id="focus-alarm"
              value={String(value('alarmSound', 'bell'))}
              onChange={(event) => { set('alarmSound', event.target.value); }}
            >
              {(
                [
                  ['none', m.focusSoundNone],
                  ['bell', m.focusSoundBell],
                  ['chime', m.focusSoundChime],
                  ['digital', m.focusSoundDigital],
                ] as const
              ).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={m.focusSoundPreview}
              onClick={() =>
                playFocusSound(String(value('alarmSound', 'bell')), Number(value('volume', 70)))
              }
            >
              <Play size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="focus-setting-row">
          {m.focusVolume}
          <input
            type="range"
            min={0}
            max={100}
            value={Number(value('volume', 70))}
            onChange={(event) => { set('volume', Number(event.target.value)); }}
          />
        </label>
        <label className="focus-setting-row">
          {m.focusAmbient}
          <select
            value={String(value('ambientSound', 'none'))}
            onChange={(event) => { set('ambientSound', event.target.value); }}
          >
            {(
              [
                ['none', m.focusSoundNone],
                ['tick', m.focusSoundTick],
                ['rain', m.focusSoundRain],
                ['white_noise', m.focusSoundWhite],
              ] as const
            ).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="focus-setting-row">
          <span>{m.focusEndNotification}</span>
          <Link to="/settings/notifications">{m.settingsNotifications}</Link>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {m.saveChanges}
        </Button>
      </form>
    </section>
  );
}
