import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { Button, SkeletonRows } from '../../components/ui';
import { useMessages } from '../../i18n';

const INBOUND_DOMAIN = 'in.todo.reflexionia.com';

export function InboundEmailCard() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const inbound = useQuery({ queryKey: ['inbound'], queryFn: () => api.inboundEmail() });
  const [address, setAddress] = useState<string | null>(null);
  const [confirmMail, setConfirmMail] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const active = inbound.data?.active === true;
  const shown = address ?? (active ? `••••@${INBOUND_DOMAIN}` : null);
  return (
    <section className="token-panel" aria-labelledby="inbound-title">
      <div className="token-panel-head">
        <div>
          <h2 id="inbound-title">{messages.inbound}</h2>
          <p>{messages.inboundHint}</p>
        </div>
        {inbound.isFetched ? (
          <span className={active ? 'token-pill' : 'token-pill is-revoked'}>
            {messages.stateLabel}: {active ? messages.inboundActive : messages.inboundStopped}
          </span>
        ) : null}
      </div>
      {inbound.isPending ? <SkeletonRows /> : null}
      {inbound.isFetched && shown !== null ? (
        <p className="token-url">
          <code>{shown}</code>
        </p>
      ) : null}
      {inbound.isFetched && address === null ? (
        <p className="token-meta">{active ? messages.inboundMasked : messages.inboundMissing}</p>
      ) : null}
      {inbound.isFetched ? (
        <div className="token-actions">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConfirmRotate(true);
              setConfirmMail(false);
            }}
          >
            {messages.regenerate}
          </Button>
          {active ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmMail(true);
                setConfirmRotate(false);
              }}
            >
              {messages.revoke}
            </Button>
          ) : null}
        </div>
      ) : null}
      {confirmRotate ? (
        <div className="token-confirm">
          <p>{messages.inboundRegenerateBody}</p>
          <span className="token-actions">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmRotate(false);
              }}
            >
              {messages.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                runAction(
                  api.rotateInboundEmail().then((created) => {
                    setAddress(created.address);
                    setConfirmRotate(false);
                    runAction(queryClient.invalidateQueries({ queryKey: ['inbound'] }));
                  }),
                );
              }}
            >
              {messages.regenerate}
            </Button>
          </span>
        </div>
      ) : null}
      {confirmMail ? (
        <div className="token-confirm">
          <p>{messages.inboundRevokeBody}</p>
          <span className="token-actions">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmMail(false);
              }}
            >
              {messages.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                runAction(
                  api.revokeInboundEmail().then(() => {
                    setAddress(null);
                    setConfirmMail(false);
                    runAction(queryClient.invalidateQueries({ queryKey: ['inbound'] }));
                  }),
                );
              }}
            >
              {messages.revoke}
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  );
}
