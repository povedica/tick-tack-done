import { Link } from 'react-router';
import { useMessages } from '../i18n';

/** TTD-AUD-19: keep the URL and show a proper 404 instead of silent redirect. */
export function NotFoundPage() {
  const messages = useMessages();
  return (
    <main className="screen-page not-found-page">
      <h1>{messages.notFoundTitle}</h1>
      <p className="lede">{messages.notFoundBody}</p>
      <Link className="ui-button is-primary is-md" to="/today">
        {messages.notFoundHome}
      </Link>
    </main>
  );
}
