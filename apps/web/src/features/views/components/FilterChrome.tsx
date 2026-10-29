import { useQueryClient } from '@tanstack/react-query';
import { UndoToastStack } from '../../../components/UndoToast';
import { Button, Modal } from '../../../components/ui';
import { fill, useMessages } from '../../../i18n';
import { deleteFilter, restoreFilter } from '../filter-commands';
import { useFilterUi } from '../filter-ui';
import { FilterDraftModal } from './FilterDraftModal';
import '../filters.css';

export function FilterChrome() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const editor = useFilterUi((state) => state.editor);
  const deleting = useFilterUi((state) => state.deleting);
  const toasts = useFilterUi((state) => state.toasts);
  const notice = useFilterUi((state) => state.notice);
  const closeEditor = useFilterUi((state) => state.closeEditor);
  const cancelDelete = useFilterUi((state) => state.cancelDelete);
  const dropToast = useFilterUi((state) => state.dropToast);
  return (
    <>
      <p className="filter-live" aria-live="polite">
        {notice ?? ''}
      </p>
      {editor !== null ? <FilterDraftModal request={editor} onClose={closeEditor} /> : null}
      {deleting !== null ? (
        <Modal
          role="alertdialog"
          title={fill(messages.filterDeleteTitle, deleting.name)}
          onClose={cancelDelete}
        >
          <p>{messages.filterDeleteHint}</p>
          <div className="actions">
            <Button autoFocus onClick={cancelDelete}>
              {messages.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteFilter(queryClient, deleting, messages.filterDeleteFailed);
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
