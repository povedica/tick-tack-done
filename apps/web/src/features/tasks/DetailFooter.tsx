import { List, MessageSquare, MoreHorizontal } from 'lucide-react';

export function DetailFooter({
  listName,
  listLabel,
  listOpen,
  projects,
  projectId,
  formatLabel,
  formatOpen,
  commentsLabel,
  moreLabel,
  onToggleList,
  onMove,
  onToggleFormat,
  onComments,
  onMore,
}: {
  readonly listName: string;
  readonly listLabel: string;
  readonly listOpen: boolean;
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly projectId: string;
  readonly formatLabel: string;
  readonly formatOpen: boolean;
  readonly commentsLabel: string;
  readonly moreLabel: string;
  readonly onToggleList: () => void;
  readonly onMove: (projectId: string) => void;
  readonly onToggleFormat: () => void;
  readonly onComments: () => void;
  readonly onMore: () => void;
}) {
  return (
    <footer className="detail-foot">
      <div className="detail-list">
        <button
          type="button"
          className="list-chip"
          aria-expanded={listOpen}
          aria-haspopup="menu"
          onClick={onToggleList}
        >
          <List size={14} aria-hidden="true" />
          <span>{listName.length > 0 ? listName : listLabel}</span>
        </button>
        {listOpen ? (
          <ul className="popover popover-menu detail-list-menu" role="menu" aria-label={listLabel}>
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="popover-row"
                  role="menuitemradio"
                  aria-checked={project.id === projectId}
                  onClick={() => {
                    onMove(project.id);
                  }}
                >
                  {project.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="detail-head-spacer" />
      <button
        type="button"
        className={formatOpen ? 'icon-button is-on' : 'icon-button'}
        aria-label={formatLabel}
        aria-pressed={formatOpen}
        onClick={onToggleFormat}
      >
        <span className="format-mark" aria-hidden="true">
          A
        </span>
      </button>
      <button type="button" className="icon-button" aria-label={commentsLabel} onClick={onComments}>
        <MessageSquare size={16} aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" aria-label={moreLabel} onClick={onMore}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </footer>
  );
}
