import { ApiError } from '@reflexionia/sdk';
import { Plus, Target } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { runAction } from '../../components/run-action';
import { UndoToastStack } from '../../components/UndoToast';
import { ErrorState, SkeletonRows } from '../../components/ui';
import { useMessages } from '../../i18n';
import { MarkListPicker } from './MarkListPicker';
import { ProjectBoard } from './ProjectBoard';
import { useProjectMutations, useProjectsOverview } from './projects-api';
import { useProjectsCopy } from './projects-text';
import './projects.css';

export function ProjectsPage() {
  const copy = useProjectsCopy();
  const messages = useMessages();
  const query = useProjectsOverview();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
  const now = new Date().toISOString();
  const markAnchor = useRef<HTMLButtonElement>(null);
  const [markOpen, setMarkOpen] = useState(false);
  const mutations = useProjectMutations(zone);
  const total =
    query.data === undefined
      ? 0
      : query.data.counts.active + query.data.counts.paused + query.data.counts.archived;
  const denied =
    query.error instanceof ApiError &&
    (query.error.status === 403 || query.error.code === 'scope_missing');
  return (
    <section className="screen-page is-wide projects-page">
      <header className="page-header">
        <div className="projects-heading">
          <Link className="projects-back" to="/dashboard">
            <span className="projects-back-long">‹ {copy.back}</span>
            <span className="projects-back-short">‹ {copy.backShort}</span>
          </Link>
          <h1>{copy.title}</h1>
        </div>
        <Link className="projects-new" to="/dashboard/projects?new=project">
          <Plus size={16} aria-hidden="true" />
          <span className="projects-new-label">{copy.newProject}</span>
        </Link>
      </header>
      {query.isPending ? (
        <SkeletonRows />
      ) : query.isError ? (
        <ErrorState
          title={denied ? copy.permission : copy.loadError}
          retryLabel={messages.retry}
          onRetry={() => {
            runAction(query.refetch());
          }}
        />
      ) : total === 0 ? (
        <div className="projects-empty">
          <Target size={24} aria-hidden="true" />
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyBody}</p>
          <div className="projects-empty-actions">
            <button
              ref={markAnchor}
              type="button"
              className="projects-text-link"
              onClick={() => {
                setMarkOpen(true);
              }}
            >
              {copy.markList}
            </button>
            <Link className="projects-text-link" to="/dashboard/projects?new=project">
              + {copy.newList}
            </Link>
          </div>
        </div>
      ) : (
        <ProjectBoard
          overview={query.data}
          copy={copy}
          now={now}
          timeZone={zone}
          onMove={(item, state, title) => {
            mutations.move(item, state, title);
          }}
          onRemove={(item) => {
            mutations.remove(item, copy.removedToast(item.name));
          }}
        />
      )}
      <MarkListPicker
        copy={copy}
        anchor={markAnchor}
        open={markOpen}
        onClose={() => {
          setMarkOpen(false);
        }}
      />
      <UndoToastStack
        items={
          mutations.notice === null
            ? []
            : [{ id: mutations.notice.id, title: mutations.notice.title }]
        }
        message="{name}"
        undoLabel={copy.undo}
        onUndo={() => {
          mutations.undo();
        }}
        onExpire={() => {
          mutations.dismiss();
        }}
      />
    </section>
  );
}
