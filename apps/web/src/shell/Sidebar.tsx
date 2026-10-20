import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeTagName } from '@reflexionia/domain';
import { ApiError } from '@reflexionia/sdk';
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Hourglass,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  CloudSun,
  Sun,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router';
import { api } from '../api';
import { BrandMark } from '../components/BrandMark';
import { Badge, Button } from '../components/ui';
import { fill, useMessages, type Messages } from '../i18n';
import { useFeatures } from '../features/settings/feature-flags';
import { usePreferences } from '../theme/preferences';
import { nextTheme, type ThemePreference } from '../theme/preference';
import { useThemePreference } from '../theme/store';
import { collectProjects, collectTags } from '../features/tasks/collect';
import { dragHasTask, taskDragId } from '../features/today/drag';
import { calendarDay, shiftDayKey, zonedWallTime } from '../features/today/groups';
import { refreshTaskSurfaces } from '../features/tasks/refresh';
import { smartPath } from '../features/tasks/model';
import { orderedSmartLists, SIDEBAR_SMART_ORDER } from './smart-order';
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
  concealed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly concealed?: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onNavigate: () => void;
}) {
  const messages = useMessages();
  const flags = useFeatures((state) => state.flags);
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
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
  const [showUnused, setShowUnused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.listFolders() });
  const location = useLocation();
  const [confirmTrash, setConfirmTrash] = useState(false);
  const themeLabel = themeName(messages, preference);
  const showSomeday = useFeatures((state) => state.flags.when_deadline);
  const ordered = orderedSmartLists(smart.data?.items ?? []);
  const lists = ordered.filter(
    (item) => item.enabled && (SIDEBAR_SMART_ORDER as readonly string[]).includes(item.key),
  );
  const someday = ordered.find((item) => item.key === 'someday');
  const navLists = lists.filter(
    (item) => item.enabled && item.key !== 'trash' && item.key !== 'completed',
  );
  if (showSomeday && someday?.enabled === true && !navLists.some((item) => item.key === 'someday')) {
    const afterDates = navLists.findIndex((item) => item.key === 'next_7_days');
    navLists.splice(afterDates + 1, 0, someday);
  }
  const trash = ordered.find((item) => item.key === 'trash');
  const trashVisible = trash === undefined || trash.enabled;
  const filterItems = filters.data?.items ?? [];
  const tagItems = tags.data?.items ?? [];
  const tagNeedle = tagQuery.trim().toLowerCase();
  const visibleTags = [...tagItems]
    .filter((tag) =>
      tagNeedle.length > 0
        ? tag.name.toLowerCase().includes(tagNeedle)
        : showUnused || tag.active_task_count > 0,
    )
    .sort(
      (left, right) =>
        right.active_task_count - left.active_task_count || left.name.localeCompare(right.name),
    );
  const folderItems = folders.data?.items ?? [];
  const archivedProjects = (projects.data?.items ?? []).filter((project) => project.closed);
  const projectItems = (projects.data?.items ?? []).filter(
    (project) => !project.closed && (folderItems.length === 0 || folderId(project) === null),
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
      aria-label={messages.appName}
      className="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      inert={concealed ? true : undefined}
    >
      <NavLink className="brand" to="/today" onClick={onNavigate}>
        <BrandMark />
        <span className="brand-name">{messages.appName}</span>
      </NavLink>
      {smart.isPending ? (
        <div className="ui-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {smart.isError ? (
        <p>
          {messages.sidebarError}{' '}
          <button
            type="button"
            onClick={() => {
              void smart.refetch();
            }}
          >
            {messages.retry}
          </button>
        </p>
      ) : null}
      <nav>
        <p className="nav-section">{messages.smartListsTitle}</p>
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
                  void api
                    .patchTask(id, { due_date: due, is_all_day: true, time_zone: zone })
                    .then(() => {
                      void refreshTaskSurfaces(queryClient);
                    });
                }}
              >
                <SideLink to={smartPath(item.key)} onNavigate={onNavigate}>
                  <SmartIcon name={item.key} />
                  <span className="nav-label">{smartLabel(messages, item.key)}</span>
                  {showCounters ? <Badge value={item.task_count} /> : null}
                </SideLink>
              </li>
            ))}
        </ul>
        <SectionHead title={messages.filtersTitle}>
          <Link
            className="nav-add"
            to="/filters"
            aria-label={messages.newFilter}
            onClick={onNavigate}
          >
            <Plus size={16} aria-hidden="true" />
          </Link>
        </SectionHead>
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
                {showCounters ? <Badge value={filter.task_count} /> : null}
              </SideLink>
            </li>
          ))}
        </ul>
        <SectionHead title={messages.listsTitle}>
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
        </SectionHead>
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
                  project.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
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
                  void queryClient.invalidateQueries({ queryKey: ['projects'] });
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
            <button type="submit">{messages.createLabel}</button>
            {listError !== null ? <p className="error">{listError}</p> : null}
          </form>
        ) : null}
        {folderItems.map((folder) => {
          const children = (projects.data?.items ?? []).filter(
            (project) => !project.closed && folderId(project) === folder.id,
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
                        style={project.color === null ? undefined : { background: project.color }}
                      />
                      <span className="nav-label">{project.name}</span>
                      {showCounters ? <Badge value={project.active_task_count} /> : null}
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
                void api.moveTask(id, project.id).then(() => {
                  void refreshTaskSurfaces(queryClient);
                });
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
                {showCounters ? <Badge value={project.active_task_count} /> : null}
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
                    void queryClient.invalidateQueries({ queryKey: ['projects'] });
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
        <SectionHead title={messages.tagsTitle}>
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
        </SectionHead>
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
                  void queryClient.invalidateQueries({ queryKey: ['tags'] });
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
            <button type="submit">{messages.createLabel}</button>
            {tagError !== null ? <p className="error">{tagError}</p> : null}
          </form>
        ) : null}
        <input
          className="nav-create"
          value={tagQuery}
          aria-label={messages.tagSearch}
          placeholder={messages.tagSearch}
          onChange={(event) => {
            setTagQuery(event.target.value);
          }}
        />
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
        <ul className="nav-list">
          {visibleTags.map((tag) => {
            const href = `/tag/${tag.id}`;
            const current = `${location.pathname}${location.search}` === href;
            return (
              <li key={tag.id} className="nav-row">
                <Link
                  aria-current={current ? 'page' : undefined}
                  className={current ? 'nav-link is-active is-section' : 'nav-link is-section'}
                  data-selected={current ? 'true' : undefined}
                  to={href}
                  onClick={onNavigate}
                >
                  <span className="nav-label">{tag.name}</span>
                  {showCounters ? <Badge value={tag.active_task_count} /> : null}
                </Link>
                <button
                  type="button"
                  className="nav-more-btn"
                  aria-label={messages.tagRename}
                  aria-expanded={tagMenuId === tag.id}
                  onClick={() => {
                    setTagMenuId((current) => (current === tag.id ? null : tag.id));
                  }}
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
                {tagMenuId === tag.id ? (
                  <TagMenu
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
        <button
          type="button"
          className="nav-section nav-more-toggle"
          aria-expanded={moreOpen}
          onClick={() => {
            setMoreOpen((current) => !current);
          }}
        >
          {moreOpen ? messages.hideMore : messages.showMore}
        </button>
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
        {moreOpen ? (
          <ul className="nav-list">
            <Item
              to="/dashboard"
              label={messages.navDashboard}
              onNavigate={onNavigate}
              icon={LayoutDashboard}
            />
            <Item
              to="/reports/weekly"
              label={messages.navReports}
              onNavigate={onNavigate}
              icon={BarChart3}
            />
            <Item
              to="/review/weekly"
              label={messages.navReview}
              onNavigate={onNavigate}
              icon={ClipboardList}
            />
            {flags.countdowns ? (
              <Item
                to="/countdowns"
                label={messages.navCountdowns}
                onNavigate={onNavigate}
                icon={Hourglass}
              />
            ) : null}
          </ul>
        ) : null}
      </nav>
      <div className="sidebar-footer">
        <SideLink to="/tasks/cancelled" onNavigate={onNavigate}>
          <span className="nav-label">{messages.navWont}</span>
        </SideLink>
        {ordered.some((item) => item.key === 'completed' && item.enabled) ? (
          <SideLink to="/smart/completed" onNavigate={onNavigate}>
            <span className="nav-label">{messages.smartCompleted}</span>
          </SideLink>
        ) : null}
        {trashVisible ? (
          <SideLink to="/smart/trash" onNavigate={onNavigate}>
            <span className="nav-label">{messages.smartTrash}</span>
            {showCounters && smart.isPending ? <span className="ui-badge">—</span> : null}
            {showCounters && smart.isSuccess ? <Badge value={trash?.task_count ?? 0} /> : null}
          </SideLink>
        ) : null}
        {confirmTrash && trashVisible ? (
          <div className="nav-confirm">
            <p>{messages.emptyTrashBody}</p>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                void api.emptyTrash().then(() => {
                  setConfirmTrash(false);
                  void queryClient.invalidateQueries({ queryKey: ['smart-lists'] });
                  void queryClient.invalidateQueries({ queryKey: ['smart-list-tasks'] });
                });
              }}
            >
              {messages.confirmEmpty}
            </Button>
          </div>
        ) : null}
        {trashVisible ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={messages.emptyTrash}
            title={messages.emptyTrash}
            disabled={!smart.isSuccess || (trash?.task_count ?? 0) === 0}
            onClick={() => {
              setConfirmTrash(true);
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          aria-label={`${messages.themeLabel}: ${themeLabel}`}
          title={`${messages.themeLabel}: ${themeLabel}`}
          onClick={() => {
            setPreference(nextTheme(preference));
          }}
        >
          <ThemeIcon preference={preference} />
        </button>
        <button
          type="button"
          className="icon-btn collapse-button"
          aria-keyshortcuts="["
          aria-expanded={!collapsed}
          aria-label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
          title={collapsed ? messages.expandSidebar : messages.collapseSidebar}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}

function Item({
  to,
  label,
  onNavigate,
  icon: Icon,
}: {
  readonly to: string;
  readonly label: string;
  readonly onNavigate: () => void;
  readonly icon?: LucideIcon | undefined;
}) {
  return (
    <li>
      <SideLink to={to} section onNavigate={onNavigate}>
        {Icon !== undefined ? <Icon size={20} aria-hidden="true" /> : null}
        <span className="nav-label">{label}</span>
      </SideLink>
    </li>
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

function ThemeIcon({ preference }: { readonly preference: ThemePreference }) {
  if (preference === 'light') {
    return <Sun size={16} aria-hidden="true" />;
  }
  if (preference === 'dark') {
    return <Moon size={16} aria-hidden="true" />;
  }
  return <Monitor size={16} aria-hidden="true" />;
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

function SectionHead({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="nav-section-row">
      <p className="nav-section">{title}</p>
      {children}
    </div>
  );
}

function TagMenu({
  tag,
  tags,
  messages,
  onClose,
}: {
  readonly tag: { id: string; name: string; color: string | null };
  readonly tags: readonly { id: string; name: string }[];
  readonly messages: Messages;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tag.name);
  const [confirm, setConfirm] = useState(false);
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['tags'] });
    onClose();
  };
  return (
    <div className="list-menu" role="menu">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = normalizeTagName(name);
          if (next === null) {
            return;
          }
          void api.updateTag(tag.id, { name: next }).then(refresh);
        }}
      >
        <input
          value={name}
          aria-label={messages.tagRename}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <button type="submit" className="menu-item">
          {messages.tagRename}
        </button>
      </form>
      <input
        type="color"
        aria-label={messages.tagRename}
        defaultValue={tag.color ?? '#4772fa'}
        onChange={(event) => {
          void api.updateTag(tag.id, { color: event.target.value }).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['tags'] });
          });
        }}
      />
      <label>
        {messages.tagMerge}
        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value.length > 0) {
              void api.mergeTags(tag.id, event.target.value).then(refresh);
            }
          }}
        >
          <option value="">{messages.tagMerge}</option>
          {tags
            .filter((item) => item.id !== tag.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        className="menu-item is-danger"
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          void api.deleteTag(tag.id).then(refresh);
        }}
      >
        {confirm ? messages.tagDeleteBody : messages.batchDelete}
      </button>
    </div>
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
          void api.updateProject(project.id, { name: next }).then(() => {
            onChanged();
            onClose();
          });
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
              void api.updateProject(project.id, { color }).then(() => {
                onChanged();
                onClose();
              });
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
              void api.archiveProject(project.id, crypto.randomUUID()).then(() => {
                onChanged();
                onClose();
              });
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
                  void api.deleteProject(project.id).then(() => {
                    onChanged();
                    onClose();
                  });
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

function themeName(messages: Messages, preference: ThemePreference): string {
  switch (preference) {
    case 'light':
      return messages.themeLight;
    case 'dark':
      return messages.themeDark;
    case 'auto':
      return messages.themeAuto;
  }
}
