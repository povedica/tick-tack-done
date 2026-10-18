import { buildRepeatRule, describeRepeatRule, type Weekday } from '@reflexionia/domain';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { messagesFor, type Messages } from '../../i18n';
import { newMutation, runOrQueue } from '../offline/client';
import { tasksApi } from '../today/api';

const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function weekdayLabel(messages: Messages, day: Weekday): string {
  switch (day) {
    case 'MO':
      return messages.weekdayMO;
    case 'TU':
      return messages.weekdayTU;
    case 'WE':
      return messages.weekdayWE;
    case 'TH':
      return messages.weekdayTH;
    case 'FR':
      return messages.weekdayFR;
    case 'SA':
      return messages.weekdaySA;
    case 'SU':
      return messages.weekdaySU;
  }
}

export function RepeatPage() {
  const messages = messagesFor(navigator.language);
  const [params] = useSearchParams();
  const taskId = params.get('task');
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [interval, setIntervalValue] = useState(1);
  const [days, setDays] = useState<readonly Weekday[]>(['MO']);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const built = buildRepeatRule({
    freq,
    interval,
    ...(freq === 'weekly' ? { weekdays: days } : {}),
  });
  const rule = advanced ? raw : built.ok ? built.rule : '';
  const label = rule.length > 0 ? describeRepeatRule(rule) : null;

  function toggleDay(day: Weekday): void {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  async function save(): Promise<void> {
    if (taskId === null || rule.length === 0) {
      setStatus(messages.repeatInvalid);
      return;
    }
    const body: Record<string, unknown> = {
      repeat_rule: rule,
      field_clocks: { repeat_rule: new Date().toISOString() },
    };
    if (title.trim().length > 0) {
      body.title = title.trim();
      body.field_clocks = {
        repeat_rule: new Date().toISOString(),
        title: new Date().toISOString(),
      };
    }
    const outcome = await runOrQueue(newMutation('update', taskId, body), () =>
      tasksApi.updateTask(taskId, {
        repeat_rule: rule,
        ...(title.trim().length > 0 ? { title: title.trim() } : {}),
        field_clocks: body.field_clocks as Record<string, string>,
      }),
    );
    setStatus(outcome.queued ? messages.repeatQueued : messages.repeatSaved);
  }

  return (
    <section className="today">
      <header className="today-head">
        <div>
          <h1>{messages.repeatTitle}</h1>
          <p className="today-date">{messages.repeatHint}</p>
        </div>
      </header>
      <form
        className="task-group"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          {messages.repeatFreq}
          <select
            value={freq}
            onChange={(event) => {
              setFreq(event.target.value as typeof freq);
            }}
          >
            <option value="daily">{messages.repeatDaily}</option>
            <option value="weekly">{messages.repeatWeekly}</option>
            <option value="monthly">{messages.repeatMonthly}</option>
            <option value="yearly">{messages.repeatYearly}</option>
          </select>
        </label>
        <label>
          {messages.repeatInterval}
          <input
            type="number"
            min={1}
            max={999}
            value={interval}
            onChange={(event) => {
              setIntervalValue(Number(event.target.value));
            }}
          />
        </label>
        {freq === 'weekly' ? (
          <fieldset>
            <legend>{messages.repeatWeekdays}</legend>
            {WEEKDAYS.map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={() => {
                    toggleDay(day);
                  }}
                />
                {weekdayLabel(messages, day)}
              </label>
            ))}
          </fieldset>
        ) : null}
        <label>
          {messages.repeatTaskTitle}
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </label>
        <p>{label ?? messages.repeatInvalid}</p>
        <label>
          <input
            type="checkbox"
            checked={advanced}
            onChange={(event) => {
              setAdvanced(event.target.checked);
              if (event.target.checked && built.ok) {
                setRaw(built.rule);
              }
            }}
          />
          {messages.repeatAdvanced}
        </label>
        {advanced ? (
          <label>
            {messages.repeatRaw}
            <textarea
              value={raw}
              onChange={(event) => {
                setRaw(event.target.value);
              }}
            />
          </label>
        ) : null}
        <button type="submit">{messages.repeatSave}</button>
        {status !== null ? <p role="status">{status}</p> : null}
      </form>
    </section>
  );
}
