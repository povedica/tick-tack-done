import { runAction } from '../../components/run-action';
import { actionBlocked, validateProposal, type ProposalBody } from '@reflexionia/domain';
import { useEffect, useState } from 'react';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { tickyApi } from './api';

export function ProposalReview({
  value,
  executionEnabled,
}: {
  readonly value: unknown;
  readonly executionEnabled: boolean;
}) {
  const messages = useMessages();
  const locale = useAppLocale();
  const [proposal, setProposal] = useState<ProposalBody | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState(messages.tickyVerifyingProposal);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    const active = new AbortController();
    setSelected([]);
    setApplied(false);
    setProposal(null);
    setNotice(messages.tickyVerifyingProposal);
    runAction(
      (async () => {
        try {
          const candidate = value as ProposalBody;
          await validateProposal(candidate);
          if (
            !/^[a-f0-9]{64}$/.test(candidate.approval_digest ?? '') ||
            !Number.isFinite(Date.parse(candidate.expires_at))
          )
            throw new Error('Invalid proposal');
          new Intl.DateTimeFormat(locale, { timeZone: candidate.timezone }).format(new Date());
          if (!active.signal.aborted) {
            setProposal(candidate);
            setNotice(messages.tickySelectChanges);
          }
        } catch {
          if (!active.signal.aborted) setNotice(messages.tickyProposalInvalid);
        }
      })(),
    );
    return () => {
      active.abort();
    };
  }, [locale, messages, value]);

  async function approve() {
    if (proposal === null || busy || applied || selected.length === 0) return;
    setBusy(true);
    setNotice(messages.tickyApplying);
    try {
      await tickyApi.storeProposal(proposal);
      await tickyApi.approve(proposal.proposal_id, proposal.approval_digest ?? '', selected);
    } catch {
      // A failed response does not establish whether a domain effect happened.
      setNotice(messages.tickyCheckingLedger);
    } finally {
      const statuses = await Promise.all(
        selected.map(async (id) => {
          try {
            return { action_id: id, ...(await tickyApi.actionStatus(id)) };
          } catch {
            return { action_id: id, status: 'unknown' };
          }
        }),
      );
      const confirmed = statuses.filter(
        (status) => 'status' in status && status.status === 'applied',
      ).length;
      setNotice(
        messages.tickyConfirmed
          .replace('{done}', String(confirmed))
          .replace('{total}', String(selected.length)),
      );
      setApplied(true);
      setBusy(false);
    }
  }

  return (
    <section className="ticky-proposal" aria-label={messages.tickyProposalReview}>
      <h2>{messages.tickyReviewChanges}</h2>
      <p role="status">{notice}</p>
      {proposal === null ? null : (
        <>
          <p>
            {messages.tickyExpires}:{' '}
            {new Date(proposal.expires_at).toLocaleString(locale, {
              timeZone: proposal.timezone,
            })}{' '}
            ({proposal.timezone})
          </p>
          {proposal.items.map((item) => (
            <label key={item.action_id} className="ticky-proposal-item">
              <input
                type="checkbox"
                checked={selected.includes(item.action_id)}
                disabled={busy || applied || !executionEnabled || actionBlocked(item) !== null}
                onChange={(event) => {
                  setSelected((ids) =>
                    event.target.checked
                      ? [...ids, item.action_id]
                      : ids.filter((id) => id !== item.action_id),
                  );
                }}
              />
              <span>
                {item.tool} · {messages.tickyVersion} {item.expected_version}
                <br />
                {messages.tickyBefore}: {JSON.stringify(item.before)}
                <br />
                {messages.tickyAfter}: {JSON.stringify(item.after)}
                {actionBlocked(item) === null ? null : (
                  <>
                    <br />
                    {messages.tickyNeedsReview}
                  </>
                )}
              </span>
            </label>
          ))}
          {!executionEnabled ? <p>{messages.tickyExecOff}</p> : null}
          <button
            type="button"
            disabled={
              busy ||
              applied ||
              !executionEnabled ||
              selected.length === 0 ||
              Date.now() >= Date.parse(proposal.expires_at)
            }
            onClick={() => {
              runAction(approve());
            }}
          >
            {messages.tickyApproveSelected}
          </button>
        </>
      )}
    </section>
  );
}
