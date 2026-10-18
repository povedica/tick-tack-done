import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeTagName } from '@reflexionia/domain';
import { ApiError } from '@reflexionia/sdk';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Inbox,
  LayoutDashboard,
  ListTodo,
  MoreHorizontal,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
  Sparkles,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router';
import { api } from '../api';
import { BrandMark } from '../components/BrandMark';
import { Badge } from '../components/ui';
import { fill, useMessages, type Messages } from '../i18n';
import { usePreferences } from '../theme/preferences';
import { nextTheme, type ThemePreference } from '../theme/preference';
import { useThemePreference } from '../theme/store';
import { smartPath } from '../features/tasks/model';
import { orderedSmartLists, SIDEBAR_SMART_ORDER } from './smart-order';

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
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
  const showCounters = usePreferences((state) => state.showCounters);
  const queryClient = useQueryClient();
  const smart = useQuery({ queryKey: ['smart-lists'], queryFn: () => api.listSmartLists() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => api.listFilters() });
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.listTags() });
  const [draft, setDraft] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const listField = useRef<HTMLInputElement>(null);
  const tagField = useRef<HTMLInputElement>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const [confirmTrash, setConfirmTrash] = useState(false);
  const themeLabel = themeName(messages, preference);
  const ordered = orderedSmartLists(smart.data?.items ?? []);
  const lists = ordered.filter(
    (item) => item.enabled && (SIDEBAR_SMART_ORDER as readonly string[]).includes(item.key),
  );
  const trash = ordered.find((item) => item.key === 'trash');
  const filterItems = filters.data?.items ?? [];
  const tagItems = tags.data?.items ?? [];
  const projectItems = (projects.data?.items ?? []).filter((project) => !project.closed);

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
          {lists
            .filter((item) => item.enabled && item.key !== 'trash')
            .map((item) => (
              <li key={item.id}>
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
        {filterItems.length === 0 ? <p className="nav-empty">{messages.filtersEmpty}</p> : null}
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
        <ul className="nav-list">
          {projectItems.map((project) => (
            <li key={project.id} className="nav-row">
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
        {tagItems.length === 0 && !addingTag ? (
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
        <ul className="nav-list">
          {tagItems.map((tag) => {
            const href = `/search?q=${encodeURIComponent(`#${tag.name}`)}`;
            const current = `${location.pathname}${location.search}` === href;
            return (
              <li key={tag.id}>
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
        {moreOpen ? (
          <ul className="nav-list">
            <Item
              to="/calendar/month"
              label={messages.navCalendar}
              onNavigate={onNavigate}
              icon={CalendarDays}
            />
            <Item to="/matrix" label={messages.navMatrix} onNavigate={onNavigate} />
            <Item
              to="/dashboard"
              label={messages.navDashboard}
              onNavigate={onNavigate}
              icon={LayoutDashboard}
            />
            <Item to="/reports/weekly" label={messages.navReports} onNavigate={onNavigate} />
            <Item to="/review/weekly" label={messages.navReview} onNavigate={onNavigate} />
            <Item to="/focus" label={messages.navFocus} onNavigate={onNavigate} />
            <Item to="/habits" label={messages.navHabits} onNavigate={onNavigate} icon={Repeat} />
            <Item to="/settings/appearance" label={messages.navSettings} onNavigate={onNavigate} />
          </ul>
        ) : null}
      </nav>
      <div className="sidebar-footer">
        <SideLink to="/smart/trash" onNavigate={onNavigate}>
          <span className="nav-label">{messages.smartTrash}</span>
          {showCounters ? <Badge value={trash?.task_count ?? 0} /> : null}
        </SideLink>
        {confirmTrash ? (
          <div className="nav-confirm">
            <p>{messages.emptyTrashBody}</p>
            <button
              type="button"
              onClick={() => {
                void api.emptyTrash().then(() => {
                  setConfirmTrash(false);
                  void queryClient.invalidateQueries({ queryKey: ['smart-lists'] });
                  void queryClient.invalidateQueries({ queryKey: ['smart-list-tasks'] });
                });
              }}
            >
              {messages.confirmEmpty}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setConfirmTrash(true);
            }}
          >
            {messages.emptyTrash}
          </button>
        )}
        <button
          type="button"
          className="theme-cycle"
          aria-label={`${messages.themeLabel}: ${themeLabel}`}
          onClick={() => {
            setPreference(nextTheme(preference));
          }}
        >
          <span>
            {messages.themeLabel}: {themeLabel}
          </span>
        </button>
        <button
          type="button"
          className="collapse-button"
          aria-keyshortcuts="["
          aria-expanded={!collapsed}
          aria-label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={18} aria-hidden="true" />
          )}
          <span>{collapsed ? messages.expandSidebar : messages.collapseSidebar}</span>
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
