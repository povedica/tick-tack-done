import { useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import type { Countdown, CountdownDraft, CountdownType, RepeatRule } from './api';
import { TYPE_LABEL } from './presentation';

const REMINDER_OFFSETS = [0, 1, 2, 3, 7] as const;
const COLORS = [
  'none',
  'blue',
  'teal',
  'green',
  'lime',
  'orange',
  'red',
  'pink',
  'purple',
  'navy',
  'brown',
  'black',
  'rainbow',
] as const;

function draftFor(type: CountdownType, value?: Countdown): CountdownDraft {
  return {
    title: value?.title ?? '',
    type: value?.type ?? type,
    emoji: value?.emoji ?? null,
    targetDate: value?.targetDate.slice(0, 10) ?? '',
    repeatRule:
      value?.repeatRule ?? (type === 'anniversary' || type === 'birthday' ? 'yearly' : 'none'),
    dayMode: value?.dayMode ?? 'standard',
    color: value?.color ?? null,
    notes: value?.notes ?? null,
    showInSidebar: value?.showInSidebar ?? true,
    showInSmartList: value?.showInSmartList ?? true,
    reminders: value?.reminders ?? [],
  };
}

export function CountdownDialog({
  type,
  countdown,
  onClose,
  onSave,
}: {
  readonly type: CountdownType;
  readonly countdown?: Countdown;
  readonly onClose: () => void;
  readonly onSave: (draft: CountdownDraft) => void;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const dateLang = locale.toLowerCase().startsWith('en') ? 'en-GB' : 'es-ES';
  const [draft, setDraft] = useState(() => draftFor(type, countdown));
  const [customDays, setCustomDays] = useState('');
  const offsetDays = new Set(
    draft.reminders.filter((item) => !item.constant).map((item) => item.offsetDays),
  );
  const constant = draft.reminders.some((item) => item.constant);
  const reminderLabel = (offset: number): string => {
    switch (offset) {
      case 0:
        return messages.countdownReminderSameDay;
      case 1:
        return messages.countdownReminder1d;
      case 2:
        return messages.countdownReminder2d;
      case 3:
        return messages.countdownReminder3d;
      case 7:
        return messages.countdownReminder1w;
      default:
        return messages.countdownReminderCustom;
    }
  };
  const colorLabel = (value: (typeof COLORS)[number]): string => {
    switch (value) {
      case 'none':
        return messages.countdownColorNone;
      case 'blue':
        return messages.countdownColorBlue;
      case 'teal':
        return messages.countdownColorTeal;
      case 'green':
        return messages.countdownColorGreen;
      case 'lime':
        return messages.countdownColorLime;
      case 'orange':
        return messages.countdownColorOrange;
      case 'red':
        return messages.countdownColorRed;
      case 'pink':
        return messages.countdownColorPink;
      case 'purple':
        return messages.countdownColorPurple;
      case 'navy':
        return messages.countdownColorNavy;
      case 'brown':
        return messages.countdownColorBrown;
      case 'black':
        return messages.countdownColorBlack;
      case 'rainbow':
        return messages.countdownColorRainbow;
      default: {
        const unreachable: never = value;
        return unreachable;
      }
    }
  };
  const toggleReminder = (offset: number): void => {
    setDraft((current) => ({
      ...current,
      reminders: current.reminders.some((item) => !item.constant && item.offsetDays === offset)
        ? current.reminders.filter((item) => item.constant === true || item.offsetDays !== offset)
        : [...current.reminders, { offsetDays: offset }],
    }));
  };
  return (
    <Modal
      title={countdown === undefined ? messages.countdownDialogNew : messages.countdownDialogEdit}
      onClose={onClose}
    >
      <form
        className="countdown-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.title.trim().length > 0 && draft.targetDate.length > 0)
            onSave({ ...draft, title: draft.title.trim() });
        }}
      >
        <label>
          {messages.countdownEmoji}
          <input
            aria-label={messages.countdownEmoji}
            value={draft.emoji ?? ''}
            maxLength={8}
            placeholder="⏳"
            onChange={(event) => {
              setDraft({ ...draft, emoji: event.target.value === '' ? null : event.target.value });
            }}
          />
        </label>
        <label>
          {messages.countdownTitleField}
          <input
            autoFocus
            value={draft.title}
            maxLength={200}
            required
            onChange={(event) => {
              setDraft({ ...draft, title: event.target.value });
            }}
          />
        </label>
        <label>
          {messages.countdownDateField}
          <input
            type="date"
            lang={dateLang}
            value={draft.targetDate}
            required
            onChange={(event) => {
              setDraft({ ...draft, targetDate: event.target.value });
            }}
          />
        </label>
        <label>
          {messages.countdownTypeField}
          <select
            className="ui-select"
            value={draft.type}
            onChange={(event) => {
              setDraft({ ...draft, type: event.target.value as CountdownType });
            }}
          >
            {(Object.entries(TYPE_LABEL) as [CountdownType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {messages.countdownColorField}
          <select
            className="ui-select"
            value={draft.color ?? 'none'}
            onChange={(event) => {
              setDraft({
                ...draft,
                color:
                  event.target.value === 'none'
                    ? null
                    : (event.target.value as CountdownDraft['color']),
              });
            }}
          >
            {COLORS.map((value) => (
              <option key={value} value={value}>
                {colorLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {messages.countdownRepeatField}
          <select
            className="ui-select"
            value={draft.repeatRule}
            onChange={(event) => {
              setDraft({ ...draft, repeatRule: event.target.value as RepeatRule });
            }}
          >
            <option value="none">{messages.countdownRepeatNone}</option>
            <option value="daily">{messages.countdownRepeatDaily}</option>
            <option value="weekly">{messages.countdownRepeatWeekly}</option>
            <option value="monthly">{messages.countdownRepeatMonthly}</option>
            <option value="yearly">{messages.countdownRepeatYearly}</option>
          </select>
        </label>
        <fieldset>
          <legend>{messages.countdownReminders}</legend>
          {REMINDER_OFFSETS.map((offset) => (
            <label key={offset}>
              <input
                type="checkbox"
                checked={offsetDays.has(offset)}
                onChange={() => {
                  toggleReminder(offset);
                }}
              />
              {reminderLabel(offset)}
            </label>
          ))}
          <label>
            {messages.countdownReminderCustom}
            <input
              type="number"
              min="1"
              max="365"
              value={customDays}
              onChange={(event) => {
                setCustomDays(event.target.value);
              }}
              onBlur={() => {
                const offset = Number(customDays);
                if (offset >= 1 && offset <= 365 && !offsetDays.has(offset)) toggleReminder(offset);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={constant}
              onChange={() => {
                setDraft((current) => ({
                  ...current,
                  reminders: constant
                    ? current.reminders.filter((item) => !item.constant)
                    : [...current.reminders, { offsetDays: 0, constant: true }],
                }));
              }}
            />
            {messages.countdownReminderConstant}
          </label>
        </fieldset>
        <fieldset>
          <legend>{messages.countdownDayMode}</legend>
          <label>
            <input
              type="radio"
              checked={draft.dayMode === 'standard'}
              onChange={() => {
                setDraft({ ...draft, dayMode: 'standard' });
              }}
            />
            {messages.countdownDayModeStandard}
          </label>
          <label>
            <input
              type="radio"
              checked={draft.dayMode === 'plus_one'}
              onChange={() => {
                setDraft({ ...draft, dayMode: 'plus_one' });
              }}
            />
            {messages.countdownDayModePlusOne}
          </label>
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={draft.showInSmartList}
            onChange={(event) => {
              setDraft({ ...draft, showInSmartList: event.target.checked });
            }}
          />
          {messages.countdownShowInToday}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.showInSidebar}
            onChange={(event) => {
              setDraft({ ...draft, showInSidebar: event.target.checked });
            }}
          />
          {messages.countdownShowInSidebar}
        </label>
        <label>
          {messages.countdownNotes}
          <textarea
            value={draft.notes ?? ''}
            onChange={(event) => {
              setDraft({ ...draft, notes: event.target.value || null });
            }}
          />
        </label>
        <div className="countdown-dialog-actions">
          <Button type="button" onClick={onClose}>
            {messages.cancel}
          </Button>
          <Button variant="primary" type="submit">
            {messages.repeatSave}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
