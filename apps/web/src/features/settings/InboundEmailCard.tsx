import { runAction } from '../../components/run-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshCw, Unlink } from 'lucide-react';
import { api } from '../../api';
import { Button, SkeletonRows } from '../../components/ui';
import { useMessages } from '../../i18n';
import {
  InfoTip,
  ServiceActions,
  ServiceMark,
  StatusChip,
  type ServiceAction,
} from './integration-ui';

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
  const hasAddress = shown !== null;
  const actions: ServiceAction[] = hasAddress
    ? [
        {
          id: 'rotate',
          label: messages.regenerate,
          icon: RefreshCw,
          menu: true,
          onSelect: () => {
            setConfirmRotate(true);
            setConfirmMail(false);
          },
        },
        ...(active
          ? [
              {
                id: 'revoke',
                label: messages.revoke,
                icon: Unlink,
                tone: 'danger' as const,
                onSelect: () => {
                  setConfirmMail(true);
                  setConfirmRotate(false);
                },
              } satisfies ServiceAction,
            ]
          : []),
      ]
    : [];
  const generateLabel = hasAddress ? messages.regenerate : messages.inboundGenerate;
  return (
    <article className="integration-row" aria-labelledby="inbound-title">
      <div className="integration-head">
        <div className="integration-id">
          <ServiceMark name="mail" />
          <div className="integration-copy">
            <div className="integration-name">
              <h2 id="inbound-title">{messages.inbound}</h2>
              {inbound.isFetched ? (
                <StatusChip on={active}>
                  {active ? messages.inboundActive : messages.inboundStopped}
                </StatusChip>
              ) : null}
            </div>
            <p className="integration-meta">{messages.inboundHint}</p>
          </div>
        </div>
        <ServiceActions
          actions={actions}
          label={messages.inbound}
          sheetHeader={
            <div className="integration-sheet-intro">
              <ServiceMark name="mail" />
              <div>
                <strong>{messages.inbound}</strong>
                <p>{messages.inboundOnce}</p>
              </div>
            </div>
          }
        />
      </div>
      {inbound.isPending ? <SkeletonRows /> : null}
      {inbound.isFetched && shown !== null ? (
        <p className="token-url integration-follow">
          <code>{shown}</code>
        </p>
      ) : null}
      {inbound.isFetched && address === null && active ? (
        <p className="token-meta integration-follow">{messages.inboundMasked}</p>
      ) : null}
      {inbound.isFetched && !hasAddress ? (
        <div className="integration-generate-row integration-follow">
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="integration-generate"
            onClick={() => {
              setConfirmRotate(true);
              setConfirmMail(false);
            }}
          >
            {messages.inboundGenerate}
          </Button>
          <InfoTip label={messages.inboundOnce} text={messages.inboundOnce} />
        </div>
      ) : null}
      <p className="integration-foot integration-follow">{messages.inboundOnce}</p>
      {confirmRotate ? (
        <div className="token-confirm integration-follow">
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
              {generateLabel}
            </Button>
          </span>
        </div>
      ) : null}
      {confirmMail ? (
        <div className="token-confirm integration-follow">
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
    </article>
  );
}
