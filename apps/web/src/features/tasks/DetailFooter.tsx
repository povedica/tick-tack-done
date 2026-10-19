import { MessageSquare, MoreHorizontal } from 'lucide-react';

export function DetailFooter({
  commentsLabel,
  moreLabel,
  onComments,
  onMore,
}: {
  readonly commentsLabel: string;
  readonly moreLabel: string;
  readonly onComments: () => void;
  readonly onMore: () => void;
}) {
  return (
    <footer className="detail-foot">
      <span className="detail-head-spacer" />
      <button type="button" className="icon-button" aria-label={commentsLabel} onClick={onComments}>
        <MessageSquare size={16} aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" aria-label={moreLabel} onClick={onMore}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </footer>
  );
}
