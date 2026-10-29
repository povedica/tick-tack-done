import { useMessages } from '../../i18n';
import { usePreferences } from '../../theme/preferences';
import { CaptureDefaults } from '../settings/CaptureDefaults';
import { InboundEmailCard } from '../settings/InboundEmailCard';

export function CaptureSettings() {
  const messages = useMessages();
  const parser = usePreferences((state) => state.parser);
  const setParser = usePreferences((state) => state.setParser);
  return (
    <section className="token-settings">
      <header className="page-header">
        <div>
          <h1>{messages.settingsCapture}</h1>
          <p className="lede">{messages.captureLede}</p>
        </div>
      </header>
      <section className="token-panel">
        <div className="token-panel-head">
          <div>
            <h2 id="parser-title">{messages.parserLanguage}</h2>
            <p>{messages.parserHint}</p>
          </div>
        </div>
        <select
          id="parser-language"
          className="token-name is-short"
          aria-labelledby="parser-title"
          value={parser}
          onChange={(event) => {
            const value = event.target.value;
            setParser(value === 'en' || value === 'es' ? value : 'auto');
          }}
        >
          <option value="auto">{messages.languageAuto}</option>
          <option value="es">{messages.languageEs}</option>
          <option value="en">{messages.languageEn}</option>
        </select>
      </section>
      <CaptureDefaults />
      <InboundEmailCard />
    </section>
  );
}
