import { useMessages } from '../../i18n';
import { useThemePreference } from '../../theme/store';
import type { ThemePreference } from '../../theme/preference';

const OPTIONS: readonly ThemePreference[] = ['auto', 'light', 'dark'];

export function AppearancePage() {
  const messages = useMessages();
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
  const labels: Record<ThemePreference, string> = {
    auto: messages.themeAuto,
    light: messages.themeLight,
    dark: messages.themeDark,
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{messages.appearanceTitle}</h1>
          <p className="lede">{messages.appearanceHint}</p>
        </div>
      </header>
      <div className="settings-choice">
        <p>{messages.themeLabel}</p>
        <div className="segmented" role="radiogroup" aria-label={messages.themeLabel}>
          {OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={preference === option ? 'is-active' : undefined}
              aria-pressed={preference === option}
              onClick={() => {
                setPreference(option);
              }}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
