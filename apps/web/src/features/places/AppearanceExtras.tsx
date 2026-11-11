import { useMessages, type Messages } from '../../i18n';
import { useLocale } from '../../i18n/locale';
import { usePreferences, type AccentId } from '../../theme/preferences';

const ACCENTS: readonly AccentId[] = ['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'];
const ACCENT_COLOR: Readonly<Record<AccentId, string>> = {
  indigo: '#4772fa',
  violet: '#7c3aed',
  teal: '#0f766e',
  amber: '#b45309',
  rose: '#be123c',
  slate: '#44403c',
};

export function AppearanceExtras() {
  const messages = useMessages();
  const density = usePreferences((state) => state.density);
  const setDensity = usePreferences((state) => state.setDensity);
  const accent = usePreferences((state) => state.accent);
  const setAccent = usePreferences((state) => state.setAccent);
  const week = usePreferences((state) => state.weekStart);
  const setWeek = usePreferences((state) => state.setWeekStart);
  return (
    <>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.density}</h2>
            <p>{messages.densityHint}</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label={messages.density}>
          <button
            type="button"
            className={density === 'comfortable' ? 'is-active' : undefined}
            aria-pressed={density === 'comfortable'}
            onClick={() => {
              setDensity('comfortable');
            }}
          >
            {messages.densityComfortable}
          </button>
          <button
            type="button"
            className={density === 'compact' ? 'is-active' : undefined}
            aria-pressed={density === 'compact'}
            onClick={() => {
              setDensity('compact');
            }}
          >
            {messages.densityCompact}
          </button>
        </div>
      </section>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.accent}</h2>
            <p>{messages.accentHint}</p>
          </div>
        </div>
        <div className="accent-swatches" role="radiogroup" aria-label={messages.accent}>
          {ACCENTS.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              className={accent === item ? 'is-active' : undefined}
              style={{ background: ACCENT_COLOR[item] }}
              aria-label={accentName(messages, item)}
              aria-checked={accent === item}
              onClick={() => {
                setAccent(item);
              }}
            />
          ))}
        </div>
      </section>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2>{messages.weekStart}</h2>
            <p>{messages.weekStartHint}</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label={messages.weekStart}>
          <button
            type="button"
            className={week === 'monday' ? 'is-active' : undefined}
            aria-pressed={week === 'monday'}
            onClick={() => {
              setWeek('monday');
            }}
          >
            {messages.monday}
          </button>
          <button
            type="button"
            className={week === 'sunday' ? 'is-active' : undefined}
            aria-pressed={week === 'sunday'}
            onClick={() => {
              setWeek('sunday');
            }}
          >
            {messages.sunday}
          </button>
        </div>
      </section>
      <LanguageField />
    </>
  );
}

function accentName(messages: Messages, item: AccentId): string {
  switch (item) {
    case 'indigo':
      return messages.accentIndigo;
    case 'violet':
      return messages.accentViolet;
    case 'teal':
      return messages.accentTeal;
    case 'amber':
      return messages.accentAmber;
    case 'rose':
      return messages.accentRose;
    case 'slate':
      return messages.accentSlate;
  }
}

function LanguageField() {
  const messages = useMessages();
  const choice = useLocale((state) => state.choice);
  const setChoice = useLocale((state) => state.setChoice);
  return (
    <section className="token-panel">
      <div className="token-panel-head">
        <h2>{messages.language}</h2>
      </div>
      <div className="segmented" role="radiogroup" aria-label={messages.language}>
        {(['auto', 'es', 'en'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={choice === item ? 'is-active' : undefined}
            aria-pressed={choice === item}
            onClick={() => {
              setChoice(item);
            }}
          >
            {item === 'auto'
              ? messages.languageAuto
              : item === 'es'
                ? messages.languageEs
                : messages.languageEn}
          </button>
        ))}
      </div>
    </section>
  );
}
