import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { useMessages } from '../../i18n';

const INBOUND_DOMAIN = 'in.todo.reflexionia.com';

export function InboundEmailCard() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const inbound = useQuery({ queryKey: ['inbound'], queryFn: () => api.inboundEmail() });
  const [address, setAddress] = useState<string | null>(null);
  const [confirmMail, setConfirmMail] = useState(false);
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
            {active ? messages.inboundActive : messages.inboundStopped}
          </span>
        ) : null}
      </div>
      {shown !== null ? (
        <p className="token-url">
          <code>{shown}</code>
        </p>
      ) : null}
      {address === null ? (
        <p className="token-meta">{active ? messages.inboundMasked : messages.inboundMissing}</p>
      ) : null}
      <div className="token-actions">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void api.rotateInboundEmail().then((created) => {
              setAddress(created.address);
              setConfirmMail(false);
              void queryClient.invalidateQueries({ queryKey: ['inbound'] });
            });
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
            }}
          >
            {messages.revoke}
          </Button>
        ) : null}
      </div>
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
                void api.revokeInboundEmail().then(() => {
                  setAddress(null);
                  setConfirmMail(false);
                  void queryClient.invalidateQueries({ queryKey: ['inbound'] });
                });
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
