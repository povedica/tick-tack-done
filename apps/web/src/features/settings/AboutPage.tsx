import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { runAction } from '../../components/run-action';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';
import { buildDiagnostics, safeBuildTime, safeCommit, safeVersion } from './diagnostics';
export function AboutPage() {
  const m = useMessages();
  const query = useQuery({ queryKey: ['health'], queryFn: () => api.getHealth(), retry: 1 });
  const [notice, setNotice] = useState('');
  const web = { commit: __APP_COMMIT__, builtAt: __BUILD_TIME__ };
  const apiCommit = safeCommit(query.data?.commit);
  const webCommit = safeCommit(web.commit);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        buildDiagnostics({
          web,
          api: query.data,
          userAgent: navigator.userAgent,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
      setNotice(m.aboutCopied);
    } catch {
      setNotice(m.aboutCopyFailed);
    }
  };
  return (
    <section className="token-settings">
      <h1>{m.aboutTitle}</h1>
      <dl className="token-panel">
        <dt>Web</dt>
        <dd>
          <code>{webCommit}</code> · {safeBuildTime(web.builtAt)}
        </dd>
        <dt>API</dt>
        <dd>
          <code>{apiCommit}</code> · {safeVersion(query.data?.version)} ·{' '}
          {safeBuildTime(query.data?.built_at)}
        </dd>
        <dt>MCP</dt>
        <dd>{safeVersion(query.data?.mcp_version)}</dd>
      </dl>
      {query.isError ? <p role="alert">{m.loadFailed}</p> : null}
      {apiCommit !== 'unknown' && webCommit !== 'unknown' && apiCommit !== webCommit ? (
        <p className="token-meta" role="status">
          {m.aboutMismatch}
        </p>
      ) : null}
      <Button
        onClick={() => {
          runAction(copy());
        }}
      >
        {m.aboutCopy}
      </Button>
      {notice ? <p role="status">{notice}</p> : null}
      <p>
        <a
          href="https://github.com/povedica/tick-tack-done"
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.aboutRepository}
        </a>{' '}
        ·{' '}
        <a
          href="https://github.com/povedica/tick-tack-done/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.aboutChangelog}
        </a>
      </p>
    </section>
  );
}
