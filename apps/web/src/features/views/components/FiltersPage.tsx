import type { Filter } from '@reflexionia/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CircleCheck,
  Flag,
  Funnel,
  GripVertical,
  List,
  MoreHorizontal,
  Pin,
  Plus,
  Tag,
  Type,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type RefObject,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../../api';
import { runAction } from '../../../components/run-action';
import { useLongPress } from '../../../components/useLongPress';
import { Button, EmptyState, ErrorState, SkeletonRows } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { SidebarFoldButton } from '../../../shell/SidebarFoldButton';
import { viewsApi } from '../api';
import { duplicateFilter, pinFilter } from '../filter-commands';
import { isFilterMenuShortcut } from '../filter-menu-key';
import { filterMove } from '../filter-order';
import { useFilterUi } from '../filter-ui';
import { filterTagLabels, summarizeRules, type ChipIcon, type SummaryText } from '../summarize';
import { FilterMenu } from './FilterMenu';
import '../filters.css';

const ICONS: Record<ChipIcon, LucideIcon> = {
  tag: Tag,
  calendar: Calendar,
  flag: Flag,
  list: List,
  check: CircleCheck,
  user: UserRound,
  type: Type,
};

export function FiltersPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => viewsApi.listFilters() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const openCreate = useFilterUi((state) => state.openCreate);
  const askDelete = useFilterUi((state) => state.askDelete);
  const openEdit = useFilterUi((state) => state.openEdit);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const edit = params.get('edit');
    const creating = params.get('new') === '1';
    if (!creating && (edit === null || edit.length === 0)) {
      return;
    }
    if (creating) {
      openCreate();
    } else if (edit !== null) {
      openEdit(edit);
    }
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('edit');
    setParams(next, { replace: true });
  }, [openCreate, openEdit, params, setParams]);

  if (filters.isPending) {
    return (
      <main className="screen-page filters-page">
        <FiltersHeader
          messages={messages}
          onCreate={() => {
            openCreate();
          }}
        />
        <SkeletonRows />
      </main>
    );
  }

  if (filters.isError) {
    return (
      <main className="screen-page filters-page">
        <FiltersHeader
          messages={messages}
          onCreate={() => {
            openCreate();
          }}
        />
        <ErrorState
          title={messages.filterLoadFailed}
          retryLabel={messages.retry}
          onRetry={() => {
            runAction(filters.refetch());
          }}
        />
      </main>
    );
  }

  const items = filters.data.items;
  const listNames = new Map(
    (projects.data?.items ?? []).map((project) => [project.id, project.name]),
  );
  const text = summaryText(messages);
  const open = items.find((item) => item.id === menu?.id);

  function move(sourceId: string, targetId: string, after: boolean): void {
    const next = filterMove(items, sourceId, targetId, after);
    if (next === null) {
      return;
    }
    runAction(
      api.updateFilter(sourceId, next).then(() => {
        return queryClient.invalidateQueries({ queryKey: ['filters'] });
      }),
    );
  }

  return (
    <main className="screen-page filters-page">
      <FiltersHeader
        messages={messages}
        buttonRef={newRef}
        onCreate={() => {
          openCreate();
        }}
      />
      {items.length === 0 ? (
        <div className="filter-empty">
          <div className="filter-empty-icon">
            <Funnel size={20} aria-hidden="true" />
          </div>
          <EmptyState
            title={messages.filterEmptyTitle}
            body={messages.filterEmptyBody}
            action={
              <Button
                variant="primary"
                onClick={() => {
                  openCreate();
                }}
              >
                {messages.filterCreate}
              </Button>
            }
          />
          <div className="filter-suggest">
            <Button
              size="sm"
              onClick={() => {
                openCreate('high');
              }}
            >
              {messages.filterSuggestHigh}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                openCreate('no_date');
              }}
            >
              {messages.filterSuggestNoDate}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                openCreate('overdue');
              }}
            >
              {messages.filterSuggestOverdue}
            </Button>
          </div>
        </div>
      ) : (
        <ul className="filter-card">
          {items.map((filter) => (
            <FilterRow
              key={filter.id}
              filter={filter}
              messages={messages}
              listNames={listNames}
              text={text}
              menuOpen={menu?.id === filter.id}
              dragging={dragging === filter.id}
              onOpenMenu={(anchor) => {
                anchorRef.current = anchor;
                setMenu({ id: filter.id, anchor });
              }}
              onDragStart={() => {
                setDragging(filter.id);
              }}
              onDragEnd={() => {
                setDragging(null);
              }}
              onDrop={(sourceId, after) => {
                move(sourceId, filter.id, after);
              }}
            />
          ))}
        </ul>
      )}
      {open !== undefined && anchorRef.current !== null ? (
        <FilterMenu
          name={open.name}
          color={open.color}
          pinned={open.pinned}
          summary={chipLine(open, listNames, text)}
          countLabel={countLabel(messages, open.task_count, false)}
          anchor={anchorRef}
          onClose={() => {
            setMenu(null);
          }}
          onEdit={() => {
            setMenu(null);
            openEdit(open.id);
          }}
          onPin={() => {
            setMenu(null);
            pinFilter(queryClient, open, messages.filterPinnedLive, messages.filterUnpinnedLive);
          }}
          onDuplicate={() => {
            setMenu(null);
            duplicateFilter(queryClient, open, messages.filterDuplicated);
          }}
          onDelete={() => {
            setMenu(null);
            askDelete({ id: open.id, name: open.name });
            window.setTimeout(() => {
              const rows = [...document.querySelectorAll<HTMLElement>('[data-filter-id]')];
              const index = rows.findIndex((row) => row.dataset.filterId === open.id);
              const next = rows[index + 1] ?? newRef.current;
              next?.focus();
            }, 0);
          }}
        />
      ) : null}
    </main>
  );
}

