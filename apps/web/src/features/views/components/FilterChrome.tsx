import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { UndoToastStack } from '../../../components/UndoToast';
import { Button, Modal } from '../../../components/ui';
import { fill, useMessages } from '../../../i18n';
import { deleteFilter, restoreFilter } from '../filter-commands';
import { useFilterUi } from '../filter-ui';

const FilterEditor = lazy(() =>
  import('./FilterEditor').then((module) => ({ default: module.FilterEditor })),
);

export function FilterChrome() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const editor = useFilterUi((state) => state.editor);
  const deleting = useFilterUi((state) => state.deleting);
  const toasts = useFilterUi((state) => state.toasts);
  const notice = useFilterUi((state) => state.notice);
  const closeEditor = useFilterUi((state) => state.closeEditor);
  const cancelDelete = useFilterUi((state) => state.cancelDelete);
  const dropToast = useFilterUi((state) => state.dropToast);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (deleting === null) return;
    // Wait until the menu has restored its trigger, then focus the safe action.
    const frame = requestAnimationFrame(() => {
      cancelRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [deleting]);
  return (
    <>
      <p className="filter-live" aria-live="polite">
        {notice ?? ''}
      </p>
      {editor !== null ? (
        <Suspense fallback={null}>
          <FilterEditor request={editor} onClose={closeEditor} />
        </Suspense>
      ) : null}
      {deleting !== null ? (
        <Modal
          role="alertdialog"
          title={fill(messages.filterDeleteTitle, deleting.name)}
          onClose={cancelDelete}
        >
          <p>{messages.filterDeleteHint}</p>
          <div className="actions">
            <Button ref={cancelRef} autoFocus onClick={cancelDelete}>
              {messages.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const rows = [...document.querySelectorAll<HTMLElement>('.filter-row')];
                const index = rows.findIndex((row) => row.dataset.filterId === deleting.id);
                const next = rows[index + 1]?.querySelector<HTMLElement>('.filter-link');
                deleteFilter(queryClient, deleting, messages.filterDeleteFailed);
                if (location.pathname === '/filters') {
                  requestAnimationFrame(() => {
                    (
                      next ??
                      document.querySelector<HTMLElement>('.filters-page .page-header .ui-button')
                    )?.focus();
                  });
                }
                if (location.pathname === `/filter/${deleting.id}`) {
                  void Promise.resolve(navigate('/filters')).catch(() => undefined);
                }
              }}
            >
              {messages.filterDelete}
            </Button>
          </div>
        </Modal>
      ) : null}
      <UndoToastStack
        durationMs={8_000}
        items={toasts.map((item) => ({ id: item.id, title: item.name }))}
        message={messages.filterDeletedToast}
        undoLabel={messages.filterUndo}
        onUndo={(id) => {
          restoreFilter(queryClient, id, messages.filterRestored);
        }}
        onExpire={dropToast}
      />
    </>
  );
}
