import { Link } from 'react-router';
import { EmptyState } from '../../components/ui';
import { useMessages } from '../../i18n';

function AuthNote({ title, body }: { readonly title: string; readonly body: string }) {
  const messages = useMessages();
  return (
    <section className="screen-page">
      <h1>{title}</h1>
      <EmptyState
        title={title}
        body={body}
        action={<Link to="/today">{messages.backToday}</Link>}
      />
    </section>
  );
}

export function ForgotPage() {
  const messages = useMessages();
  return <AuthNote title={messages.forgotTitle} body={messages.forgotDev} />;
}
