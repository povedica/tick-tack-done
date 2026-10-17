import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { messagesFor } from '../../i18n';
import { useCaptureNotice } from '../capture/notice';
import { warningText } from '../capture/components/CaptureSheet';
import { groupFromLocation, parseGroup, type TaskGroupKey } from './groups';

const GROUP_KEY = 'tick-tack-done.today.group';

export function TodayPage() {
  const messages = messagesFor(navigator.language);
  const navigate = useNavigate();
  const notice = useCaptureNotice((state) => state.notice);
  const [params, setParams] = useSearchParams();
  const group = groupFromLocation(params.get('group'), readGroup());
  const dateLabel = new Intl.DateTimeFormat(navigator.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  useEffect(() => {
    if (params.get('group') === group) {
      return;
    }
    const next = new URLSearchParams(params);
    next.set('group', group);
    setParams(next, { replace: true });
  }, [group, params, setParams]);

  function chooseGroup(value: TaskGroupKey): void {
    writeGroup(value);
    const next = new URLSearchParams(params);
    next.set('group', value);
    setParams(next, { replace: true });
  }

  return (
    <section className="today" aria-labelledby="today-heading">
      <header className="today-header">
        <div>
          <h1 id="today-heading">{messages.todayTitle}</h1>
          <p className="today-date">{dateLabel}</p>
        </div>
        <label className="group-field">
          {messages.groupLabel}
          <select
            value={group}
            onChange={(event) => {
              chooseGroup(parseGroup(event.target.value));
            }}
          >
            <option value="priority">{messages.groupPriority}</option>
            <option value="due">{messages.groupDue}</option>
            <option value="tag">{messages.groupTag}</option>
            <option value="list">{messages.groupList}</option>
          </select>
        </label>
      </header>
      <details className="plan" open>
        <summary>{messages.planTitle}</summary>
        <p>{messages.planEmpty}</p>
      </details>
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
      <div className="waiting">
        <p>{messages.todayWaiting}</p>
        <div className="waiting-actions">
          <button
            type="button"
            className="sidebar-capture"
            onClick={() => {
              void navigate('/quick-add');
            }}
          >
            {messages.fab}
          </button>
          <Link className="text-button" to="/inbox">
            {messages.reviewInbox}
          </Link>
        </div>
      </div>
    </section>
  );
}

function readGroup(): string | null {
  try {
    return localStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
}

function writeGroup(value: TaskGroupKey): void {
  localStorage.setItem(GROUP_KEY, value);
}
