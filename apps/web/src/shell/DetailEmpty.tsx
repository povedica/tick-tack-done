import { ClipboardList } from 'lucide-react';
import { useMessages } from '../i18n';

/** TTD-AUD-60: empty state for the fixed desktop detail column. */
export function DetailEmpty() {
  const messages = useMessages();
  return (
    <aside className="detail-panel detail-empty" aria-label={messages.detailEmptyTitle}>
      <ClipboardList size={48} aria-hidden="true" />
      <h2>{messages.detailEmptyTitle}</h2>
      <p>{messages.detailEmptyHint}</p>
    </aside>
  );
}
