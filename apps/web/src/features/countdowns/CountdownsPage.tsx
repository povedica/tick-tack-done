import { runAction } from '../../components/run-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState } from '../../components/ui';
import { UndoToastStack } from '../../components/UndoToast';
import { newMutation, runOrQueue } from '../offline/client';
import { CountdownCard } from './CountdownCard';
import { CountdownDialog } from './CountdownDialog';
import { countdownsApi, type Countdown, type CountdownDraft, type CountdownType } from './api';
import { groupCountdowns, TYPE_LABEL } from './presentation';
import './countdowns.css';

export function CountdownsPage() {
  const client = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [grouped, setGrouped] = useState(false);
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
            if (window.confirm(`¿Eliminar «${item.title}»?`)) {
              setDeleted((current) => [
                ...current,
                { id: crypto.randomUUID(), title: item.title, countdown: item },
              ]);
              remove.mutate(item);
            }
          }}
        />
      ))}
    </div>
  );
  return (
    <main className="countdowns screen-page">
      <header className="countdown-header">
        <div className="countdown-title-select">
          <h1>Cuenta atrás</h1>
          <select
            aria-label="Vista de cuentas atrás"
            value={archived ? 'archived' : 'active'}
            onChange={(event) => {
              setArchived(event.target.value === 'archived');
            }}
          >
            <option value="active">Activos</option>
            <option value="archived">Archivados</option>
          </select>
        </div>
        <div className="countdown-toolbar">
          {!archived ? (
            <details>
              <summary>
                <Plus size={18} /> Nueva
              </summary>
              <div className="countdown-menu">
                {(Object.entries(TYPE_LABEL) as [CountdownType, string][]).map(([type, label]) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => {
                      setDialog({ type });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <button
            type="button"
            aria-pressed={grouped}
            title="Agrupar por tipo"
            onClick={() => {
              setGrouped((current) => !current);
            }}
          >
            <MoreHorizontal size={20} />
            <span className="sr-only">Agrupar por tipo</span>
          </button>
        </div>
      </header>
      {rows.isPending ? <p>Cargando cuentas atrás…</p> : null}
      {rows.isError ? (
        <p className="error">
          No se han podido cargar las cuentas atrás.{' '}
          <button
            type="button"
            onClick={() => {
              runAction(rows.refetch());
            }}
          >
            Reintentar
          </button>
        </p>
      ) : null}
      {!rows.isPending && items.length === 0 ? (
        <EmptyState
          title={archived ? 'Nada archivado' : 'Crea tu primera cuenta atrás'}
          body={
            archived
              ? 'Las cuentas atrás archivadas aparecerán aquí.'
              : 'Sigue las fechas importantes desde un solo lugar.'
          }
          action={
            !archived ? (
              <Button
                variant="primary"
                onClick={() => {
                  setDialog({ type: 'countdown' });
                }}
              >
                Crear cuenta atrás
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
        message="Se ha eliminado «{name}»"
        undoLabel="Deshacer"
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
