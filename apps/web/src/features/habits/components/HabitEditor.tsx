import { useState } from 'react';
import type { Habit, CreateHabitBody } from '@reflexionia/sdk';
import { HABIT_WEEKDAYS, type HabitWeekday } from '@reflexionia/domain';
import { Button } from '../../../components/ui';
import { useMessages } from '../../../i18n';
import { useHabitCopy } from '../copy';

export function HabitEditor({
  habit,
  onSave,
  onCancel,
  busy,
}: {
  habit?: Habit;
  onSave: (body: CreateHabitBody) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const m = useMessages();
  const t = useHabitCopy();
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? '');
  const [days, setDays] = useState<readonly HabitWeekday[]>(habit?.frequency ?? HABIT_WEEKDAYS);
  const [target, setTarget] = useState(habit?.goal.target_count ?? 1);
  const [times, setTimes] = useState(habit?.goal.times_per_period ?? 1);
  const [period] = useState(habit?.goal.period ?? 'day');
  const [reminder, setReminder] = useState(habit?.reminder_time ?? '');
  const [motivation, setMotivation] = useState(habit?.motivation_note ?? '');
  const [challenge, setChallenge] = useState<string>(
    habit?.challenge_days == null ? '' : String(habit.challenge_days),
  );
  const labels = [
    m.dayMonday,
    m.dayTuesday,
    m.dayWednesday,
    m.dayThursday,
    m.dayFriday,
    m.daySaturday,
    m.daySunday,
  ];
  return (
    <form
      className="habit-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name: name.trim(),
          icon: icon.trim() || null,
          goal: {
            period,
            target_count: target,
            times_per_period: period === 'day' ? target : times,
          },
          frequency: [...days],
          reminder_time: reminder || null,
          motivation_note: motivation || null,
          challenge_days: challenge === '' ? null : Number(challenge),
        });
      }}
    >
      <div className="habit-name-fields">
        <label>
          {m.habitName}
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label>
          {t.emoji}
          <input
            maxLength={40}
            value={icon}
            onChange={(e) => {
              setIcon(e.target.value);
            }}
          />
        </label>
      </div>
      <fieldset>
        <legend>{m.habitDays}</legend>
        <div className="habit-day-picker">
          {HABIT_WEEKDAYS.map((day, index) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={days.includes(day)}
                onChange={() => {
                  setDays((old) =>
                    old.includes(day) ? old.filter((item) => item !== day) : [...old, day],
                  );
                }}
              />
              {labels[index]}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        {m.habitTimes}
        <input
          type="number"
          min={1}
          max={1000}
          required
          value={target}
          onChange={(e) => {
            setTarget(Number(e.target.value));
          }}
        />
      </label>
      {period === 'week' ? (
        <label>
          {m.periodWeek}
          <input
            type="number"
            min={1}
            max={days.length}
            required
            value={times}
            onChange={(e) => {
              setTimes(Number(e.target.value));
            }}
          />
        </label>
      ) : null}
      <label>
        {t.challenge}
        <input
          type="number"
          min={1}
          max={10000}
          placeholder="21 / 30 / 100"
          value={challenge}
          onChange={(e) => {
            setChallenge(e.target.value);
          }}
        />
      </label>
      <label>
        {m.habitReminder}
        <input
          type="time"
          value={reminder}
          onChange={(e) => {
            setReminder(e.target.value);
          }}
        />
      </label>
      <label>
        {t.motivation}
        <textarea
          maxLength={500}
          value={motivation}
          onChange={(e) => {
            setMotivation(e.target.value);
          }}
        />
      </label>
      {habit ? <small className="ui-muted">{t.frequencyChange}</small> : null}
      <div className="habit-actions">
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || !days.length}>
          {t.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
