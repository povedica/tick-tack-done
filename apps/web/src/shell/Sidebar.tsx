import { runAction } from '../components/run-action';
import { MODULES, moduleEnabled } from './modules';
import { useTickyFlags } from '../features/ticky/useTickyFlags';
import { ControlChip } from '../features/statistics/ControlSummary';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeTagName, FIXED_SMART_LIST_KEYS } from '@reflexionia/domain';
import { ApiError } from '@reflexionia/sdk';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  SquareCheck,
  SquareX,
  Trash2,
  ChevronDown,
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
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router';
import { api } from '../api';
import { Badge, Button } from '../components/ui';
import { TagIcon } from '../components/TagIcon';
import { fill, useMessages, type Messages } from '../i18n';
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

const LIST_COLORS = ['#4772FA', '#E13E39', '#FAA80C', '#1F9D55', '#7C5CFF', '#F06595'] as const;

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
  const smart = useQuery({ queryKey: ['smart-lists'], queryFn: () => api.listSmartLists() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: collectProjects, ...catalog });
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => api.listFilters(), ...catalog });
  const tags = useQuery({ queryKey: ['tags'], queryFn: collectTags, ...catalog });
  const countdowns = useQuery({
    queryKey: ['countdowns', 'sidebar'],
    queryFn: () => countdownsApi.list(false),
    staleTime: 5 * 60_000,
  });
  const [draft, setDraft] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const listField = useRef<HTMLInputElement>(null);
  const tagField = useRef<HTMLInputElement>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [tagMenuId, setTagMenuId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState('');
  const [searchingTags, setSearchingTags] = useState(false);
  const tagSearchTrigger = useRef<HTMLButtonElement>(null);
  const tagMenuAnchor = useRef<HTMLButtonElement>(null);
  const [showUnused, setShowUnused] = useState(false);
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.listFolders() });
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
  const archivedProjects = (projects.data?.items ?? []).filter((project) => project.closed);
  const projectItems = (projects.data?.items ?? []).filter(
    (project) =>
      !project.is_inbox &&
      !project.closed &&
      (folderItems.length === 0 || folderId(project) === null),
  );
  const showCountdowns = (countdowns.data?.items ?? []).some((item) => item.showInSidebar);

  useEffect(() => {
    if (menuId === null) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMenuId(null);
        setAddingList(false);
        setAddingTag(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  return (
    <aside
      aria-hidden={concealed ? true : undefined}
      aria-label={mobileSection === 'more' ? messages.navMore : messages.appName}
      className="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-mobile-section={mobileSection}
      inert={concealed ? true : undefined}
    >
      {mobileSection === 'more' ? (
        <div className="sidebar-account-identity">
          <span className="account-avatar" aria-hidden="true">
            {accountName.slice(0, 1).toUpperCase()}
          </span>
          <span>{accountName}</span>
        </div>
      ) : concealed ? null : (
        <ControlChip />
      )}
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
          <ul className="mobile-more-grid" aria-label={messages.navMore}>
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
                <>
                  <button
                    type="button"
                    className="nav-add"
                    aria-label={messages.newList}
                    aria-expanded={addingList}
                    onClick={() => {
                      setAddingList((current) => !current);
                      setDraft('');
                      setListError(null);
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </>
              }
            >
              {addingList ? (
                <form
                  className="nav-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = draft.trim();
                    if (name.length === 0 || name.length > 200) {
                      setListError(name.length === 0 ? null : messages.nameInvalid);
                      return;
                    }
                    const taken = projectItems.some(
                      (project) =>
                        project.name.localeCompare(name, undefined, { sensitivity: 'accent' }) ===
                        0,
                    );
                    if (taken) {
                      setListError(messages.nameTaken);
                      return;
                    }
                    void api.createProject({ name, color: '#4772fa' }, crypto.randomUUID()).then(
                      () => {
                        setDraft('');
                        setListError(null);
                        listField.current?.focus();
                        runAction(queryClient.invalidateQueries({ queryKey: ['projects'] }));
                      },
                      (error: unknown) => {
                        setListError(
                          error instanceof ApiError && error.status === 409
                            ? messages.nameTaken
                            : messages.nameInvalid,
                        );
                      },
                    );
                  }}
                >
                  <input
                    ref={listField}
                    value={draft}
                    aria-label={messages.newList}
                    placeholder={messages.newList}
                    autoFocus
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setAddingList(false);
                        setDraft('');
                        setListError(null);
                      }
                    }}
                  />
                  <Button type="submit" size="sm" variant="primary">
                    {messages.createLabel}
                  </Button>
                  {listError !== null ? <p className="error">{listError}</p> : null}
                </form>
              ) : null}
              {folderItems.map((folder) => {
                const children = (projects.data?.items ?? []).filter(
                  (project) =>
                    !project.is_inbox && !project.closed && folderId(project) === folder.id,
                );
                if (children.length === 0) {
                  return null;
                }
                return (
                  <details key={folder.id} className="nav-folder" open>
                    <summary>{folder.name}</summary>
                    <ul className="nav-list">
                      {children.map((project) => (
                        <li key={project.id}>
                          <SideLink to={`/list/${project.id}`} section onNavigate={onNavigate}>
                            <span
                              className="color-dot"
                              style={
                                project.color === null ? undefined : { background: project.color }
                              }
                            />
                            <span className="nav-label">{project.name}</span>
                            {showCounters && project.active_task_count > 0 ? (
                              <Badge value={project.active_task_count} />
                            ) : null}
                          </SideLink>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
              <ul className="nav-list">
                {projectItems.map((project) => (
                  <li
                    key={project.id}
                    className="nav-row"
                    onDragOver={allowTaskDrop}
                    onDrop={(event) => {
                      const id = taskDragId(event.dataTransfer);
                      if (id === null) {
                        return;
                      }
                      event.preventDefault();
                      runAction(
                        api.moveTask(id, project.id).then(() => {
                          runAction(refreshTaskSurfaces(queryClient));
                        }),
                      );
                    }}
                  >
                    <SideLink to={`/list/${project.id}`} section onNavigate={onNavigate}>
                      <span
                        className="color-dot"
                        style={project.color === null ? undefined : { background: project.color }}
                      />
                      <span className="nav-label">
                        {project.is_inbox ? messages.smartInbox : project.name}
                      </span>
                      {showCounters && project.active_task_count > 0 ? (
                        <Badge value={project.active_task_count} />
                      ) : null}
                    </SideLink>
                    <button
                      type="button"
                      className="nav-more-btn"
                      aria-label={messages.menuLabel}
                      aria-expanded={menuId === project.id}
                      onClick={() => {
                        setMenuId((current) => (current === project.id ? null : project.id));
                      }}
                    >
                      <MoreHorizontal size={16} aria-hidden="true" />
                    </button>
                    {menuId === project.id ? (
                      <ListMenu
                        project={project}
                        messages={messages}
                        onClose={() => {
                          setMenuId(null);
                        }}
                        onChanged={() => {
                          runAction(queryClient.invalidateQueries({ queryKey: ['projects'] }));
                        }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
              {archivedProjects.length > 0 ? (
                <details className="nav-folder">
                  <summary>{messages.archivedLists}</summary>
                  <ul className="nav-list">
                    {archivedProjects.map((project) => (
                      <li key={project.id}>
                        <SideLink to={`/list/${project.id}`} section onNavigate={onNavigate}>
                          <span className="nav-label">{project.name}</span>
                        </SideLink>
                      </li>
                    ))}
                  </ul>
                </details>
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
          <SideLink to="/settings/appearance" onNavigate={onNavigate}>
            <Settings size={20} aria-hidden="true" />
            <span className="nav-label">{messages.navSettings}</span>
          </SideLink>
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              runAction(
                api.logout().then(() => {
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
              <SquareCheck className="footer-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
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
  );
}

function folderId(project: { readonly id: string }): string | null {
  const value = (project as { folder_id?: unknown }).folder_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
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
  children,
}: {
  readonly to: string;
  readonly onNavigate: () => void;
  readonly section?: boolean;
  readonly children: ReactNode;
}) {
  const match = useMatch({ path: to, end: true });
  const selected = match !== null;
  const sectionClass = section ? ' is-section' : '';
  return (
    <NavLink
      to={to}
      data-selected={selected ? 'true' : undefined}
      className={selected ? `nav-link is-active${sectionClass}` : `nav-link${sectionClass}`}
      onClick={onNavigate}
    >
      {children}
    </NavLink>
  );
}

function ListMenu({
  project,
  messages,
  onClose,
  onChanged,
}: {
  readonly project: { id: string; name: string; is_inbox: boolean };
  readonly messages: Messages;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [name, setName] = useState(project.is_inbox ? messages.smartInbox : project.name);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="list-menu" role="menu">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (next.length === 0 || project.is_inbox) {
            return;
          }
          runAction(
            api.updateProject(project.id, { name: next }).then(() => {
              onChanged();
              onClose();
            }),
          );
        }}
      >
        <input
          aria-label={messages.rename}
          value={name}
          disabled={project.is_inbox}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </form>
      <div className="color-row" role="group" aria-label={messages.listColor}>
        {LIST_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="color-swatch"
            style={{ background: color }}
            aria-label={color}
            onClick={() => {
              runAction(
                api.updateProject(project.id, { color }).then(() => {
                  onChanged();
                  onClose();
                }),
              );
            }}
          />
        ))}
      </div>
      {project.is_inbox ? null : (
        <>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              runAction(
                api.archiveProject(project.id, crypto.randomUUID()).then(() => {
                  onChanged();
                  onClose();
                }),
              );
            }}
          >
            {messages.archiveList}
          </button>
          {confirm ? (
            <>
              <p>{fill(messages.deleteListBody, project.name)}</p>
              <button
                type="button"
                className="menu-item is-danger"
                onClick={() => {
                  runAction(
                    api.deleteProject(project.id).then(() => {
                      onChanged();
                      onClose();
                    }),
                  );
                }}
              >
                {messages.confirmDeleteList}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="menu-item is-danger"
              onClick={() => {
                setConfirm(true);
              }}
            >
              {messages.deleteList}
            </button>
          )}
        </>
      )}
    </div>
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
    return (
      !window.matchMedia('(max-width: 1023px)').matches ||
      !['lists', 'tags', 'filters'].includes(id)
    );
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
          <ChevronDown size={14} aria-hidden="true" />
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
