import { runAction } from '../../components/run-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Popover } from '../../components/Popover';
import { Button, EmptyState } from '../../components/ui';
import { UndoToastStack } from '../../components/UndoToast';
import { fill, useMessages } from '../../i18n';
import { newMutation, runOrQueue } from '../offline/client';
import { CountdownCard } from './CountdownCard';
import { CountdownDialog } from './CountdownDialog';
import { countdownsApi, type Countdown, type CountdownDraft, type CountdownType } from './api';
import { groupCountdowns, TYPE_LABEL } from './presentation';
import './countdowns.css';

export function CountdownsPage() {
  const messages = useMessages();
  const client = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Countdown | null>(null);
  const newAnchor = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<{ type: CountdownType; countdown?: Countdown } | null>(null);
  const [deleted, setDeleted] = useState<
    readonly { id: string; title: string; countdown: Countdown }[]
  >([]);
  const rows = useQuery({
    queryKey: ['countdowns', archived],
    queryFn: () => countdownsApi.list(archived),
  });
  const refresh = (): Promise<unknown> => client.invalidateQueries({ queryKey: ['countdowns'] });
  const save = useMutation({
    mutationFn: async ({ draft, original }: { draft: CountdownDraft; original?: Countdown }) => {
      const kind: 'create_countdown' | 'update_countdown' =
        original === undefined ? 'create_countdown' : 'update_countdown';
      const localId = original?.id ?? crypto.randomUUID();
      return runOrQueue(
        newMutation(kind, localId, draft as unknown as Record<string, unknown>),
        (idempotencyKey) =>
          original === undefined
            ? countdownsApi.create(draft, idempotencyKey)
            : countdownsApi.update(original.id, draft, idempotencyKey),
      );
    },
    onSuccess: async () => {
      setDialog(null);
      setNewOpen(false);
      await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: ({ item, restore }: { item: Countdown; restore: boolean }) =>
      restore ? countdownsApi.unarchive(item.id) : countdownsApi.archive(item.id),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (item: Countdown) => countdownsApi.remove(item.id),
    onSuccess: refresh,
  });
  const items = rows.data?.items ?? [];
  const renderCards = (entries: readonly Countdown[]) => (
    <div className="countdown-grid">
      {entries.map((item) => (
        <CountdownCard
          key={item.id}
          countdown={item}
          archived={archived}
          onEdit={() => {
            setDialog({ type: item.type, countdown: item });
          }}
          onPin={() => {
            runAction(countdownsApi.update(item.id, { pinned: !item.pinned }).then(refresh));
          }}
          onArchive={() => {
            archive.mutate({ item, restore: archived });
          }}
          onDelete={() => {
            setPendingDelete(item);
          }}
        />
      ))}
    </div>
  );
  return (
    <main className="countdowns screen-page">
      <header className="countdown-header">
        <div className="countdown-title-select">
          <h1>{messages.navCountdowns}</h1>
          <select
            aria-label={messages.countdownViewLabel}
            value={archived ? 'archived' : 'active'}
            onChange={(event) => {
              setArchived(event.target.value === 'archived');
            }}
          >
            <option value="active">{messages.countdownActive}</option>
            <option value="archived">{messages.countdownArchived}</option>
          </select>
        </div>
        <div className="countdown-toolbar">
          {!archived ? (
            <>
              <button
                ref={newAnchor}
                type="button"
                aria-expanded={newOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setNewOpen((current) => !current);
                }}
              >
                <Plus size={18} /> {messages.countdownNew}
              </button>
              <Popover
                open={newOpen}
                label={messages.countdownNew}
                anchor={newAnchor}
                onClose={() => {
                  setNewOpen(false);
                }}
              >
                <div className="countdown-menu" role="menu">
                  {(Object.entries(TYPE_LABEL) as [CountdownType, string][]).map(([type, label]) => (
                    <button
                      type="button"
                      key={type}
                      role="menuitem"
                      onClick={() => {
                        setNewOpen(false);
                        setDialog({ type });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Popover>
            </>
          ) : null}
          <button
            type="button"
            aria-pressed={grouped}
            title={messages.countdownGroupByType}
            onClick={() => {
              setGrouped((current) => !current);
            }}
          >
            <LayoutGrid size={20} />
            <span className="sr-only">{messages.countdownGroupByType}</span>
          </button>
        </div>
      </header>
      {rows.isPending ? <p>{messages.countdownLoading}</p> : null}
      {rows.isError ? (
        <p className="error">
          {messages.countdownLoadFailed}{' '}
          <button
            type="button"
            onClick={() => {
              runAction(rows.refetch());
            }}
          >
            {messages.retry}
          </button>
        </p>
      ) : null}
      {!rows.isPending && items.length === 0 ? (
        <EmptyState
          title={archived ? messages.countdownEmptyArchived : messages.countdownEmptyTitle}
          body={archived ? messages.countdownEmptyArchivedBody : messages.countdownEmptyBody}
          action={
            !archived ? (
              <Button
                variant="primary"
                onClick={() => {
                  setDialog({ type: 'countdown' });
                }}
              >
                {messages.countdownCreate}
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {!grouped
        ? renderCards(items)
        : groupCountdowns(items).map(([type, entries]) => (
            <section key={type} className="countdown-group">
              <h2>{TYPE_LABEL[type]}</h2>
              {renderCards(entries)}
            </section>
          ))}
      {pendingDelete !== null ? (
        <div className="token-confirm countdown-confirm" role="alertdialog">
          <p>{fill(messages.countdownDeleteConfirm, pendingDelete.title)}</p>
          <span className="token-actions">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPendingDelete(null);
              }}
            >
              {messages.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                const item = pendingDelete;
                setPendingDelete(null);
                setDeleted((current) => [
                  ...current,
                  { id: crypto.randomUUID(), title: item.title, countdown: item },
                ]);
                remove.mutate(item);
              }}
            >
              {messages.purge}
            </Button>
          </span>
        </div>
      ) : null}
      {dialog !== null ? (
        <CountdownDialog
          type={dialog.type}
          {...(dialog.countdown === undefined ? {} : { countdown: dialog.countdown })}
          onClose={() => {
            setDialog(null);
          }}
          onSave={(draft) => {
            save.mutate({
              draft,
              ...(dialog.countdown === undefined ? {} : { original: dialog.countdown }),
            });
          }}
        />
      ) : null}
      <UndoToastStack
        items={deleted}
        message={messages.countdownDeleted}
        undoLabel={messages.undo}
        onExpire={(id) => {
          setDeleted((current) => current.filter((item) => item.id !== id));
        }}
        onUndo={(id) => {
          const item = deleted.find((entry) => entry.id === id);
          if (item !== undefined) {
            runAction(
              countdownsApi
                .create(
                  { ...item.countdown, targetDate: item.countdown.targetDate.slice(0, 10) },
                  crypto.randomUUID(),
                )
                .then(refresh),
            );
            setDeleted((current) => current.filter((entry) => entry.id !== id));
          }
        }}
      />
    </main>
  );
}
