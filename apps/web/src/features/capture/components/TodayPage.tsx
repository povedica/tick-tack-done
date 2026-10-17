import { useNavigate } from 'react-router';
import { messagesFor } from '../../../i18n';
import { useCaptureNotice } from '../notice';
import { warningText } from './CaptureSheet';

export function TodayPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const notice = useCaptureNotice((state) => state.notice);

  return (
    <main className="today">
      <h1>{messages.todayTitle}</h1>
      <p>{messages.todayHint}</p>
      {notice !== null ? (
        <div className="notice" role="status">
          <p>
            {messages.created}: {notice.title}
          </p>
          {notice.warnings.map((warning) => (
            <p key={`${warning.code}-${warning.name ?? ''}`}>{warningText(messages, warning)}</p>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="fab"
        aria-keyshortcuts="N"
        onClick={() => {
          void navigate('/quick-add');
        }}
      >
        {messages.fab}
      </button>
    </main>
  );
}
