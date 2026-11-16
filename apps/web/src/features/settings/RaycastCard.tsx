import { Link } from 'react-router';
import { useMessages } from '../../i18n';
import { ServiceMark } from './integration-ui';

export function RaycastCard() {
  const messages = useMessages();
  return (
    <article className="integration-row raycast-card" aria-labelledby="raycast-title">
      <div className="integration-head">
        <div className="integration-id">
          <ServiceMark name="raycast" />
          <div className="integration-copy">
            <div className="integration-name">
              <h2 id="raycast-title">{messages.raycastTitle}</h2>
              <span className="integration-chip">{messages.raycastMacOnly}</span>
            </div>
            <p className="integration-meta">{messages.raycastSummary}</p>
          </div>
        </div>
      </div>
      <div className="integration-generate-row integration-follow">
        <a
          className="ui-button is-primary is-sm integration-generate"
          href="/downloads/ttd-raycast.zip"
          download="ttd-raycast.zip"
        >
          {messages.raycastDownload}
        </a>
      </div>
      <ol className="raycast-steps integration-follow" aria-label={messages.raycastStepsLabel}>
        <li>
          <span>
            {messages.raycastStepInstallBefore}
            <code>{messages.raycastStepInstallCommand}</code>
            {messages.raycastStepInstallAfter}
          </span>
        </li>
        <li>
          <span>
            {messages.raycastStepTokenBefore}
            <Link to="/settings/tokens">{messages.raycastStepTokenLink}</Link>
            {messages.raycastStepTokenAfter}
          </span>
        </li>
        <li>
          <span>{messages.raycastStepShortcut}</span>
        </li>
      </ol>
      <p className="integration-follow">
        <a
          className="integration-link"
          href="/downloads/ttd-raycast-README.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          {messages.raycastReadme}
        </a>
      </p>
    </article>
  );
}
