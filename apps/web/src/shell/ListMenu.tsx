import { ApiError, type Folder, type Project } from '@reflexionia/sdk';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder as FolderIcon,
  FolderInput,
  List,
  ListPlus,
  Pencil,
  Share2,
  Target,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../api';
import { Popover } from '../components/Popover';
import { runAction } from '../components/run-action';
import { fill, useMessages } from '../i18n';
import { useListsText } from './lists-text';
import { useListModalStore } from './list-modal-store';
import { canMoveList, patchProject, sameName } from './project-write';

function useNarrowSheet(): boolean {
  const query = '(max-width: 768px)';
  const [sheet, setSheet] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia(query);
    const apply = (): void => {
      setSheet(media.matches);
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, []);
  return sheet;
}

function refreshLists(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['folders'] }),
    queryClient.invalidateQueries({ queryKey: ['projects-overview'] }),
  ]).then(() => undefined);
}

export function ListMenu({
  project,
  folders,
  viewerId,
  anchor,
  archived = false,
  onClose,
}: {
  readonly project: Project;
  readonly folders: readonly Folder[];
  readonly viewerId: string | undefined;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly archived?: boolean;
  readonly onClose: () => void;
}) {
  const messages = useMessages();
  const lists = useListsText();
  const { text } = lists;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const sheet = useNarrowSheet();
  const [step, setStep] = useState<'root' | 'move'>('root');
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [impact, setImpact] = useState<number | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const moveAnchor = useRef<HTMLButtonElement>(null);
  const currentFolder = folders.find((folder) => folder.id === project.folder_id);
  const showMove = !archived && canMoveList(project, viewerId);
  const showOrganize = !archived && !project.is_inbox;
  const showDelete = !project.is_inbox && !(project.is_project && !project.closed);

  function changed(): Promise<void> {
    return refreshLists(queryClient);
  }

  function toggleProject(): void {
    const next = !project.is_project;
    const previous = queryClient.getQueryData<{ items: Project[] }>(['projects']);
    queryClient.setQueryData<{ items: Project[] } | undefined>(['projects'], (current) => {
      if (current === undefined) {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) =>
          item.id === project.id ? { ...item, is_project: next } : item,
        ),
      };
    });
    runAction(api.updateProject(project.id, { is_project: next }), {
      rollback() {
        queryClient.setQueryData(['projects'], previous);
      },
      success() {
        return changed();
      },
    });
    onClose();
  }

  function moveTo(folderId: string | null): void {
    runAction(
      patchProject(project.id, { folder_id: folderId }).then(() => {
        onClose();
        return changed();
      }),
    );
  }

  function createFolderAndMove(): void {
    const name = folderDraft.trim();
    if (name.length === 0 || name.length > 200) {
      setFolderError(name.length === 0 ? null : messages.nameInvalid);
      return;
    }
    if (folders.some((folder) => sameName(folder.name, name))) {
      setFolderError(messages.nameTaken);
      return;
    }
    runAction(
      api.createFolder({ name }, crypto.randomUUID()).then(
        (folder) =>
          patchProject(project.id, { folder_id: folder.id }).then(() => {
            onClose();
            return changed();
          }),
        (cause: unknown) => {
          setFolderError(
            cause instanceof ApiError && cause.status === 409
              ? messages.nameTaken
              : messages.nameInvalid,
          );
        },
      ),
    );
  }

  function startDelete(): void {
    setConfirm(true);
    if (!archived) {
      return;
    }
    runAction(
      api.getProjectDeletionImpact(project.id).then((row) => {
        setImpact(row.task_count);
      }),
    );
  }

  function removeList(): void {
    runAction(
      api.deleteProject(project.id).then(() => {
        onClose();
        const here =
          location.pathname === `/list/${project.id}` ||
          location.pathname === `/lists/${project.id}` ||
          location.pathname === `/projects/${project.id}`;
        return changed().then(() => {
          if (here) {
            return Promise.resolve(navigate('/inbox', { replace: true })).then(() => undefined);
          }
          return undefined;
        });
      }),
    );
  }

  const moveList = (
    <div className="list-move" role="menu" aria-label={text.moveToFolder}>
      {sheet ? (
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            setStep('root');
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {text.back}
        </button>
      ) : null}
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        aria-current={project.folder_id === null ? 'true' : undefined}
        onClick={() => {
          moveTo(null);
        }}
      >
        <span>{text.noFolder}</span>
        {project.folder_id === null ? (
          <Check className="is-current" size={16} aria-hidden="true" />
        ) : null}
      </button>
      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          className="menu-item"
          role="menuitem"
          aria-current={project.folder_id === folder.id ? 'true' : undefined}
          onClick={() => {
            moveTo(folder.id);
          }}
        >
          <FolderIcon size={16} aria-hidden="true" />
          <span>{folder.name}</span>
          {project.folder_id === folder.id ? (
            <Check className="is-current" size={16} aria-hidden="true" />
          ) : null}
        </button>
      ))}
      <div className="menu-sep" role="separator" />
      <form
        className="list-move-new"
        onSubmit={(event) => {
          event.preventDefault();
          createFolderAndMove();
        }}
      >
        <input
          value={folderDraft}
          aria-label={text.newFolderInline}
          placeholder={text.newFolderInline}
          onChange={(event) => {
            setFolderDraft(event.target.value);
            setFolderError(null);
          }}
        />
      </form>
      {folderError !== null ? <p role="alert">{folderError}</p> : null}
    </div>
  );

  const deleteControl = showDelete ? (
    confirm ? (
      <>
        <p className="menu-note">
          {archived
            ? impact === null
              ? null
              : lists.deleteImpact(impact)
            : fill(messages.deleteListBody, project.name)}
        </p>
        <button type="button" className="menu-item is-danger" role="menuitem" onClick={removeList}>
          <Trash2 size={16} aria-hidden="true" />
          {messages.confirmDeleteList}
        </button>
      </>
    ) : (
      <button type="button" className="menu-item is-danger" role="menuitem" onClick={startDelete}>
        <Trash2 size={16} aria-hidden="true" />
        {text.remove}
      </button>
    )
  ) : null;

  const sheetHeader = (
    <div className="list-sheet-id">
      {project.is_project ? (
        <Target size={16} aria-hidden="true" />
      ) : (
        <List size={16} aria-hidden="true" />
      )}
      <div>
        <strong>{project.is_inbox ? messages.smartInbox : project.name}</strong>
        <p>{lists.placeLine(currentFolder?.name ?? null, project.active_task_count)}</p>
      </div>
    </div>
  );

  let body: ReactNode;
  if (archived) {
    body = (
      <div role="menu">
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            runAction(
              api.unarchiveProject(project.id, crypto.randomUUID()).then(() => {
                onClose();
                return changed();
              }),
            );
          }}
        >
          <Archive size={16} aria-hidden="true" />
          {text.unarchive}
        </button>
        {sheet ? null : deleteControl}
      </div>
    );
  } else if (sheet && step === 'move') {
    body = moveList;
  } else {
    body = (
      <div role="menu">
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            useListModalStore.getState().open({ editId: project.id });
            onClose();
          }}
        >
          <Pencil size={16} aria-hidden="true" />
          {text.edit}
        </button>
        {showOrganize ? (
          <button type="button" className="menu-item" role="menuitem" onClick={toggleProject}>
            <Target size={16} aria-hidden="true" />
            {project.is_project ? text.unmarkProject : text.markProject}
          </button>
        ) : null}
        {showMove ? (
          <button
            ref={moveAnchor}
            type="button"
            className="menu-item"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={sheet ? step === 'move' : moveOpen}
            onClick={() => {
              if (sheet) {
                setStep('move');
                return;
              }
              setMoveOpen((current) => !current);
            }}
          >
            <FolderInput size={16} aria-hidden="true" />
            <span>{text.moveToFolder}</span>
            <span className="menu-aside">{currentFolder?.name ?? text.noFolder}</span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        ) : null}
        {showOrganize || showMove ? <div className="menu-sep" role="separator" /> : null}
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            runAction(
              Promise.resolve(navigate(`/settings/sharing?list=${project.id}`)).then(
                () => undefined,
              ),
            );
          }}
        >
          <Share2 size={16} aria-hidden="true" />
          {text.share}
        </button>
        {showOrganize ? (
          <>
            <div className="menu-sep" role="separator" />
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => {
                runAction(
                  api.archiveProject(project.id, crypto.randomUUID()).then(() => {
                    onClose();
                    return changed();
                  }),
                );
              }}
            >
              <Archive size={16} aria-hidden="true" />
              {messages.archiveList}
            </button>
            {sheet ? null : deleteControl}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Popover
        open
        anchor={anchor}
        label={project.is_inbox ? messages.smartInbox : project.name}
        className="popover list-menu-popover"
        mobileSheet={sheet}
        width={280}
        sheetHeader={sheet && step === 'root' ? sheetHeader : undefined}
        sheetFooter={
          sheet && step === 'root' && deleteControl !== null ? (
            <div className="list-sheet-delete">{deleteControl}</div>
          ) : undefined
        }
        onClose={onClose}
      >
        {body}
      </Popover>
      {showMove && moveOpen && !sheet ? (
        <Popover
          open
          anchor={moveAnchor}
          label={text.moveToFolder}
          className="popover list-menu-popover"
          width={220}
          onClose={() => {
            setMoveOpen(false);
          }}
        >
          {moveList}
        </Popover>
      ) : null}
    </>
  );
}

