import { messagesFor, type Messages } from '../../i18n';

export function LaterPage({ titleKey }: { readonly titleKey: keyof Messages }) {
  const messages = messagesFor(navigator.language);
  return (
    <section className="page">
      <header className="page-header">
        <h1>{messages[titleKey]}</h1>
      </header>
      <p className="lede">{messages.laterHint}</p>
    </section>
  );
}
