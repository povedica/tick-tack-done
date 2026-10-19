import { Inbox, MessageSquare, MoreHorizontal, Type } from 'lucide-react';
import type { Messages } from '../../i18n';

export function DetailFooter({
  listName,
  listLabel,
  formatLabel,
  commentsLabel,
  moreLabel,
  projects,
  projectId,
  messages,
  listOpen,
  onToggleList,
  onMove,
  onFormat,
  onComments,
  onMore,
}: {
  readonly listName: string;
  readonly listLabel: string;
  readonly formatLabel: string;
  readonly commentsLabel: string;
  readonly moreLabel: string;
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly projectId: string;
  readonly messages: Messages;
  readonly listOpen: boolean;
  readonly onToggleList: () => void;
  readonly onMove: (projectId: string) => void;
  readonly onFormat: () => void;
  readonly onComments: () => void;
  readonly onMore: () => void;
}) {
  return (
    <footer className="detail-foot">
      <div className="detail-list">
        <button type="button" className="list-chip" aria-expanded={listOpen} onClick={onToggleList}>
          <Inbox size={14} aria-hidden="true" />
          <span>{listName.length > 0 ? listName : listLabel}</span>
        </button>
        {listOpen ? (
          <ul
            className="popover popover-menu detail-list-menu"
            role="menu"
            aria-label={messages.listMove}
          >
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
      <button type="button" className="icon-button" aria-label={formatLabel} onClick={onFormat}>
        <Type size={16} aria-hidden="true" />
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
