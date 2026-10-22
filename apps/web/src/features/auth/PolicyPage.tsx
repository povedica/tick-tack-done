import { Link } from 'react-router';
import { useMessages } from '../../i18n';

export function PolicyPage({ terms = false }: { terms?: boolean }) {
  const m = useMessages();
  return (
    <main className="screen-page" style={{ maxWidth: 'var(--content-max)', margin: 'auto' }}>
      <h1>{terms ? m.termsTitle : m.privacyTitle}</h1>
      {terms ? (
        <>
          <p>{m.termsPurpose}</p>
          <p>{m.termsAccess}</p>
        </>
      ) : (
        <>
          <p>{m.privacyPurpose}</p>
          <h2>Google Calendar</h2>
          <p>{m.privacyCalendar}</p>
          <h2>Google Drive</h2>
          <p>{m.privacyDrive}</p>
          <p>{m.privacyLimitedUse}</p>
          <p>{m.privacyRetention}</p>
        </>
      )}
      <p>
        <a href="https://github.com/povedica/tick-tack-done/issues">{m.policyContact}</a>
      </p>
      <nav>
        <Link to="/login">{m.loginTitle}</Link> ·{' '}
        <Link to={terms ? '/privacy' : '/terms'}>{terms ? m.privacyTitle : m.termsTitle}</Link>
      </nav>
    </main>
  );
}
