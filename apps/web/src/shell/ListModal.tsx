import { ApiError, type Folder, type Project } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SubmitEvent,
} from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { api } from '../api';
import { collectProjects } from '../features/tasks/collect';
import { Select } from '../components/Select';
import { Button, Modal } from '../components/ui';
import { useMessages } from '../i18n';
import { useListsText } from './lists-text';
import { openListModal, useListModalStore, type ListModalRequest } from './list-modal-store';
import { patchProject, sameName, type ProjectWrite } from './project-write';

export const LIST_COLORS = [
  '#4772FA',
  '#E13E39',
  '#FAA80C',
  '#1F9D55',
  '#7C5CFF',
  '#F06595',
] as const;

const VIEWS = ['list', 'kanban', 'timeline'] as const;
type ViewMode = (typeof VIEWS)[number];
const NEW_FOLDER = '__new__';

export function activeFolderId(pathname: string, items: readonly Project[]): string | null {
  const match = /^\/list\/([^/]+)$/.exec(pathname);
  const id = match?.[1];
  if (id === undefined) {
    return null;
  }
  return items.find((item) => item.id === id)?.folder_id ?? null;
}

async function refreshLists(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['folders'] }),
    queryClient.invalidateQueries({ queryKey: ['projects-overview'] }),
  ]);
}

