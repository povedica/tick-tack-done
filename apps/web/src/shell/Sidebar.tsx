import { markSession } from '../features/auth/session';
import { AccountMenu } from './AccountMenu';
import { runAction } from '../components/run-action';
import { MODULES, moduleEnabled } from './modules';
import { useTickyFlags } from '../features/ticky/useTickyFlags';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeTagName, FIXED_SMART_LIST_KEYS } from '@reflexionia/domain';
import { ApiError, type Folder, type Project } from '@reflexionia/sdk';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  SquareCheck,
  SquareX,
  Trash2,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  Inbox,
  Hourglass,
  ListTodo,
  List,
  Settings,
  Search,
  X,
  LogOut,
  MoreHorizontal,
  Plus,
  Sparkles,
  CloudSun,
  Sun,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router';
import { api } from '../api';
import { Popover } from '../components/Popover';
import { UndoToastStack } from '../components/UndoToast';
import { useLongPress } from '../components/useLongPress';
import { Badge, Button } from '../components/ui';
import { TagIcon } from '../components/TagIcon';
import { useMessages, type Messages } from '../i18n';
import { useFeatures } from '../features/settings/feature-flags';
import { usePreferences } from '../theme/preferences';
import { collectProjects, collectTags } from '../features/tasks/collect';
import { dragHasTask, taskDragId } from '../features/today/drag';
import { calendarDay, shiftDayKey, zonedWallTime } from '../features/today/groups';
import { refreshTaskSurfaces } from '../features/tasks/refresh';
import { smartPath } from '../features/tasks/model';
import { orderedSmartLists, SIDEBAR_SMART_ORDER } from './smart-order';
import { TagActions } from './TagActions';
import { countdownsApi } from '../features/countdowns/api';
import { dragHasList, listDragId, setListDrag } from './list-drag';
import { activeFolderId, ListModal } from './ListModal';
import { openListModal } from './list-modal-store';
import { FolderMenu, ListMenu } from './ListMenu';
import { useListsText } from './lists-text';
import { patchProject, sameName, type ProjectWrite } from './project-write';
import { readFolderOpen, writeFolderOpen } from './sidebar-state';

const SMART_ICONS: Record<string, LucideIcon> = {
  today: Sun,
  tomorrow: CalendarDays,
  next_7_days: CalendarRange,
  all: ListTodo,
  inbox: Inbox,
  assigned_to_me: UserRound,
  completed: CheckCircle2,
  no_date: CalendarDays,
  recently_added: Sparkles,
  someday: CloudSun,
};