export function FolderMenu({
  folder,
  anchor,
  listCount,
  onClose,
  onRename,
  onDelete,
}: {
  readonly folder: Folder;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly listCount: number;
  readonly onClose: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}) {
  const messages = useMessages();
  const { text, folderDeleteHint, activeTasks } = useListsText();
  const sheet = useNarrowSheet();
  const hint = folderDeleteHint(listCount);
  const remove = (
    <>
      <button
        type="button"
        className="menu-item is-danger"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <Trash2 size={16} aria-hidden="true" />
        {text.deleteFolder}
      </button>
      {hint !== null ? <p className="menu-note">{hint}</p> : null}
    </>
  );
  return (
    <Popover
      open
      anchor={anchor}
      label={folder.name}
      className="popover list-menu-popover"
      mobileSheet={sheet}
      width={260}
      sheetHeader={
        sheet ? (
          <div className="list-sheet-id">
            <FolderIcon size={16} aria-hidden="true" />
            <div>
              <strong>{folder.name}</strong>
              <p>{activeTasks(folder.active_task_count)}</p>
            </div>
          </div>
        ) : undefined
      }
      sheetFooter={sheet ? <div className="list-sheet-delete">{remove}</div> : undefined}
      onClose={onClose}
    >
      <div role="menu">
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          <Pencil size={16} aria-hidden="true" />
          {messages.rename}
        </button>
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            useListModalStore.getState().open({ folderId: folder.id });
            onClose();
          }}
        >
          <ListPlus size={16} aria-hidden="true" />
          {text.newListHere}
        </button>
        {sheet ? null : (
          <>
            <div className="menu-sep" role="separator" />
            {remove}
          </>
        )}
      </div>
    </Popover>
  );
}
