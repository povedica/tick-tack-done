import { Sprout } from 'lucide-react';
import type { HabitSuggestion } from '../suggestions';
import { HABIT_SUGGESTIONS, buildHabitBody } from '../suggestions';
import { useMessages, type Messages } from '../../../i18n';

export function HabitsEmpty({
  onCreate,
  onOpen,
  onDismiss,
}: {
  readonly onCreate: (body: ReturnType<typeof buildHabitBody>) => void;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}) {
  const messages = useMessages();
  const chips = HABIT_SUGGESTIONS.filter(
    (item) => item.id === 'water' || item.id === 'read' || item.id === 'walk',
  );
  return (
    <section className="habits-empty">
      <span className="habits-empty-icon" aria-hidden="true">
        <Sprout size={24} />
      </span>
      <h2>{messages.habitsEmptyTitle}</h2>
      <p>{messages.habitsEmptyBody}</p>
      <div className="habits-empty-chips">
        {chips.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="ui-tag"
            onClick={() => {
              onCreate(suggestionBody(suggestion, messages));
            }}
          >
            {messages[suggestion.label]}
          </button>
        ))}
      </div>
      <button type="button" className="ui-button is-primary is-md" onClick={onOpen}>
        {messages.habitsEmptyCta}
      </button>
      <button type="button" className="text-button" onClick={onDismiss}>
        {messages.habitsEmptyDismiss}
      </button>
    </section>
  );
}

function suggestionBody(
  suggestion: HabitSuggestion,
  messages: Messages,
): ReturnType<typeof buildHabitBody> {
  return buildHabitBody({
    name: messages[suggestion.label],
    period: suggestion.period,
    times: suggestion.times,
    days: suggestion.days,
    reminderTime: suggestion.reminderTime,
  });
}
