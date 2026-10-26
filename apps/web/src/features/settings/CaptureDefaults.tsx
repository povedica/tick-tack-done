import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { captureSettings, type CaptureSettings } from '@reflexionia/domain';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { Button, SkeletonRows } from '../../components/ui';
import { collectProjects, collectTags } from '../tasks/collect';
import { failureMessage } from '../../failure';
import './capture-settings.css';

export function CaptureDefaults() {
  const m = useMessages();
  const cache = useQueryClient();
  const account = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: collectProjects });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags });
  const [draft, setDraft] = useState<CaptureSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const value = draft ?? captureSettings(account.data?.capture_settings);
  function set<K extends keyof CaptureSettings>(key: K, next: CaptureSettings[K]) {
    setDraft({ ...value, [key]: next });
    setStatus('');
    setError('');
  }
  const reminderChoices = [
    ['inherit', m.captureReminderInherit],
    ['none', m.captureReminderNone],
    ['-PT0M', m.captureReminderOnTime],
    ['-PT5M', m.captureReminder5],
    ['-PT15M', m.captureReminder15],
    ['-PT30M', m.captureReminder30],
    ['-PT1H', m.captureReminder60],
    ['-P1D', m.captureReminderDay],
  ] as const;
  function select(
    key: keyof CaptureSettings,
    label: string,
    choices: readonly (readonly [string, string])[],
    hint?: string,
  ) {
    return (
      <Row label={label} hint={hint}>
        <select
          aria-label={label}
          value={String(value[key] ?? '')}
          onChange={(event) => {
            set(
              key,
              (key === 'default_duration_minutes'
                ? event.target.value === ''
                  ? null
                  : Number(event.target.value)
                : event.target.value === ''
                  ? null
                  : event.target.value) as CaptureSettings[typeof key],
            );
          }}
        >
          {choices.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </Row>
    );
  }
  function toggle(
    key:
      | 'recognize_dates'
      | 'remove_date_text'
      | 'recognize_tags'
      | 'remove_tag_text'
      | 'parse_url_title',
    label: string,
    hint?: string,
  ) {
    return (
      <Row label={label} hint={hint}>
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={value[key]}
          disabled={
            (key === 'remove_date_text' && !value.recognize_dates) ||
            (key === 'remove_tag_text' && !value.recognize_tags)
          }
          onChange={(event) => {
            set(key, event.target.checked);
          }}
        />
      </Row>
    );
  }
  if (account.isPending) return <SkeletonRows />;
  if (account.isError) return <p role="alert">{m.settingsFailed}</p>;
  const lists =
    projects.data?.items.filter(
      (row) =>
        !row.closed &&
        (!row.is_inbox || row.id === value.default_list_id) &&
        row.kind.toLowerCase() !== 'note',
    ) ?? [];
  const knownList =
    value.default_list_id === null || lists.some((row) => row.id === value.default_list_id);
  const knownTag =
    value.default_tag_id === null ||
    tags.data?.items.some((row) => row.id === value.default_tag_id);
  return (
    <form
      className="capture-defaults"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setStatus('');
        void api
          .updateMe({ capture_settings: value })
          .then((saved) => {
            cache.setQueryData(['me'], saved);
            setDraft(null);
            setStatus(m.saved);
          })
          .catch((caught: unknown) => {
            setError(failureMessage(caught, m.saveFailed));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <p>{m.captureDefaultsHint}</p>
      <fieldset disabled={busy}>
        <legend>{m.captureRecognition}</legend>
        {toggle('recognize_dates', m.captureRecognizeDates, m.captureRecognizeDatesHint)}
        {toggle('remove_date_text', m.captureRemoveDates)}
        {toggle('recognize_tags', m.captureRecognizeTags)}
        {toggle('remove_tag_text', m.captureRemoveTags)}
        {toggle('parse_url_title', m.captureParseUrl, m.captureParseUrlHint)}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>{m.captureTaskDefaults}</legend>
        {select('default_date', m.captureDefaultDate, [
          ['none', m.noDate],
          ['today', m.navToday],
          ['tomorrow', m.navTomorrow],
        ])}
        {select('default_date_mode', m.captureDefaultDateMode, [
          ['date', m.captureDateOnly],
          ['date_time', m.captureDateTime],
        ])}
        {value.default_date_mode === 'date_time' ? (
          <Row label={m.captureDefaultTime}>
            <input
              type="time"
              aria-label={m.captureDefaultTime}
              required
              value={value.default_time}
              onChange={(event) => {
                set('default_time', event.target.value);
              }}
            />
          </Row>
        ) : null}
        {select('default_duration_minutes', m.captureDefaultDuration, [
          ['', m.captureNoDuration],
          ...[
            ...new Set([
              '15',
              '30',
              '45',
              '60',
              '90',
              '120',
              ...(value.default_duration_minutes === null
                ? []
                : [String(value.default_duration_minutes)]),
            ]),
          ].map((minutes) => [minutes, `${minutes} min`] as const),
        ])}
        {select('timed_reminder', m.captureTimedReminder, reminderChoices)}
        {select(
          'all_day_reminder',
          m.captureAllDayReminder,
          reminderChoices,
          m.captureReminderHint,
        )}
        {select('default_priority', m.captureDefaultPriority, [
          ['none', m.priorityNone],
          ['low', m.priorityLow],
          ['medium', m.priorityMedium],
          ['high', m.priorityHigh],
        ])}
        {select('default_tag_id', m.captureDefaultTag, [
          ['', m.noTag],
          ...(tags.data?.items ?? []).map((tag) => [tag.id, tag.name] as const),
        ])}
        {select('default_list_id', m.captureDefaultList, [
          ['', m.smartInbox],
          ...lists.map((list) => [list.id, list.is_inbox ? m.smartInbox : list.name] as const),
        ])}
        {!knownList || !knownTag ? <p role="alert">{m.captureUnavailable}</p> : null}
        {projects.isError || tags.isError ? <p role="alert">{m.settingsFailed}</p> : null}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>{m.capturePlacement}</legend>
        {select('new_task_position', m.captureNewPosition, [
          ['top', m.capturePositionTop],
          ['bottom', m.capturePositionBottom],
        ])}
        {select('overdue_position', m.captureOverduePosition, [
          ['top', m.capturePositionTop],
          ['bottom', m.capturePositionBottom],
        ])}
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
      {status ? <p role="status">{status}</p> : null}
      <Button
        type="submit"
        disabled={
          busy || draft === null || !knownList || !knownTag || projects.isError || tags.isError
        }
      >
        {m.saveChanges}
      </Button>
    </form>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="capture-setting-row">
      <div>
        <span>{label}</span>
        {hint ? <p>{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
