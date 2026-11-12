import { CalendarDays } from 'lucide-react';
import { DatePopover } from '../../components/DatePopover';
import { Popover } from '../../components/Popover';
import { useMemo, useRef, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import type { Countdown, CountdownColor, CountdownDraft, CountdownType, RepeatRule } from './api';
import { typeLabels } from './presentation';
import { formatCountdownDay, parseCountdownDay } from './civil-date';

const REMINDER_OFFSETS = [0, 1, 2, 3, 7] as const;
const COLORS = ['none', 'blue', 'teal', 'orange', 'pink', 'purple'] as const;

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
  const locale = useAppLocale();
  const messages = useMessages();
  const [draft, setDraft] = useState(() => draftFor(type, countdown));
  const [dateText, setDateText] = useState(() =>
    formatCountdownDay(countdown?.targetDate.slice(0, 10) ?? '', locale),
  );
  const dateAnchor = useRef<HTMLButtonElement>(null);
  const emojiAnchor = useRef<HTMLButtonElement>(null);
  const [picker, setPicker] = useState<'date' | 'emoji' | null>(null);
  const [emojiText, setEmojiText] = useState('');
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('ttd.countdown-emojis') ?? '[]');
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string').slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  const calendarValue = useMemo(
    () => ({
      dueDate: draft.targetDate === '' ? null : `${draft.targetDate}T00:00:00Z`,
      allDay: true,
      durationMinutes: null,
      reminder: null,
      reminderTouched: false,
      repeatRule: null,
    }),
    [draft.targetDate],
  );
  const selectEmoji = (emoji: string): void => {
    setDraft((current) => ({ ...current, emoji }));
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem('ttd.countdown-emojis', JSON.stringify(next));
    } catch {
      /* Picker remains usable without storage. */
    }
    setPicker(null);
  };
  const [customDays, setCustomDays] = useState('');
  const offsetDays = new Set(
    draft.reminders.filter((item) => !item.constant).map((item) => item.offsetDays),
  );
  const colors =
    draft.color !== null && !COLORS.some((color) => color === draft.color)
      ? [...COLORS, draft.color]
      : COLORS;
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
  const colorLabel = (value: CountdownColor): string => {
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
        <div className="countdown-identity">
          <button
            type="button"
            className="countdown-emoji-trigger"
            ref={emojiAnchor}
            aria-label={messages.countdownEmoji}
            aria-expanded={picker === 'emoji'}
            onClick={() => {
              setPicker(picker === 'emoji' ? null : 'emoji');
            }}
          >
            {draft.emoji ?? '⏳'}
          </button>
          <Popover
            open={picker === 'emoji'}
            onClose={() => {
              setPicker(null);
            }}
            label={messages.countdownEmoji}
            anchor={emojiAnchor}
            className="popover countdown-emoji-picker"
            mobileSheet
          >
            {recent.length > 0 ? (
              <>
                <h3>{messages.countdownEmojiRecent}</h3>
                <div className="countdown-emoji-tray">
                  {recent.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => {
                        selectEmoji(emoji);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <h3>{messages.countdownEmojiSuggested}</h3>
            <div className="countdown-emoji-tray">
              {[
                '⏳',
                '🎂',
                '🎉',
                '✈️',
                '🏖️',
                '💍',
                '🎓',
                '📚',
                '🎄',
                '🎆',
                '❤️',
                '🏠',
                '🏃',
                '🎵',
                '🌟',
                '🗓️',
              ].map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => {
                    selectEmoji(emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <label>
              {messages.countdownEmojiPaste}
              <input
                value={emojiText}
                onChange={(event) => {
                  setEmojiText(event.target.value);
                }}
              />
            </label>
            <Button
              type="button"
              disabled={!isSingleEmoji(emojiText)}
              onClick={() => {
                selectEmoji(emojiText.trim());
              }}
            >
              {messages.saveChanges}
            </Button>
            {emojiText !== '' && !isSingleEmoji(emojiText) ? (
              <p role="status">{messages.countdownEmojiInvalid}</p>
            ) : null}
          </Popover>
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
        </div>
        <div className="countdown-date-field">
          <span>{messages.countdownDateField}</span>
          <button
            type="button"
            ref={dateAnchor}
            className="countdown-date-trigger"
            aria-label={messages.countdownOpenCalendar}
            aria-expanded={picker === 'date'}
            onClick={() => {
              setPicker(picker === 'date' ? null : 'date');
            }}
          >
            <CalendarDays size={18} />
            {dateText || messages.countdownDatePlaceholder}
          </button>
          <DatePopover
            open={picker === 'date'}
            anchor={dateAnchor}
            mode="date-only"
            timeZone="UTC"
            value={calendarValue}
            onClose={() => {
              setPicker(null);
            }}
            onApply={(next) => {
              const day = next.dueDate?.slice(0, 10) ?? '';
              setDraft((current) => ({ ...current, targetDate: day }));
              setDateText(formatCountdownDay(day, locale));
              setPicker(null);
            }}
          />
          <input
            type="text"
            aria-label={messages.countdownDateField}
            placeholder={messages.countdownDatePlaceholder}
            value={dateText}
            required
            aria-invalid={dateText.length > 0 && draft.targetDate.length === 0}
            onChange={(event) => {
              const text = event.target.value;
              const iso = parseCountdownDay(text, locale);
              setDateText(text);
              setDraft({ ...draft, targetDate: iso ?? '' });
            }}
          />
        </div>
        <fieldset className="countdown-type-chips">
          <legend>{messages.countdownTypeField}</legend>
          {(Object.entries(typeLabels(messages)) as [CountdownType, string][]).map(
            ([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={draft.type === value}
                onClick={() => {
                  setDraft({ ...draft, type: value });
                }}
              >
                {label}
              </button>
            ),
          )}
        </fieldset>
        <fieldset className="countdown-swatches">
          <legend>{messages.countdownColorField}</legend>
          {colors.map((value) => (
            <button
              type="button"
              key={value}
              data-color={value}
              aria-label={colorLabel(value)}
              title={colorLabel(value)}
              aria-pressed={(draft.color ?? 'none') === value}
              onClick={() => {
                setDraft({ ...draft, color: value === 'none' ? null : value });
              }}
            />
          ))}
        </fieldset>
        <details className="countdown-more-options">
          <summary>{messages.countdownMoreOptions}</summary>
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
                  if (offset >= 1 && offset <= 365 && !offsetDays.has(offset))
                    toggleReminder(offset);
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
        </details>
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

function isSingleEmoji(value: string): boolean {
  const text = value.trim();
  return (
    [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length === 1 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(text)
  );
}
