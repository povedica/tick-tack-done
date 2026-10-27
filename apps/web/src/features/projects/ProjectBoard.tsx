import type { ProjectBoardState } from '@reflexionia/domain';
import type { ProjectOverview, ProjectOverviewItem } from '@reflexionia/sdk';
import { Archive, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { runAction } from '../../components/run-action';
import { ARCHIVED_PREVIEW, readArchivedOpen, writeArchivedOpen } from './projects-api';
import {
  acceptsProjectDrag,
  liftDragImage,
  readProjectDrag,
  writeProjectDrag,
} from './project-drag';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { ProjectCard } from './ProjectCard';
import { ProjectMenu, type ProjectMenuAction } from './ProjectMenu';
import type { ProjectsCopy } from './projects-text';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(max-width: 768px)');
    const apply = () => {
      setNarrow(media.matches);
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, []);
  return narrow;
}

function dropLabel(
  from: ProjectBoardState,
  to: ProjectBoardState,
  copy: ProjectsCopy,
): string | null {
  if (from === to) {
    return null;
  }
  if (to === 'archived') {
    return copy.dropArchive;
  }
  if (to === 'paused') {
    return copy.dropPause;
  }
  return copy.dropResume;
}

export function ProjectBoard({
  overview,
  copy,
  now,
  timeZone,
  onMove,
  onRemove,
}: {
  readonly overview: ProjectOverview;
  readonly copy: ProjectsCopy;
  readonly now: string;
  readonly timeZone: string;
  readonly onMove: (item: ProjectOverviewItem, state: ProjectBoardState, title: string) => void;
  readonly onRemove: (item: ProjectOverviewItem) => void;
}) {
  const navigate = useNavigate();
  const narrow = useNarrow();
  const [archivedOpen, setArchivedOpen] = useState(readArchivedOpen);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<ProjectBoardState>('active');
  const [drag, setDrag] = useState<{ id: string; from: ProjectBoardState } | null>(null);
  const [over, setOver] = useState<ProjectBoardState | 'folded' | null>(null);
  const lift = useRef<(() => void) | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ item: ProjectOverviewItem; sheet: boolean } | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const columns: ProjectBoardState[] = ['active', 'paused', 'archived'];
  const grouped = {
    active: overview.items.filter((item) => item.state === 'active'),
    paused: overview.items.filter((item) => item.state === 'paused'),
    archived: overview.items.filter((item) => item.state === 'archived'),
  };
  const archived = grouped.archived;
  const visibleArchived =
    showAll || archived.length <= ARCHIVED_PREVIEW ? archived : archived.slice(0, ARCHIVED_PREVIEW);

  function openMenu(item: ProjectOverviewItem, sheet: boolean, node?: HTMLElement) {
    anchor.current = node ?? anchor.current;
    setMenu({ item, sheet });
  }

  function act(action: ProjectMenuAction) {
    const item = menu?.item;
    setMenu(null);
    if (item === undefined) {
      return;
    }
    if (action === 'open') {
      runAction(Promise.resolve(navigate(`/list/${item.id}`)));
      return;
    }
    if (action === 'remove') {
      onRemove(item);
      return;
    }
    if (action === 'delete') {
      setRemoveId(item.id);
      return;
    }
    const state: ProjectBoardState =
      action === 'pause' ? 'paused' : action === 'archive' ? 'archived' : 'active';
    const title =
      state === 'paused'
        ? copy.pausedToast(item.name)
        : state === 'archived'
          ? copy.archivedToast(item.name)
          : copy.resumedToast(item.name);
    onMove(item, state, title);
  }

  function beginDrag(event: DragEvent<HTMLElement>, item: ProjectOverviewItem) {
    if (event.target instanceof Element && event.target.closest('button')) {
      event.preventDefault();
      return;
    }
    writeProjectDrag(event.dataTransfer, item.id);
    lift.current = liftDragImage(event);
    setDrag({ id: item.id, from: item.state });
  }

  function endDrag() {
    lift.current?.();
    lift.current = null;
    setDrag(null);
    setOver(null);
  }

  function allow(event: DragEvent<HTMLElement>, target: ProjectBoardState | 'folded') {
    if (!acceptsProjectDrag([...event.dataTransfer.types])) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOver(target);
  }

  function drop(event: DragEvent<HTMLElement>, target: ProjectBoardState) {
    if (!acceptsProjectDrag([...event.dataTransfer.types])) {
      return;
    }
    event.preventDefault();
    const id = readProjectDrag(event.dataTransfer);
    const item = overview.items.find((row) => row.id === id);
    setOver(null);
    if (item === undefined || item.state === target) {
      return;
    }
    const title =
      target === 'paused'
        ? copy.pausedToast(item.name)
        : target === 'archived'
          ? copy.archivedToast(item.name)
          : copy.resumedToast(item.name);
    onMove(item, target, title);
  }

  function cards(items: readonly ProjectOverviewItem[]) {
    return items.map((item) => (
      <ProjectCard
        key={item.id}
        item={item}
        copy={copy}
        now={now}
        timeZone={timeZone}
        dragging={drag?.id === item.id}
        draggable={!narrow}
        onMenu={(node) => {
          openMenu(item, narrow, node);
        }}
        onContextMenu={() => {
          openMenu(item, narrow);
        }}
        onDragStart={(event) => {
          beginDrag(event, item);
        }}
        onDragEnd={endDrag}
      />
    ));
  }

  const deleting = overview.items.find((item) => item.id === removeId) ?? null;
  return (
    <div className="project-board" data-projects-board={narrow ? 'mobile' : 'desktop'}>
      {narrow ? (
        <div className="project-tabs" role="tablist">
          {columns.map((state) => (
            <button
              key={state}
              type="button"
              role="tab"
              aria-selected={tab === state}
              onClick={() => {
                setTab(state);
              }}
            >
              {copy.column(
                state === 'active' ? copy.active : state === 'paused' ? copy.paused : copy.archived,
                overview.counts[state],
              )}
            </button>
          ))}
        </div>
      ) : null}
      {(narrow ? [tab] : (['active', 'paused'] as const)).map((state) => (
        <section
          key={state}
          className={`project-column${over === state ? ' is-over' : ''}`}
          data-project-column={state}
          onDragOver={(event) => {
            allow(event, state);
          }}
          onDragLeave={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setOver((current) => (current === state ? null : current));
            }
          }}
          onDrop={(event) => {
            drop(event, state);
          }}
        >
          {narrow ? null : (
            <header className="project-column-head">
              <span>{state === 'active' ? copy.active : copy.paused}</span>
              <span className="project-column-count">{overview.counts[state]}</span>
            </header>
          )}
          <div className="project-column-body">
            {drag !== null && over === state && dropLabel(drag.from, state, copy) !== null ? (
              <p className="project-drop-hint">{dropLabel(drag.from, state, copy)}</p>
            ) : null}
            {cards(state === 'archived' ? visibleArchived : grouped[state])}
            {state === 'active' && grouped.active.length === 0 ? (
              <p className="project-empty-column">{copy.nothingActive}</p>
            ) : null}
            {state === 'archived' && archived.length > ARCHIVED_PREVIEW && !showAll ? (
              <button
                type="button"
                className="project-view-all"
                onClick={() => {
                  setShowAll(true);
                }}
              >
                {copy.viewAll}
              </button>
            ) : null}
          </div>
        </section>
      ))}
      {narrow ? null : archivedOpen ? (
        <section
          className={`project-column is-archived${over === 'archived' ? ' is-over' : ''}`}
          data-project-column="archived"
          onDragOver={(event) => {
            allow(event, 'archived');
          }}
          onDragLeave={() => {
            setOver((current) => (current === 'archived' ? null : current));
          }}
          onDrop={(event) => {
            drop(event, 'archived');
          }}
        >
          <header className="project-archived-head">
            <span>
              {copy.archived}{' '}
              <span className="project-column-count">{overview.counts.archived}</span>
            </span>
            <button
              type="button"
              className="project-hide"
              onClick={() => {
                setArchivedOpen(false);
                writeArchivedOpen(false);
              }}
            >
              {copy.hideArchived} <ChevronUp size={14} aria-hidden="true" />
            </button>
          </header>
          <div className="project-column-body">
            {drag !== null && drag.from !== 'archived' && over === 'archived' ? (
              <p className="project-drop-hint">{copy.dropArchive}</p>
            ) : null}
            {cards(visibleArchived)}
            {archived.length > ARCHIVED_PREVIEW && !showAll ? (
              <button
                type="button"
                className="project-view-all"
                onClick={() => {
                  setShowAll(true);
                }}
              >
                {copy.viewAll}
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <button
          type="button"
          className={`project-archived-toggle${over === 'folded' ? ' is-over' : ''}`}
          onClick={() => {
            setArchivedOpen(true);
            writeArchivedOpen(true);
          }}
          onDragOver={(event) => {
            allow(event, 'folded');
          }}
          onDragLeave={() => {
            setOver((current) => (current === 'folded' ? null : current));
          }}
          onDrop={(event) => {
            drop(event, 'archived');
          }}
        >
          <Archive size={16} aria-hidden="true" />
          {over === 'folded' && drag !== null
            ? copy.dropArchiveHere
            : `${copy.showArchived} ${String(overview.counts.archived)}`}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
      {menu === null ? null : (
        <ProjectMenu
          item={menu.item}
          copy={copy}
          now={now}
          timeZone={timeZone}
          anchor={anchor}
          open
          sheet={menu.sheet || narrow}
          onClose={() => {
            setMenu(null);
          }}
          onAction={act}
        />
      )}
      {deleting === null ? null : (
        <DeleteProjectDialog
          projectId={deleting.id}
          name={deleting.name}
          copy={copy}
          onClose={() => {
            setRemoveId(null);
          }}
        />
      )}
    </div>
  );
}
