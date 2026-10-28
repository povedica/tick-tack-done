import { Link } from 'react-router';
import { BrandMark } from '../../components/BrandMark';
import { useMessages } from '../../i18n';
import './auth.css';

export function PolicyPage({ terms = false }: { terms?: boolean }) {
  const m = useMessages();
  return (
    <main className="legal-screen">
      <article className="legal-doc">
        <header className="auth-brand">
          <BrandMark size={48} />
          <h1>{terms ? m.termsTitle : m.privacyTitle}</h1>
        </header>
        {terms ? (
          <>
            <p>{m.termsPurpose}</p>
            <p>{m.termsAccess}</p>
          </>
        ) : (
          <>
            <p>{m.privacyPurpose}</p>
            <section>
              <h2>{m.privacyCalendarTitle}</h2>
              <p>{m.privacyCalendar}</p>
            </section>
            <section>
              <h2>{m.privacyDriveTitle}</h2>
              <p>{m.privacyDrive}</p>
            </section>
            <p>{m.privacyLimitedUse}</p>
            <p>{m.privacyRetention}</p>
          </>
        )}
        <p>
          <a href="https://github.com/povedica/tick-tack-done/issues">{m.policyContact}</a>
        </p>
        <nav className="legal-nav">
          <Link to="/login">{m.loginTitle}</Link>
          <Link to={terms ? '/privacy' : '/terms'}>{terms ? m.privacyTitle : m.termsTitle}</Link>
        </nav>
      </article>
    </main>
  );
}