export function ListModal() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const request = useListModalStore((state) => state.request);
  const closeStore = useListModalStore((state) => state.close);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: collectProjects,
    staleTime: 5 * 60_000,
  });
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.listFolders() });
  const consumed = useRef<string | null>(null);
  const items = projects.data?.items ?? [];
  const folderFromRoute = activeFolderId(location.pathname, items);

  useEffect(() => {
    const value = params.get('new');
    if (value !== 'list' && value !== 'project') {
      consumed.current = null;
      return;
    }
    const onList = /^\/list\/[^/]+$/.test(location.pathname);
    if (onList && !projects.isSuccess) {
      return;
    }
    if (consumed.current === value) {
      return;
    }
    consumed.current = value;
    openListModal({ project: value === 'project', folderId: folderFromRoute });
  }, [folderFromRoute, location.pathname, params, projects.isSuccess]);

  const dismiss = useCallback(() => {
    closeStore();
    const value = params.get('new');
    if (value !== 'list' && value !== 'project') {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [closeStore, params, setParams]);

  if (request === null) {
    return null;
  }
  if (request.editId !== undefined && !projects.isSuccess) {
    return null;
  }
  const editing = items.find((item) => item.id === request.editId);
  if (request.editId !== undefined && editing === undefined) {
    return null;
  }
  return (
    <ListForm
      key={`${request.editId ?? 'new'}:${String(request.project)}:${String(request.folderId)}`}
      request={request}
      editing={editing}
      folders={folders.data?.items ?? []}
      projects={items}
      onClose={dismiss}
    />
  );
}

function ListForm({
  request,
  editing,
  folders,
  projects,
  onClose,
}: {
  readonly request: ListModalRequest;
  readonly editing: Project | undefined;
  readonly folders: readonly Folder[];
  readonly projects: readonly Project[];
  readonly onClose: () => void;
}) {
  const messages = useMessages();
  const { text } = useListsText();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [folderChoice, setFolderChoice] = useState(() => {
    if (editing !== undefined) {
      return editing.folder_id ?? '';
    }
    return request.folderId ?? '';
  });
  const [folderDraft, setFolderDraft] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(editing?.color ?? null);
  const [viewMode, setViewMode] = useState<ViewMode>(editing?.view_mode ?? 'list');
  const [isProject, setIsProject] = useState(editing?.is_project ?? request.project === true);
  const [outcome, setOutcome] = useState(editing?.outcome ?? '');
  const [error, setError] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const inbox = editing?.is_inbox === true;

  useEffect(() => {
    const previous = document.activeElement;
    nameField.current?.focus();
    const selector =
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';
    function onKey(event: KeyboardEvent): void {
      const dialog = document.querySelector('.ui-modal');
      if (!(dialog instanceof HTMLElement)) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const controls = [...dialog.querySelectorAll<HTMLElement>(selector)];
      const first = controls[0];
      const last = controls.at(-1);
      if (first === undefined || last === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [onClose]);

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextName = name.trim();
    if (nextName.length === 0 || nextName.length > 200) {
      setError(messages.nameInvalid);
      return;
    }
    const taken = projects.some(
      (project) => project.id !== editing?.id && sameName(project.name, nextName),
    );
    if (taken) {
      setError(messages.nameTaken);
      return;
    }
    const outcomeValue = isProject && outcome.trim().length > 0 ? outcome.trim() : null;
    doSave(nextName, outcomeValue).catch((cause: unknown) => {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? messages.nameTaken
          : messages.nameInvalid,
      );
    });
  }

  function doSave(nextName: string, outcomeValue: string | null): Promise<void> {
    return resolveFolder().then((folderId) => {
      if (folderId === undefined) {
        return;
      }
      if (editing === undefined) {
        return api
          .createProject(
            {
              name: nextName,
              folder_id: folderId,
              color,
              view_mode: viewMode,
              is_project: isProject,
              outcome: outcomeValue,
            },
            crypto.randomUUID(),
          )
          .then(() => refreshLists(queryClient))
          .then(() => {
            onClose();
          });
      }
      const patch: ProjectWrite = {
        ...(nextName !== editing.name ? { name: nextName } : {}),
        ...(folderId !== editing.folder_id ? { folder_id: folderId } : {}),
        ...(color !== editing.color ? { color } : {}),
        ...(viewMode !== editing.view_mode ? { view_mode: viewMode } : {}),
        ...(!inbox && isProject !== editing.is_project ? { is_project: isProject } : {}),
        ...(outcomeValue !== editing.outcome ? { outcome: outcomeValue } : {}),
      };
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      return patchProject(editing.id, patch)
        .then(() => refreshLists(queryClient))
        .then(() => {
          onClose();
        });
    });
  }

  function resolveFolder(): Promise<string | null | undefined> {
    if (folderChoice !== NEW_FOLDER) {
      return Promise.resolve(folderChoice.length > 0 ? folderChoice : null);
    }
    const folderName = folderDraft.trim();
    if (folderName.length === 0 || folderName.length > 200) {
      setFolderError(messages.nameInvalid);
      return Promise.resolve(undefined);
    }
    if (folders.some((folder) => sameName(folder.name, folderName))) {
      setFolderError(messages.nameTaken);
      return Promise.resolve(undefined);
    }
    return api.createFolder({ name: folderName }, crypto.randomUUID()).then(
      (folder) => folder.id,
      (cause: unknown) => {
        setFolderError(
          cause instanceof ApiError && cause.status === 409
            ? messages.nameTaken
            : messages.nameInvalid,
        );
        return undefined;
      },
    );
  }

  const viewLabel: Record<ViewMode, string> = {
    list: text.viewList,
    kanban: text.viewBoard,
    timeline: text.viewTimeline,
  };

  return (
    <Modal title={editing === undefined ? text.newListTitle : text.editListTitle} onClose={onClose}>
      <form className="list-modal" onSubmit={onSubmit}>
        <label className="list-field">
          <span>{text.listName}</span>
          <input
            ref={nameField}
            value={name}
            placeholder={text.namePlaceholder}
            aria-label={text.listName}
            maxLength={200}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </label>
        <div className="list-modal-grid">
          <div className="list-field">
            <span id="list-folder-label">{text.folder}</span>
            {folderChoice === NEW_FOLDER ? (
              <label className="list-folder-new">
                <input
                  value={folderDraft}
                  placeholder={text.folderNamePlaceholder}
                  aria-label={text.folderNamePlaceholder}
                  maxLength={200}
                  onChange={(event) => {
                    setFolderDraft(event.target.value);
                    setFolderError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setFolderChoice(editing?.folder_id ?? request.folderId ?? '');
                      setFolderDraft('');
                      setFolderError(null);
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                    }
                  }}
                />
                <kbd>{text.enterHint}</kbd>
              </label>
            ) : (
              <Select
                aria-labelledby="list-folder-label"
                value={folderChoice}
                onChange={(event) => {
                  setFolderChoice(event.target.value);
                  setFolderError(null);
                }}
              >
                <option value="">{text.noFolder}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
                <option value={NEW_FOLDER}>{text.newFolder}</option>
              </Select>
            )}
            {folderError !== null ? <p role="alert">{folderError}</p> : null}
          </div>
          <div className="list-field">
            <span>{text.colorOptional}</span>
            <div className="list-colors" role="radiogroup" aria-label={text.colorOptional}>
              <button
                type="button"
                role="radio"
                className="list-color is-none"
                aria-checked={color === null}
                aria-label={text.noColor}
                onClick={() => {
                  setColor(null);
                }}
              />
              {LIST_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="radio"
                  className="list-color"
                  style={{ '--swatch': swatch } as CSSProperties}
                  aria-checked={color?.toLowerCase() === swatch.toLowerCase()}
                  aria-label={swatch}
                  onClick={() => {
                    setColor(swatch);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="list-field">
          <span>{text.view}</span>
          <div className="segmented" role="radiogroup" aria-label={text.view}>
            {VIEWS.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                className={viewMode === mode ? 'is-active' : undefined}
                onClick={() => {
                  setViewMode(mode);
                }}
              >
                {viewLabel[mode]}
              </button>
            ))}
          </div>
        </div>
        {inbox ? null : (
          <label className="list-project-row">
            <Target size={16} aria-hidden="true" />
            <span>
              <strong>{text.isProject}</strong>
              <small>{text.isProjectHelp}</small>
            </span>
            <span className="list-switch">
              <input
                type="checkbox"
                role="switch"
                aria-label={text.isProject}
                checked={isProject}
                onChange={(event) => {
                  setIsProject(event.target.checked);
                }}
              />
              <span aria-hidden="true" />
            </span>
          </label>
        )}
        {isProject && !inbox ? (
          <label className="list-field">
            <span>{text.outcome}</span>
            <input
              value={outcome}
              aria-label={text.outcome}
              maxLength={200}
              onChange={(event) => {
                setOutcome(event.target.value);
              }}
            />
            <small>{text.outcomeHelp}</small>
          </label>
        ) : null}
        {error !== null ? <p role="alert">{error}</p> : null}
        <div className="list-modal-actions">
          <Button
            type="button"
            onClick={() => {
              onClose();
            }}
          >
            {messages.cancel}
          </Button>
          <Button type="submit" variant="primary">
            {editing === undefined ? text.createList : text.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