export function Sidebar({
  collapsed,
  mobileSection,
  concealed = false,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly mobileSection?: 'lists' | 'more' | undefined;
  readonly concealed?: boolean;
  readonly onNavigate: () => void;
}) {
  const messages = useMessages();
  const { text } = useListsText();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const accountName = me.data?.display_name.trim().length
    ? me.data.display_name
    : (me.data?.email ?? messages.settingsAccount);
  const flags = useFeatures((state) => state.flags);
  const ticky = useTickyFlags();
  const showCounters = usePreferences((state) => state.showCounters);
  const queryClient = useQueryClient();
  const catalog = { staleTime: 5 * 60_000 };
  const smart = useQuery({
    queryKey: ['smart-lists', 'auto'],
    queryFn: () => api.listSmartLists({ context: 'auto' }),
  });
  const projects = useQuery({ queryKey: ['projects'], queryFn: collectProjects, ...catalog });
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => api.listFilters(), ...catalog });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, ...catalog });
  const countdowns = useQuery({
    queryKey: ['countdowns', 'sidebar'],
    queryFn: () => countdownsApi.list(false),
    staleTime: 5 * 60_000,
  });
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const tagField = useRef<HTMLInputElement>(null);
  const addAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [menu, setMenu] = useState<
    { kind: 'list'; id: string; archived: boolean } | { kind: 'folder'; id: string } | null
  >(null);
  const [folderUndo, setFolderUndo] = useState<{
    id: string;
    name: string;
    listIds: readonly string[];
  } | null>(null);
  const dropRef = useRef<ListDrop | null>(null);
  const [drop, setDrop] = useState<ListDrop | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const finePointer = useFinePointer();
  const [tagMenuId, setTagMenuId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState('');
  const [searchingTags, setSearchingTags] = useState(false);
  const tagSearchTrigger = useRef<HTMLButtonElement>(null);
  const tagMenuAnchor = useRef<HTMLButtonElement>(null);
  const [showUnused, setShowUnused] = useState(false);
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.listFolders() });
  const archivedQuery = useQuery({
    queryKey: ['projects', 'archived'],
    queryFn: () => collectClosedProjects(),
    staleTime: 5 * 60_000,
  });
  const location = useLocation();
  const showSomeday = useFeatures((state) => state.flags.when_deadline);
  const ordered = orderedSmartLists(smart.data?.items ?? []);
  const lists = ordered.filter(
    (item) =>
      (item.enabled || FIXED_SMART_LIST_KEYS.includes(item.key)) &&
      (SIDEBAR_SMART_ORDER as readonly string[]).includes(item.key),
  );
  const someday = ordered.find((item) => item.key === 'someday');
  const navLists = lists.filter((item) => item.key !== 'trash' && item.key !== 'completed');
  if (showSomeday && someday !== undefined && !navLists.some((item) => item.key === 'someday')) {
    const afterDates = navLists.findIndex((item) => item.key === 'next_7_days');
    navLists.splice(afterDates + 1, 0, someday);
  }
  const trash = ordered.find((item) => item.key === 'trash');
  const trashVisible = trash === undefined || trash.enabled;
  const filterItems = filters.data?.items ?? [];
  const tagItems = tags.data?.items ?? [];
  const tagNeedle = tagQuery.trim().toLowerCase();
  const orderedTags: typeof tagItems = [];
  const tagDepth = new Map<string, number>();
  const appendTags = (parent: string | null, depth: number): void => {
    for (const tag of [...tagItems].sort(
      (a, b) => Number(a.sort_order) - Number(b.sort_order) || a.name.localeCompare(b.name),
    )) {
      if ((tag.parent_id ?? null) !== parent || tagDepth.has(tag.id)) continue;
      tagDepth.set(tag.id, depth);
      orderedTags.push(tag);
      appendTags(tag.id, depth + 1);
    }
  };
  appendTags(null, 0);
  for (const tag of tagItems)
    if (!tagDepth.has(tag.id)) {
      tagDepth.set(tag.id, 0);
      orderedTags.push(tag);
    }
  const visibleTags = orderedTags.filter((tag) =>
    tagNeedle.length > 0
      ? tag.name.toLowerCase().includes(tagNeedle)
      : showUnused || tag.active_task_count > 0,
  );
  const folderItems = folders.data?.items ?? [];
  const archivedProjects = archivedQuery.data?.items ?? [];
  const projectItems = (projects.data?.items ?? []).filter(
    (project) =>
      !project.is_inbox &&
      !project.closed &&
      (folderItems.length === 0 || folderId(project) === null),
  );
  const routeFolder = activeFolderId(location.pathname, projects.data?.items ?? []);
  const showCountdowns = (countdowns.data?.items ?? []).some((item) => item.showInSidebar);

  useEffect(() => {
    function onDragEnd(): void {
      setDraggingId(null);
      setListDrop(null);
    }
    window.addEventListener('dragend', onDragEnd);
    return () => {
      window.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  function setListDrop(next: ListDrop | null): void {
    dropRef.current = next;
    setDrop(next);
  }

  function refreshLists(): Promise<void> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['folders'] }),
      queryClient.invalidateQueries({ queryKey: ['projects-overview'] }),
    ]).then(() => undefined);
  }

  function openMenu(
    next: { kind: 'list'; id: string; archived: boolean } | { kind: 'folder'; id: string },
    anchor: HTMLElement,
  ): void {
    menuAnchor.current = anchor;
    setMenu(next);
  }

  function looseDrop(event: DragEvent<HTMLElement>, siblings: readonly Project[]): void {
    if (!dragHasList(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    const afterLast = siblings.at(-1);
    setListDrop({
      kind: 'row',
      folderId: null,
      beforeId: null,
      end: true,
      afterId: afterLast?.id ?? null,
    });
  }

  function rowOver(
    event: DragEvent<HTMLElement>,
    project: Project,
    siblings: readonly Project[],
    folder: string | null,
  ): void {
    if (dragHasTask(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!dragHasList(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const index = siblings.findIndex((item) => item.id === project.id);
    const after = event.clientY > rect.top + rect.height / 2;
    const next = siblings.at(index + 1);
    if (!after) {
      setListDrop({
        kind: 'row',
        folderId: folder,
        beforeId: project.id,
        end: false,
        afterId: null,
      });
      return;
    }
    if (next !== undefined) {
      setListDrop({ kind: 'row', folderId: folder, beforeId: next.id, end: false, afterId: null });
      return;
    }
    setListDrop({ kind: 'row', folderId: folder, beforeId: null, end: true, afterId: project.id });
  }

  function dropList(event: DragEvent<HTMLElement>): void {
    const taskId = taskDragId(event.dataTransfer);
    if (taskId !== null) {
      return;
    }
    const id = listDragId(event.dataTransfer);
    const target = dropRef.current;
    if (id === null || target === null) {
      return;
    }
    event.preventDefault();
    setListDrop(null);
    if (target.kind === 'row' && target.beforeId === id) {
      return;
    }
    const body: ProjectWrite =
      target.kind === 'folder'
        ? { folder_id: target.folderId }
        : target.end === true || typeof target.beforeId !== 'string'
          ? { folder_id: target.folderId, move_to_end: true }
          : { folder_id: target.folderId, before_id: target.beforeId };
    runAction(
      patchProject(id, body).then(() => {
        return refreshLists();
      }),
    );
  }

  function dropTask(event: DragEvent<HTMLElement>, projectId: string): void {
    const id = taskDragId(event.dataTransfer);
    if (id === null) {
      dropList(event);
      return;
    }
    event.preventDefault();
    runAction(
      api.moveTask(id, projectId).then(() => {
        runAction(refreshTaskSurfaces(queryClient));
      }),
    );
  }

  function submitFolder(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      setFolderError(trimmed.length === 0 ? null : messages.nameInvalid);
      return;
    }
    if (folderItems.some((folder) => sameName(folder.name, trimmed))) {
      setFolderError(messages.nameTaken);
      return;
    }
    api.createFolder({ name: trimmed }, crypto.randomUUID()).then(
      () => {
        setCreatingFolder(false);
        setFolderDraft('');
        setFolderError(null);
        return refreshLists();
      },
      (error: unknown) => {
        setFolderError(
          error instanceof ApiError && error.status === 409
            ? messages.nameTaken
            : messages.nameInvalid,
        );
      },
    );
  }

  function deleteFolder(folder: Folder): void {
    const owned = [...(projects.data?.items ?? []), ...archivedProjects].filter(
      (project) => project.folder_id === folder.id,
    );
    runAction(
      api.deleteFolder(folder.id).then(() => {
        setFolderUndo({
          id: crypto.randomUUID(),
          name: folder.name,
          listIds: owned.map((project) => project.id),
        });
        return refreshLists();
      }),
    );
  }

  return (
    <>
      <aside
        id="section-sidebar"
        aria-hidden={concealed ? true : undefined}
        aria-label={mobileSection === 'more' ? messages.navMore : messages.appName}
        className="sidebar"
        data-collapsed={collapsed ? 'true' : 'false'}
        data-mobile-section={mobileSection}
        inert={concealed ? true : undefined}
      >
        {mobileSection === 'more' ? (
          <div className="sidebar-account-identity">
            <AccountMenu />
            <span>{accountName}</span>
          </div>
        ) : null}
        {mobileSection !== 'more' && smart.isPending ? (
          <div className="ui-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {mobileSection !== 'more' && smart.isError ? (
          <p>
            {messages.sidebarError}{' '}
            <button
              type="button"
              onClick={() => {
                runAction(smart.refetch());
              }}
            >
              {messages.retry}
            </button>
          </p>
        ) : null}
        <nav>
          {mobileSection === 'more' ? (
            <ul className="nav-list mobile-more-grid" aria-label={messages.navMore}>
              {flags.navigation_order
                .filter(
                  (key) =>
                    key !== 'calendar' &&
                    moduleEnabled(key, flags, ticky.isSuccess && ticky.data.ui && !ticky.data.kill),
                )
                .map((key) => {
                  const module = MODULES[key];
                  const Icon = module.icon;
                  return (
                    <li key={key}>
                      <SideLink to={module.to} onNavigate={onNavigate}>
                        <Icon size={22} aria-hidden="true" />
                        <span className="nav-label">{messages[module.label]}</span>
                      </SideLink>
                    </li>
                  );
                })}
              <li>
                <SideLink to="/filters" onNavigate={onNavigate}>
                  <List size={22} aria-hidden="true" />
                  <span className="nav-label">{messages.filtersTitle}</span>
                </SideLink>
              </li>
            </ul>
          ) : (
            <>
              <section className="sidebar-smart-lists" aria-label={messages.smartListsTitle}>
                <ul className="nav-list">
                  {navLists.map((item) => (
                    <li
                      key={item.id}
                      onDragOver={allowTaskDrop}
                      onDrop={(event) => {
                        const id = taskDragId(event.dataTransfer);
                        if (id === null || (item.key !== 'today' && item.key !== 'tomorrow')) {
                          return;
                        }
                        event.preventDefault();
                        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        const today = calendarDay(new Date().toISOString(), zone);
                        const due = zonedWallTime(
                          shiftDayKey(today, item.key === 'today' ? 0 : 1),
                          0,
                          0,
                          zone,
                        );
                        if (due === null) {
                          return;
                        }
                        runAction(
                          api
                            .patchTask(id, { due_date: due, is_all_day: true, time_zone: zone })
                            .then(() => {
                              runAction(refreshTaskSurfaces(queryClient));
                            }),
                        );
                      }}
                    >
                      <SideLink to={smartPath(item.key)} onNavigate={onNavigate}>
                        <SmartIcon name={item.key} />
                        <span className="nav-label">{smartLabel(messages, item.key)}</span>
                        {showCounters && item.task_count > 0 ? (
                          <Badge value={item.task_count} />
                        ) : null}
                      </SideLink>
                    </li>
                  ))}
                </ul>
              </section>
              <NavGroup
                id="filters"
                title={messages.filtersTitle}
                actions={
                  <>
                    <Link
                      className="nav-add"
                      to="/filters"
                      aria-label={messages.newFilter}
                      onClick={onNavigate}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </Link>
                  </>
                }
              >
                {filters.isSuccess && filterItems.length === 0 ? (
                  <p className="nav-empty">{messages.filtersEmpty}</p>
                ) : null}
                <ul className="nav-list">
                  {filterItems.map((filter) => (
                    <li key={filter.id}>
                      <SideLink to={`/filter/${filter.id}`} section onNavigate={onNavigate}>
                        <span
                          className="color-dot"
                          style={filter.color === null ? undefined : { background: filter.color }}
                        />
                        <span className="nav-label">{filter.name}</span>
                        {showCounters && filter.task_count > 0 ? (
                          <Badge value={filter.task_count} />
                        ) : null}
                      </SideLink>
                    </li>
                  ))}
                </ul>
              </NavGroup>
              <NavGroup
                id="lists"
                title={messages.listsTitle}
                actions={
                  <button
                    ref={addAnchor}
                    type="button"
                    className="nav-add"
                    aria-label={text.addLabel}
                    aria-haspopup="menu"
                    aria-expanded={addOpen}
                    onClick={() => {
                      setAddOpen((current) => !current);
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                }
              >
                {creatingFolder ? (
                  <form
                    className="nav-create"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitFolder(folderDraft);
                    }}
                  >
                    <input
                      value={folderDraft}
                      aria-label={text.newFolder}
                      placeholder={text.newFolder}
                      autoFocus
                      maxLength={200}
                      onChange={(event) => {
                        setFolderDraft(event.target.value);
                        setFolderError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setCreatingFolder(false);
                          setFolderDraft('');
                          setFolderError(null);
                        }
                      }}
                    />
                    {folderError !== null ? <p className="error">{folderError}</p> : null}
                  </form>
                ) : null}
                {folderItems.map((folder) => {
                  const children = (projects.data?.items ?? []).filter(
                    (project) =>
                      !project.is_inbox && !project.closed && folderId(project) === folder.id,
                  );
                  return (
                    <FolderBlock
                      key={folder.id}
                      folder={folder}
                      renaming={renamingFolderId === folder.id}
                      dropped={drop?.kind === 'folder' && drop.folderId === folder.id}
                      menuOpen={menu?.kind === 'folder' && menu.id === folder.id}
                      onRenameCancel={() => {
                        setRenamingFolderId(null);
                      }}
                      onRename={(name) => {
                        const trimmed = name.trim();
                        if (trimmed.length === 0 || trimmed.length > 200) {
                          setFolderError(trimmed.length === 0 ? null : messages.nameInvalid);
                          return;
                        }
                        if (
                          folderItems.some(
                            (item) => item.id !== folder.id && sameName(item.name, trimmed),
                          )
                        ) {
                          setFolderError(messages.nameTaken);
                          return;
                        }
                        runAction(
                          api.updateFolder(folder.id, { name: trimmed }).then(() => {
                            setRenamingFolderId(null);
                            setFolderError(null);
                            return refreshLists();
                          }),
                        );
                      }}
                      onOpenMenu={(anchor) => {
                        openMenu({ kind: 'folder', id: folder.id }, anchor);
                      }}
                      onDragOver={(event) => {
                        if (!dragHasList(event.dataTransfer)) {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        setListDrop({ kind: 'folder', folderId: folder.id });
                      }}
                      onDrop={(event) => {
                        if (dragHasList(event.dataTransfer)) {
                          setListDrop({ kind: 'folder', folderId: folder.id });
                        }
                        dropList(event);
                      }}
                    >
                      {children.map((project) => (
                        <ListRow
                          key={project.id}
                          project={project}
                          showCounters={showCounters}
                          draggable={finePointer}
                          dragging={draggingId === project.id}
                          insertBefore={
                            drop?.kind === 'row' &&
                            drop.end !== true &&
                            drop.beforeId === project.id
                          }
                          insertAfter={
                            drop?.kind === 'row' && drop.end === true && drop.afterId === project.id
                          }
                          menuOpen={menu?.kind === 'list' && menu.id === project.id}
                          inboxLabel={messages.smartInbox}
                          menuLabel={messages.menuLabel}
                          onNavigate={() => {
                            setMenu(null);
                            onNavigate();
                          }}
                          onOpenMenu={(anchor) => {
                            openMenu({ kind: 'list', id: project.id, archived: false }, anchor);
                          }}
                          onDragStart={(event) => {
                            setListDrag(event.dataTransfer, project.id);
                            setDraggingId(project.id);
                          }}
                          onDragOver={(event) => {
                            rowOver(event, project, children, folder.id);
                          }}
                          onDrop={(event) => {
                            dropTask(event, project.id);
                          }}
                        />
                      ))}
                    </FolderBlock>
                  );
                })}
                <ul
                  className="nav-list"
                  data-loose-lists=""
                  onDragOver={(event) => {
                    looseDrop(event, projectItems);
                  }}
                  onDrop={dropList}
                >
                  {projectItems.map((project) => (
                    <ListRow
                      key={project.id}
                      project={project}
                      showCounters={showCounters}
                      draggable={finePointer}
                      dragging={draggingId === project.id}
                      insertBefore={
                        drop?.kind === 'row' && drop.end !== true && drop.beforeId === project.id
                      }
                      insertAfter={
                        drop?.kind === 'row' && drop.end === true && drop.afterId === project.id
                      }
                      menuOpen={menu?.kind === 'list' && menu.id === project.id}
                      inboxLabel={messages.smartInbox}
                      menuLabel={messages.menuLabel}
                      onNavigate={() => {
                        setMenu(null);
                        onNavigate();
                      }}
                      onOpenMenu={(anchor) => {
                        openMenu({ kind: 'list', id: project.id, archived: false }, anchor);
                      }}
                      onDragStart={(event) => {
                        setListDrag(event.dataTransfer, project.id);
                        setDraggingId(project.id);
                      }}
                      onDragOver={(event) => {
                        rowOver(event, project, projectItems, null);
                      }}
                      onDrop={(event) => {
                        dropTask(event, project.id);
                      }}
                    />
                  ))}
                </ul>
                {archivedProjects.length > 0 ? (
                  <details className="nav-folder">
                    <summary>
                      <ChevronDown className="folder-chevron" size={12} aria-hidden="true" />
                      <FolderIcon size={16} aria-hidden="true" />
                      {messages.archivedLists}
                    </summary>
                    <ul className="nav-list">
                      {archivedProjects.map((project) => (
                        <ListRow
                          key={project.id}
                          project={project}
                          showCounters={false}
                          draggable={false}
                          dragging={false}
                          insertBefore={false}
                          insertAfter={false}
                          menuOpen={menu?.kind === 'list' && menu.id === project.id}
                          inboxLabel={messages.smartInbox}
                          menuLabel={messages.menuLabel}
                          onNavigate={() => {
                            setMenu(null);
                            onNavigate();
                          }}
                          onOpenMenu={(anchor) => {
                            openMenu({ kind: 'list', id: project.id, archived: true }, anchor);
                          }}
                          onDragStart={() => undefined}
                          onDragOver={() => undefined}
                          onDrop={() => undefined}
                        />
                      ))}
                    </ul>
                  </details>
                ) : null}
                {addOpen ? (
                  <Popover
                    open
                    anchor={addAnchor}
                    label={text.addLabel}
                    className="popover list-menu-popover"
                    width={220}
                    onClose={() => {
                      setAddOpen(false);
                    }}
                  >
                    <div role="menu">
                      <button
                        type="button"
                        className="menu-item"
                        role="menuitem"
                        onClick={() => {
                          setAddOpen(false);
                          openListModal({ folderId: routeFolder });
                        }}
                      >
                        {messages.newList}
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        role="menuitem"
                        onClick={() => {
                          setAddOpen(false);
                          setCreatingFolder(true);
                          setFolderDraft('');
                          setFolderError(null);
                        }}
                      >
                        {text.newFolder}
                      </button>
                    </div>
                  </Popover>
                ) : null}
              </NavGroup>
              <NavGroup
                id="tags"
                title={messages.tagsTitle}
                actions={
                  <>
                    <button
                      type="button"
                      className="nav-add"
                      ref={tagSearchTrigger}
                      aria-label={messages.tagSearch}
                      aria-expanded={searchingTags}
                      onClick={() => {
                        setSearchingTags((value) => !value);
                        setTagQuery('');
                      }}
                    >
                      <Search size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="nav-add"
                      aria-label={messages.newTag}
                      aria-expanded={addingTag}
                      onClick={() => {
                        setAddingTag((current) => !current);
                        setTagDraft('');
                        setTagError(null);
                      }}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </>
                }
              >
                {tags.isSuccess && tagItems.length === 0 && !addingTag ? (
                  <p className="nav-empty">{messages.tagsEmpty}</p>
                ) : null}
                {addingTag ? (
                  <form
                    className="nav-create"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = normalizeTagName(tagDraft);
                      if (name === null) {
                        setTagError(tagDraft.trim().length === 0 ? null : messages.nameInvalid);
                        return;
                      }
                      void api.createTag({ name, color: '#4772fa' }, crypto.randomUUID()).then(
                        () => {
                          setTagDraft('');
                          setTagError(null);
                          tagField.current?.focus();
                          runAction(queryClient.invalidateQueries({ queryKey: ['tags'] }));
                        },
                        (error: unknown) => {
                          setTagError(
                            error instanceof ApiError &&
                              (error.status === 409 || error.code === 'tag_name_taken')
                              ? messages.nameTaken
                              : messages.nameInvalid,
                          );
                        },
                      );
                    }}
                  >
                    <input
                      ref={tagField}
                      value={tagDraft}
                      aria-label={messages.newTag}
                      placeholder={messages.newTag}
                      autoFocus
                      onChange={(event) => {
                        setTagDraft(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setAddingTag(false);
                          setTagDraft('');
                          setTagError(null);
                        }
                      }}
                    />
                    <Button type="submit" size="sm" variant="primary">
                      {messages.createLabel}
                    </Button>
                    {tagError !== null ? <p className="error">{tagError}</p> : null}
                  </form>
                ) : null}
                {searchingTags ? (
                  <div className="tag-search-field">
                    <Search size={15} aria-hidden="true" />
                    <input
                      autoFocus
                      value={tagQuery}
                      aria-label={messages.tagSearch}
                      placeholder={messages.tagSearch}
                      onChange={(event) => {
                        setTagQuery(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          event.stopPropagation();
                          tagSearchTrigger.current?.focus();
                          setSearchingTags(false);
                          setTagQuery('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      aria-label={messages.close}
                      onClick={() => {
                        setSearchingTags(false);
                        setTagQuery('');
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="nav-unused"
                  aria-pressed={showUnused}
                  onClick={() => {
                    setShowUnused((current) => !current);
                  }}
                >
                  {showUnused ? messages.hideUnusedTags : messages.showUnusedTags}
                </button>
                {tagNeedle && visibleTags.length === 0 ? (
                  <p className="tag-search-empty">{messages.tagNoMatches}</p>
                ) : null}
                <ul className="nav-list">
                  {visibleTags.map((tag) => {
                    const href = `/tag/${tag.id}`;
                    const current = `${location.pathname}${location.search}` === href;
                    return (
                      <li key={tag.id} className="nav-row">
                        <Link
                          aria-current={current ? 'page' : undefined}
                          className={
                            current ? 'nav-link is-active is-section' : 'nav-link is-section'
                          }
                          data-selected={current ? 'true' : undefined}
                          to={href}
                          onClick={onNavigate}
                        >
                          <span
                            style={{
                              marginInlineStart: Math.min(tagDepth.get(tag.id) ?? 0, 4) * 10,
                              display: 'flex',
                            }}
                          >
                            <TagIcon color={tag.color} />
                          </span>
                          <span className="nav-label">{tag.name}</span>
                          {showCounters && tag.active_task_count > 0 ? (
                            <Badge value={tag.active_task_count} />
                          ) : null}
                        </Link>
                        <button
                          type="button"
                          className="nav-more-btn"
                          aria-label={`${messages.tagActions}: ${tag.name}`}
                          aria-haspopup="dialog"
                          aria-expanded={tagMenuId === tag.id}
                          onClick={(event) => {
                            tagMenuAnchor.current = event.currentTarget;
                            setTagMenuId((current) => (current === tag.id ? null : tag.id));
                          }}
                        >
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </button>
                        {tagMenuId === tag.id ? (
                          <TagActions
                            anchor={tagMenuAnchor}
                            tag={tag}
                            tags={tagItems}
                            messages={messages}
                            onClose={() => {
                              setTagMenuId(null);
                            }}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </NavGroup>
              {flags.countdowns && showCountdowns ? (
                <ul className="nav-list countdown-side">
                  {(countdowns.data?.items ?? [])
                    .filter((item) => item.showInSidebar)
                    .slice(0, 3)
                    .map((item) => (
                      <li key={item.id}>
                        <SideLink to="/countdowns" onNavigate={onNavigate}>
                          <Hourglass size={20} aria-hidden="true" />
                          <span className="nav-label">{item.title}</span>
                        </SideLink>
                      </li>
                    ))}
                </ul>
              ) : null}
            </>
          )}
        </nav>
        {mobileSection === 'more' ? (
          <div className="sidebar-footer sidebar-more-footer">
            <SideLink to="/settings" onNavigate={onNavigate}>
              <Settings size={20} aria-hidden="true" />
              <span className="nav-label">{messages.navSettings}</span>
            </SideLink>
            <button
              type="button"
              className="nav-link"
              onClick={() => {
                runAction(
                  api.logout().then(() => {
                    markSession('anonymous');
                    queryClient.clear();
                    onNavigate();
                    runAction(Promise.resolve(navigate('/login', { replace: true })));
                  }),
                );
              }}
            >
              <LogOut size={20} aria-hidden="true" />
              <span className="nav-label">{messages.signOut}</span>
            </button>
          </div>
        ) : (
          <div className="sidebar-footer">
            {ordered.some((item) => item.key === 'completed' && item.enabled) ? (
              <SideLink to="/smart/completed" onNavigate={onNavigate}>
                <SquareCheck
                  className="footer-icon"
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="nav-label">{messages.smartCompleted}</span>
              </SideLink>
            ) : null}
            <SideLink to="/tasks/cancelled" onNavigate={onNavigate}>
              <SquareX className="footer-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="nav-label">{messages.navWont}</span>
            </SideLink>
            {trashVisible ? (
              <SideLink to="/smart/trash" onNavigate={onNavigate}>
                <Trash2 className="footer-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="nav-label">{messages.smartTrash}</span>
                {showCounters && smart.isPending ? <span className="ui-badge">—</span> : null}
                {showCounters &&
                smart.isSuccess &&
                ((trash?.task_count ?? 0) > 0 || mobileSection === undefined) ? (
                  <Badge value={trash?.task_count ?? 0} />
                ) : null}
              </SideLink>
            ) : null}
          </div>
        )}
      </aside>
      {menu?.kind === 'list'
        ? (() => {
            const project = [...(projects.data?.items ?? []), ...archivedProjects].find(
              (item) => item.id === menu.id,
            );
            return project === undefined ? null : (
              <ListMenu
                project={project}
                folders={folderItems}
                viewerId={me.data?.id}
                anchor={menuAnchor}
                archived={menu.archived}
                onClose={() => {
                  setMenu(null);
                }}
              />
            );
          })()
        : null}
      {menu?.kind === 'folder'
        ? (() => {
            const folder = folderItems.find((item) => item.id === menu.id);
            if (folder === undefined) {
              return null;
            }
            const listCount = [...(projects.data?.items ?? []), ...archivedProjects].filter(
              (project) => project.folder_id === folder.id && !project.is_inbox,
            ).length;
            return (
              <FolderMenu
                folder={folder}
                anchor={menuAnchor}
                listCount={listCount}
                onClose={() => {
                  setMenu(null);
                }}
                onRename={() => {
                  setRenamingFolderId(folder.id);
                }}
                onDelete={() => {
                  deleteFolder(folder);
                }}
              />
            );
          })()
        : null}
      <ListModal />
      <UndoToastStack
        items={folderUndo === null ? [] : [{ id: folderUndo.id, title: folderUndo.name }]}
        message={text.folderDeleted}
        undoLabel={messages.undo}
        onUndo={(id) => {
          const pending = folderUndo;
          if (pending?.id !== id) {
            return;
          }
          setFolderUndo(null);
          runAction(
            api
              .createFolder({ name: pending.name }, crypto.randomUUID())
              .then((created) =>
                Promise.all(
                  pending.listIds.map((listId) => patchProject(listId, { folder_id: created.id })),
                ).then(() => refreshLists()),
              ),
          );
        }}
        onExpire={() => {
          setFolderUndo(null);
        }}
      />
    </>
  );
}

function folderId(project: { readonly folder_id?: string | null }): string | null {
  return typeof project.folder_id === 'string' && project.folder_id.length > 0
    ? project.folder_id
    : null;
}

function allowTaskDrop(event: DragEvent<HTMLLIElement>): void {
  if (dragHasTask(event.dataTransfer)) {
    event.preventDefault();
  }
}

function SideLink({
  to,
  onNavigate,
  section = false,
  style,
  children,
}: {
  readonly to: string;
  readonly onNavigate: () => void;
  readonly section?: boolean;
  readonly style?: CSSProperties | undefined;
  readonly children: ReactNode;
}) {
  const match = useMatch({ path: to, end: true });
  const selected = match !== null;
  const sectionClass = section ? ' is-section' : '';
  return (
    <NavLink
      to={to}
      {...(style === undefined ? {} : { style })}
      data-selected={selected ? 'true' : undefined}
      className={selected ? `nav-link is-active${sectionClass}` : `nav-link${sectionClass}`}
      onClick={onNavigate}
    >
      {children}
    </NavLink>
  );
}

interface ListDrop {
  readonly kind: 'folder' | 'row';
  readonly folderId: string | null;
  readonly beforeId?: string | null;
  readonly end?: boolean;
  readonly afterId?: string | null;
}

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
    const apply = (): void => {
      setFine(media.matches);
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, []);
  return fine;
}

async function collectClosedProjects(): Promise<{ items: Project[] }> {
  const items: Project[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await api.listProjects({
      limit: 100,
      state: 'archived',
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...result.items);
    if (result.next_cursor === null) {
      return { items };
    }
    cursor = result.next_cursor;
  }
  return { items };
}

function FolderBlock({
  folder,
  renaming,
  dropped,
  menuOpen,
  onRenameCancel,
  onRename,
  onOpenMenu,
  onDragOver,
  onDrop,
  children,
}: {
  readonly folder: Folder;
  readonly renaming: boolean;
  readonly dropped: boolean;
  readonly menuOpen: boolean;
  readonly onRenameCancel: () => void;
  readonly onRename: (name: string) => void;
  readonly onOpenMenu: (anchor: HTMLElement) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly children: ReactNode;
}) {
  const messages = useMessages();
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(() => readFolderOpen(folder.id));
  const [draft, setDraft] = useState(folder.name);
  const press = useLongPress(() => {
    if (rowRef.current !== null) {
      onOpenMenu(rowRef.current);
    }
  });
  return (
    <div
      className={dropped ? 'nav-folder is-drop' : 'nav-folder'}
      data-open={open ? 'true' : 'false'}
      data-folder-id={folder.id}
    >
      <div
        ref={rowRef}
        className="nav-folder-main nav-row"
        onDragOver={onDragOver}
        onDrop={onDrop}
        {...press}
      >
        {renaming ? (
          <form
            className="nav-folder-toggle"
            onSubmit={(event) => {
              event.preventDefault();
              onRename(draft);
            }}
          >
            <ChevronDown className="folder-chevron" size={12} aria-hidden="true" />
            {open ? (
              <FolderOpen size={16} aria-hidden="true" />
            ) : (
              <FolderIcon size={16} aria-hidden="true" />
            )}
            <input
              value={draft}
              aria-label={messages.rename}
              autoFocus
              maxLength={200}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraft(folder.name);
                  onRenameCancel();
                }
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            className="nav-folder-toggle"
            aria-expanded={open}
            onClick={() => {
              const next = !open;
              writeFolderOpen(folder.id, next);
              setOpen(next);
            }}
          >
            <ChevronDown className="folder-chevron" size={12} aria-hidden="true" />
            {open ? (
              <FolderOpen size={16} aria-hidden="true" />
            ) : (
              <FolderIcon size={16} aria-hidden="true" />
            )}
            <span className="nav-folder-name">{folder.name}</span>
          </button>
        )}
        {folder.active_task_count > 0 ? (
          <span className="nav-count">{folder.active_task_count}</span>
        ) : null}
        <button
          type="button"
          className="nav-more-btn"
          aria-label={messages.menuLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu(event.currentTarget);
          }}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </div>
      {open ? <ul className="nav-list">{children}</ul> : null}
    </div>
  );
}

function ListRow({
  project,
  showCounters,
  draggable,
  dragging,
  insertBefore,
  insertAfter,
  menuOpen,
  inboxLabel,
  menuLabel,
  onNavigate,
  onOpenMenu,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  readonly project: Project;
  readonly showCounters: boolean;
  readonly draggable: boolean;
  readonly dragging: boolean;
  readonly insertBefore: boolean | undefined;
  readonly insertAfter: boolean | undefined;
  readonly menuOpen: boolean;
  readonly inboxLabel: string;
  readonly menuLabel: string;
  readonly onNavigate: () => void;
  readonly onOpenMenu: (anchor: HTMLElement) => void;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const press = useLongPress(() => {
    const row = rowRef.current;
    if (row !== null) {
      onOpenMenu(row);
    }
  });
  const tint =
    project.color === null ? undefined : ({ '--list-tint': project.color } as CSSProperties);
  const Icon = project.is_project ? Target : List;
  return (
    <>
      {insertBefore === true ? <li className="list-insert" aria-hidden="true" /> : null}
      <li
        ref={rowRef}
        className={dragging ? 'nav-row is-dragging' : 'nav-row'}
        data-list-id={project.id}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        {...press}
      >
        <SideLink to={`/list/${project.id}`} section style={tint} onNavigate={onNavigate}>
          <Icon className="nav-list-icon" size={16} aria-hidden="true" />
          <span className="nav-label">{project.is_inbox ? inboxLabel : project.name}</span>
          {showCounters && project.active_task_count > 0 ? (
            <Badge value={project.active_task_count} />
          ) : null}
        </SideLink>
        <button
          type="button"
          className="nav-more-btn"
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            onOpenMenu(event.currentTarget);
          }}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </li>
      {insertAfter === true ? <li className="list-insert" aria-hidden="true" /> : null}
    </>
  );
}

function SmartIcon({ name }: { readonly name: string }) {
  const Icon = SMART_ICONS[name] ?? ListTodo;
  return <Icon size={20} aria-hidden="true" />;
}

function smartLabel(messages: Messages, key: string): string {
  switch (key) {
    case 'today':
      return messages.smartToday;
    case 'tomorrow':
      return messages.smartTomorrow;
    case 'next_7_days':
      return messages.smartNext7;
    case 'all':
      return messages.smartAll;
    case 'inbox':
      return messages.smartInbox;
    case 'assigned_to_me':
      return messages.smartAssigned;
    case 'completed':
      return messages.smartCompleted;
    case 'trash':
      return messages.smartTrash;
    case 'no_date':
      return messages.smartNoDate;
    case 'recently_added':
      return messages.smartRecent;
    case 'someday':
      return messages.smartSomeday;
    default:
      return key;
  }
}

function NavGroup({
  id,
  title,
  actions,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const storage = `tick-tack-done.sidebar-group.${id}`;
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storage);
    if (saved !== null) return saved !== 'closed';
    return true;
  });
  return (
    <section className="nav-group">
      <div className="nav-group-header">
        <button
          type="button"
          className="nav-group-toggle"
          aria-expanded={open}
          onClick={() => {
            localStorage.setItem(storage, open ? 'closed' : 'open');
            setOpen(!open);
          }}
        >
          <ChevronDown size={12} strokeWidth={1.25} aria-hidden="true" />
          {title}
        </button>
        {actions ? (
          <div
            className="nav-group-actions"
            onClick={() => {
              if (!open) {
                setOpen(true);
                localStorage.setItem(storage, 'open');
              }
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>
      <div hidden={!open}>{children}</div>
    </section>
  );
}
