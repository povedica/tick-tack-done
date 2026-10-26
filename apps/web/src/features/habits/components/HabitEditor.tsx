import { useEffect, useRef, useState } from 'react';
import type { Habit, CreateHabitBody } from '@reflexionia/sdk';
import { HABIT_WEEKDAYS, type HabitWeekday } from '@reflexionia/domain';
import { Check, ChevronDown, X } from 'lucide-react';
import { PeriodNavigator } from '../../../components/period/PeriodNavigator';
import { Popover } from '../../../components/Popover';
import { Button } from '../../../components/ui';
import { NumberStepper } from '../../../components/NumberStepper';
import { useAppLocale } from '../../../i18n/locale';
import { useHabitCopy } from '../copy';

export function HabitEditor({
  habit,
  onSave,
  onCancel,
  busy,
  error,
}: {
  habit?: Habit;
  onSave: (body: CreateHabitBody) => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | undefined;
}) {
  const t = useHabitCopy(),
    locale = useAppLocale();
  const [name, setName] = useState(habit?.name ?? '');
  const [mode, setMode] = useState<'daily' | 'specific' | 'weekly'>(
    habit?.goal.period === 'week'
      ? 'weekly'
      : habit?.frequency.length === 7 || !habit
        ? 'daily'
        : 'specific',
  );
  const [days, setDays] = useState<readonly HabitWeekday[]>(habit?.frequency ?? HABIT_WEEKDAYS);
  const [quantity, setQuantity] = useState((habit?.goal.target_count ?? 1) > 1);
  const [target, setTarget] = useState(habit?.goal.target_count ?? 8);
  const [times, setTimes] = useState(habit?.goal.times_per_period ?? 3);
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [reminder, setReminder] = useState(habit?.reminder_time ?? '');
  const [showTime, setShowTime] = useState(!!habit?.reminder_time);
  const [advanced, setAdvanced] = useState(false);
  const [start, setStart] = useState(
    habit?.start_date ??
      habit?.created_at.slice(0, 10) ??
      new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  );
  const [challenge, setChallenge] = useState(habit?.challenge_days ?? null);
  const [motivation, setMotivation] = useState(habit?.motivation_note ?? '');
  const [invalid, setInvalid] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const labels = locale.startsWith('en')
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const footer = (
    <div className="habit-editor-footer">
      {error ? (
        <p className="habit-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t.cancel}
        </Button>
        <Button type="submit" form="habit-editor-form" variant="primary" loading={busy}>
          {t.save}
        </Button>
      </div>
      <small>{t.shortcuts}</small>
    </div>
  );
  return (
    <Popover
      open
      initialFocus={nameInput}
      centered
      mobileSheet
      width={440}
      label={habit ? t.edit : t.create}
      className="popover habit-editor-dialog"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <form
        id="habit-editor-form"
        className="habit-editor"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          if (!name.trim()) {
            setInvalid(true);
            setAdvanced(false);
            requestAnimationFrame(() => nameInput.current?.focus());
            return;
          }
          // Ticky could complement this form with optional suggestions later; saving is entirely deterministic.
          const goal = quantity ? target : 1;
          onSave({
            name: name.trim(),
            goal: {
              period: mode === 'weekly' ? 'week' : 'day',
              target_count: goal,
              times_per_period: mode === 'weekly' ? times : goal,
            },
            frequency: [...(mode === 'specific' ? days : HABIT_WEEKDAYS)],
            reminder_time: showTime ? reminder || null : null,
            motivation_note: motivation.trim() || null,
            challenge_days: challenge,
            unit: quantity ? unit.trim() || null : null,
            start_date: start || null,
          });
        }}
      >
        <header className="habit-editor-heading">
          <h2>{habit ? t.edit : t.create}</h2>
          <Button
            variant="ghost"
            type="button"
            aria-label={t.close}
            disabled={busy}
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </header>
        <div className="habit-editor-fields">
          <>
            <label className="habit-field">
              {t.name}
              <input
                autoFocus
                required
                ref={nameInput}
                name="habit-title"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={name}
                placeholder={t.placeholder}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'habit-name-error' : undefined}
                maxLength={200}
                onChange={(e) => {
                  setName(e.target.value);
                  setInvalid(false);
                }}
              />
            </label>
            {invalid ? (
              <small className="habit-field-error" id="habit-name-error" role="alert">
                {t.nameRequired}
              </small>
            ) : null}
            <fieldset>
              <legend>{t.frequency}</legend>
              <div className="segmented habit-segments" role="group" aria-label={t.frequency}>
                {(['daily', 'specific', 'weekly'] as const).map((key) => (
                  <Button
                    variant="ghost"
                    key={key}
                    className={mode === key ? 'is-active' : undefined}
                    type="button"
                    aria-pressed={mode === key}
                    onClick={() => {
                      setMode(key);
                    }}
                  >
                    {t[key]}
                  </Button>
                ))}
              </div>
              {mode === 'specific' ? (
                <div className="habit-day-picker">
                  {HABIT_WEEKDAYS.map((day, i) => (
                    <Button
                      variant="ghost"
                      type="button"
                      key={day}
                      aria-label={new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
                        new Date(2026, 0, 5 + i),
                      )}
                      aria-pressed={days.includes(day)}
                      onClick={() => {
                        setDays((old) =>
                          old.includes(day)
                            ? old.length === 1
                              ? old
                              : old.filter((d) => d !== day)
                            : [...old, day],
                        );
                      }}
                    >
                      {labels[i]}
                      {days.includes(day) ? (
                        <Check className="habit-day-check" size={10} aria-hidden="true" />
                      ) : null}
                    </Button>
                  ))}
                </div>
              ) : null}
              {mode === 'weekly' ? (
                <NumberStepper value={times} max={7} label={t.weekly} onChange={setTimes} />
              ) : null}
            </fieldset>
            <fieldset>
              <legend>{t.dailyGoal}</legend>
              <div className="segmented habit-segments" role="group" aria-label={t.dailyGoal}>
                <Button
                  variant="ghost"
                  type="button"
                  className={!quantity ? 'is-active' : undefined}
                  aria-pressed={!quantity}
                  onClick={() => {
                    setQuantity(false);
                  }}
                >
                  {t.binary}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className={quantity ? 'is-active' : undefined}
                  aria-pressed={quantity}
                  onClick={() => {
                    setQuantity(true);
                    if (target === 1) setTarget(8);
                  }}
                >
                  {t.quantity}
                </Button>
              </div>
              {quantity ? (
                <div className="habit-quantity-fields">
                  <NumberStepper value={target} max={1000} label={t.count} onChange={setTarget} />
                  <input
                    aria-label={t.unit}
                    placeholder={t.unitPlaceholder}
                    maxLength={32}
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value);
                    }}
                  />
                </div>
              ) : null}
            </fieldset>
            {showTime ? (
              <div className="habit-reminder">
                <label>
                  {t.reminder}
                  <input
                    type="time"
                    lang="es-ES"
                    pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                    aria-label={t.reminder}
                    value={reminder}
                    onChange={(e) => {
                      setReminder(e.target.value);
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  type="button"
                  aria-label={t.removeTime}
                  onClick={() => {
                    setShowTime(false);
                    setReminder('');
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                type="button"
                className="habit-add-time"
                onClick={() => {
                  setShowTime(true);
                  setReminder('09:00');
                }}
              >
                {t.addTime}
              </Button>
            )}
            <Button
              variant="ghost"
              type="button"
              className="habit-more"
              aria-expanded={advanced}
              aria-controls="habit-advanced-fields"
              onClick={() => {
                setAdvanced((open) => !open);
              }}
            >
              {t.more} <ChevronDown size={16} aria-hidden="true" />
            </Button>
            <div id="habit-advanced-fields" className="habit-advanced-fields" hidden={!advanced}>
              <div className="habit-field">
                <span>{t.start}</span>
                <PeriodNavigator
                  className="habit-start-date"
                  title={t.start}
                  label={t.start}
                  date={new Date(`${start || '2026-01-01'}T12:00:00`)}
                  onPick={(date) => {
                    setStart(
                      `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
                    );
                  }}
                />
              </div>
              <fieldset>
                <legend>{t.duration}</legend>
                <div className="segmented habit-challenge-chips">
                  {[null, 21, 30, 100].map((n) => (
                    <Button
                      variant="ghost"
                      type="button"
                      key={String(n)}
                      className={challenge === n ? 'is-active' : undefined}
                      aria-pressed={challenge === n}
                      onClick={() => {
                        setChallenge(n);
                      }}
                    >
                      {n === null ? t.forever : `${String(n)} ${t.days}`}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <label className="habit-field">
                {t.motivation}
                <textarea
                  rows={2}
                  value={motivation}
                  maxLength={500}
                  onChange={(e) => {
                    setMotivation(e.target.value);
                  }}
                />
              </label>
            </div>
          </>
        </div>
        {footer}
      </form>
    </Popover>
  );
}
