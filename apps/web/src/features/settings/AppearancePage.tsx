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
      <fieldset className="theme-options">
        <legend>{messages.themeLabel}</legend>
        {OPTIONS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="theme"
              value={option}
              checked={preference === option}
              onChange={() => {
                setPreference(option);
              }}
            />
            {labels[option]}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
