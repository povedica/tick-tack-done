import { actionBlocked, validateProposal, type ProposalBody } from '@reflexionia/domain';
import { useEffect, useState } from 'react';
import { tickyApi } from './api';

export function ProposalReview({
  value,
  executionEnabled,
}: {
  readonly value: unknown;
  readonly executionEnabled: boolean;
}) {
  const [proposal, setProposal] = useState<ProposalBody | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('Verificando propuesta…');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    const active = new AbortController();
    setSelected([]);
    setApplied(false);
    setProposal(null);
    void (async () => {
      try {
        const candidate = value as ProposalBody;
        await validateProposal(candidate);
        if (
          !/^[a-f0-9]{64}$/.test(candidate.approval_digest ?? '') ||
          !Number.isFinite(Date.parse(candidate.expires_at))
        )
          throw new Error('Invalid proposal');
        new Intl.DateTimeFormat('es', { timeZone: candidate.timezone }).format(new Date());
        if (!active.signal.aborted) {
          setProposal(candidate);
          setNotice('Selecciona los cambios que quieres aprobar.');
        }
      } catch {
        if (!active.signal.aborted)
          setNotice('No se ha podido verificar esta propuesta. No se aplicará.');
      }
    })();
    return () => {
      active.abort();
    };
  }, [value]);

  async function approve() {
    if (proposal === null || busy || applied || selected.length === 0) return;
    setBusy(true);
    setNotice('Aplicando los cambios seleccionados…');
    try {
      await tickyApi.storeProposal(proposal);
      await tickyApi.approve(proposal.proposal_id, proposal.approval_digest ?? '', selected);
    } catch {
      // A failed response does not establish whether a domain effect happened.
      setNotice('Verificando el ledger antes de cualquier repetición…');
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
        `Cambios confirmados: ${String(confirmed)} de ${String(selected.length)}. Los demás quedan pendientes de comprobar. No repetiré la aprobación automáticamente.`,
      );
      setApplied(true);
      setBusy(false);
    }
  }

  return (
    <section className="ticky-proposal" aria-label="Revisión de propuesta">
      <h2>Revisar cambios</h2>
      <p role="status">{notice}</p>
      {proposal === null ? null : (
        <>
          <p>
            Caduca:{' '}
            {new Date(proposal.expires_at).toLocaleString('es', { timeZone: proposal.timezone })} (
            {proposal.timezone})
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
                {item.tool} · versión {item.expected_version}
                <br />
                Antes: {JSON.stringify(item.before)}
                <br />
                Después: {JSON.stringify(item.after)}
                {actionBlocked(item) === null ? null : (
                  <>
                    <br />
                    Este cambio necesita revisión adicional y no se puede aprobar aquí.
                  </>
                )}
              </span>
            </label>
          ))}
          {!executionEnabled ? (
            <p>La ejecución está desactivada. La propuesta no ha aplicado cambios.</p>
          ) : null}
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
              void approve();
            }}
          >
            Aprobar seleccionados
          </button>
        </>
      )}
    </section>
  );
}