function FiltersHeader({
  messages,
  onCreate,
  buttonRef,
}: {
  readonly messages: Messages;
  readonly onCreate: () => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="page-title">
          <SidebarFoldButton />
          <h1>{messages.filtersTitle}</h1>
        </div>
        <p className="lede lede-long">{messages.filtersLede}</p>
        <p className="lede lede-short">{messages.filtersLedeShort}</p>
      </div>
      <Button
        {...(buttonRef === undefined ? {} : { ref: buttonRef })}
        variant="primary"
        aria-label={messages.newFilter}
        onClick={onCreate}
      >
        <Plus size={16} aria-hidden="true" />
        <span className="filter-new-label">{messages.newFilter}</span>
      </Button>
    </header>
  );
}

function FilterRow({
  filter,
  messages,
  listNames,
  text,
  menuOpen,
  dragging,
  onOpenMenu,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  readonly filter: Filter;
  readonly messages: Messages;
  readonly listNames: ReadonlyMap<string, string>;
  readonly text: SummaryText;
  readonly menuOpen: boolean;
  readonly dragging: boolean;
  readonly onOpenMenu: (anchor: HTMLElement) => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
  readonly onDrop: (sourceId: string, after: boolean) => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const press = useLongPress(() => {
    const more = rowRef.current?.querySelector<HTMLElement>('.filter-more');
    if (more != null) {
      onOpenMenu(more);
    }
  });
  const chips = summarizeRules(filter.rules, {
    tagLabels: filterTagLabels(tagLabelsOf(filter)),
    listNames,
    text,
  });
  const shown = chips.slice(0, 3);
  const extra = chips.length - shown.length;
  const tint =
    filter.color === null ? undefined : ({ '--list-tint': filter.color } as CSSProperties);

  return (
    <li
      ref={rowRef}
      className={dragging ? 'filter-row is-dragging' : 'filter-row'}
      data-filter-id={filter.id}
      style={tint}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event: DragEvent<HTMLLIElement>) => {
        const id = event.dataTransfer.getData('text/filter-id');
        if (id.length === 0) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        onDrop(id, event.clientY > rect.top + rect.height / 2);
      }}
      onKeyDown={(event) => {
        if (!isFilterMenuShortcut(event)) {
          return;
        }
        event.preventDefault();
        const more = rowRef.current?.querySelector<HTMLElement>('.filter-more') ?? null;
        if (more !== null) {
          onOpenMenu(more);
        }
      }}
      {...press}
    >
      <button
        type="button"
        className="filter-grip smart-grip"
        draggable
        aria-label={messages.filterPin}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/filter-id', filter.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <Link
        className="filter-link"
        to={`/filter/${filter.id}`}
        onKeyDown={(event) => {
          if (!isFilterMenuShortcut(event)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const more = rowRef.current?.querySelector<HTMLElement>('.filter-more') ?? null;
          if (more !== null) {
            onOpenMenu(more);
          }
        }}
      >
        <Funnel className="filter-funnel" size={18} aria-hidden="true" />
        <span className="filter-copy">
          <span className="filter-name">
            <span>{filter.name}</span>
            {filter.pinned ? (
              <Pin className="filter-pin" size={12} aria-label={messages.filterPinnedMark} />
            ) : null}
          </span>
          {shown.length > 0 ? (
            <span className="filter-chips">
              {shown.map((chip, index) => {
                const Icon = ICONS[chip.icon];
                return (
                  <span key={`${chip.icon}-${String(index)}`} className="filter-chip">
                    <Icon size={12} aria-hidden="true" />
                    <span>{chip.text}</span>
                  </span>
                );
              })}
              {extra > 0 ? (
                <span className="filter-chip">
                  {messages.filterMoreChips.replace('{count}', String(extra))}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="filter-count">
          <span className="filter-count-long">{countLabel(messages, filter.task_count, true)}</span>
          <span className="filter-count-short">{String(filter.task_count)}</span>
        </span>
      </Link>
      <button
        type="button"
        className="filter-more"
        aria-label={fill(messages.filterActions, filter.name)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(event.currentTarget);
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function chipLine(
  filter: Filter,
  listNames: ReadonlyMap<string, string>,
  text: SummaryText,
): string {
  return summarizeRules(filter.rules, {
    tagLabels: filterTagLabels(tagLabelsOf(filter)),
    listNames,
    text,
  })
    .slice(0, 3)
    .map((chip) => chip.text)
    .join(', ');
}

function countLabel(messages: Messages, count: number, long: boolean): string {
  if (!long) {
    return count === 1
      ? messages.filterTaskOne
      : messages.filterTasks.replace('{count}', String(count));
  }
  return count === 1
    ? messages.filterTaskOne
    : messages.filterTasks.replace('{count}', String(count));
}

function summaryText(messages: Messages): SummaryText {
  return {
    today: messages.dateToday,
    tomorrow: messages.dateTomorrow,
    next7: messages.dateNext7,
    overdue: messages.dateOverdue,
    noDate: messages.dateNoDate,
    between: messages.dateBetween,
    priorityHigh: messages.filterPriorityHigh,
    priorityMedium: messages.filterPriorityMedium,
    priorityLow: messages.filterPriorityLow,
    priorityAny: messages.filterPriorityAny,
    statusActive: messages.statusActive,
    statusCompleted: messages.statusCompleted,
    deletedTag: messages.filterDeletedTag,
  };
}

function tagLabelsOf(filter: Filter): unknown {
  return 'tag_labels' in filter ? filter.tag_labels : undefined;
}
