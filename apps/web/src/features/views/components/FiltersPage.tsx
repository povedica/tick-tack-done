import type { ViewPage } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, ErrorState, SkeletonRows } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { viewsApi } from '../api';
import {
  EMPTY_CONDITION,
  rulesWithOuter,
  type ConditionDraft,
  type ConditionField,
  type GroupDraft,
} from '../draft';
import { ListView, priorityText } from './ListView';

const FIELDS: readonly ConditionField[] = [
  'keyword',
  'list',
  'tag',
  'date',
  'priority',
  'status',
  'assignee',
];

export function FiltersPage() {
  const messages = useMessages();
  const queryClient = useQueryClient();
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => viewsApi.listFilters() });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'normal' | 'advanced'>('normal');
  const [outer, setOuter] = useState<'AND' | 'OR'>('AND');
  const [groups, setGroups] = useState<GroupDraft[]>([
    { combinator: 'AND', conditions: [EMPTY_CONDITION] },
  ]);
  const [preview, setPreview] = useState<ViewPage | undefined>(undefined);
  const [groupBy, setGroupBy] = useState<ViewPage['group_by']>('none');
  const [sort, setSort] = useState<ViewPage['sort']>('manual');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const rules = () => rulesWithOuter(mode, outer, groups);

  const previewQuery = useMutation({
    mutationFn: (view: { groupBy: ViewPage['group_by']; sort: ViewPage['sort'] }) =>
      viewsApi.previewFilter({ mode, rules: rules() }, view),
    onSuccess: (page) => {
      setPreview(page);
      setError(null);
    },
    onError: () => {
      setError(messages.previewFailed);
    },
  });

  const create = useMutation({
    mutationFn: () =>
      viewsApi.createFilter({ name: name.trim(), mode, rules: rules() }, crypto.randomUUID()),
    onSuccess: async () => {
      setName('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['filters'] });
    },
    onError: () => {
      setError(messages.filterFailed);
    },
  });

  const pin = useMutation({
    mutationFn: (id: string) => viewsApi.updateFilter(id, { pin: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['filters'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => viewsApi.deleteFilter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['filters'] });
    },
  });

  if (filters.isPending && filters.data === undefined) {
    return (
      <main className="screen-page">
        <h1>{messages.filtersTitle}</h1>
        <SkeletonRows />
      </main>
    );
  }

  if (filters.isError) {
    return (
      <main className="screen-page">
        <h1>{messages.filtersTitle}</h1>
        <ErrorState
          title={fill(messages.loadFailed, messages.filtersTitle)}
          retryLabel={messages.retry}
          onRetry={() => {
            void filters.refetch();
          }}
        />
      </main>
    );
  }

  return (
    <main className="screen-page filters-page">
      <h1>{messages.filtersTitle}</h1>
      <p>{messages.filtersHint}</p>
      {error !== null ? <p className="error">{error}</p> : null}
      <ul className="task-list">
        {(filters.data?.items ?? []).map((filter) => (
          <li key={filter.id}>
            <Link to={`/filters/${filter.id}`}>{filter.name}</Link>
            <span>{messages.filterCount.replace('{count}', String(filter.task_count))}</span>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                pin.mutate(filter.id);
              }}
            >
              {messages.filterPin}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={confirmDelete === filter.id ? 'danger' : 'secondary'}
              onClick={() => {
                if (confirmDelete !== filter.id) {
                  setConfirmDelete(filter.id);
                  return;
                }
                remove.mutate(filter.id);
                setConfirmDelete(null);
              }}
            >
              {confirmDelete === filter.id ? messages.filterDeleteBody : messages.filterDelete}
            </Button>
          </li>
        ))}
      </ul>
      {(filters.data?.items.length ?? 0) === 0 && filters.isSuccess ? (
        <p>{messages.filterEmpty}</p>
      ) : null}
      <form
        className="habit-form filters-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label>
          {messages.filterName}
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label>
          {messages.filterMode}
          <select
            className="ui-select"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value === 'advanced' ? 'advanced' : 'normal');
            }}
          >
            <option value="normal">{messages.modeNormal}</option>
            <option value="advanced">{messages.modeAdvanced}</option>
          </select>
        </label>
        {mode === 'advanced' ? (
          <label>
            {messages.filterCombine}
            <select
              className="ui-select"
              value={outer}
              onChange={(event) => {
                setOuter(event.target.value === 'OR' ? 'OR' : 'AND');
              }}
            >
              <option value="AND">{messages.combinatorAnd}</option>
              <option value="OR">{messages.combinatorOr}</option>
            </select>
          </label>
        ) : null}
        {groups.map((group, groupIndex) => (
          <fieldset key={groupIndex}>
            {mode === 'advanced' ? (
              <label>
                {messages.filterCombine}
                <select
                  className="ui-select"
                  value={group.combinator}
                  onChange={(event) => {
                    setGroups(
                      updateGroup(groups, groupIndex, {
                        ...group,
                        combinator: event.target.value === 'OR' ? 'OR' : 'AND',
                      }),
                    );
                  }}
                >
                  <option value="AND">{messages.combinatorAnd}</option>
                  <option value="OR">{messages.combinatorOr}</option>
                </select>
              </label>
            ) : null}
            {group.conditions.map((condition, conditionIndex) => (
              <ConditionEditor
                key={conditionIndex}
                messages={messages}
                condition={condition}
                projects={projects.data?.items ?? []}
                onChange={(next) => {
                  const conditions = group.conditions.map((item, index) =>
                    index === conditionIndex ? next : item,
                  );
                  setGroups(updateGroup(groups, groupIndex, { ...group, conditions }));
                }}
              />
            ))}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setGroups(
                  updateGroup(groups, groupIndex, {
                    ...group,
                    conditions: [...group.conditions, EMPTY_CONDITION],
                  }),
                );
              }}
            >
              {messages.filterAddCondition}
            </Button>
          </fieldset>
        ))}
        {mode === 'advanced' ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setGroups([...groups, { combinator: 'AND', conditions: [EMPTY_CONDITION] }]);
            }}
          >
            {messages.filterAddGroup}
          </Button>
        ) : null}
        <div className="actions">
          <Button
            type="button"
            onClick={() => {
              previewQuery.mutate({ groupBy, sort });
            }}
          >
            {messages.filterPreview}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={name.trim().length === 0 || create.isPending}
            loading={create.isPending}
          >
            {create.isPending ? messages.filterSaving : messages.filterSave}
          </Button>
        </div>
      </form>
      <ListView
        messages={messages}
        page={preview}
        groupBy={groupBy}
        sort={sort}
        onView={(nextGroup, nextSort) => {
          setGroupBy(nextGroup);
          setSort(nextSort);
          if (preview !== undefined) {
            previewQuery.mutate({ groupBy: nextGroup, sort: nextSort });
          }
        }}
      />
    </main>
  );
}

function ConditionEditor({
  messages,
  condition,
  projects,
  onChange,
}: {
  readonly messages: Messages;
  readonly condition: ConditionDraft;
  readonly projects: readonly { id: string; name: string }[];
  readonly onChange: (next: ConditionDraft) => void;
}) {
  return (
    <div className="condition">
      <label>
        {messages.filterField}
        <select
          className="ui-select"
          value={condition.field}
          onChange={(event) => {
            const field = asField(event.target.value);
            onChange({
              ...condition,
              field,
              op: defaultOp(field),
              value: field === 'status' ? 'active' : field === 'priority' ? 'medium' : '',
              valueTo: '',
            });
          }}
        >
          {FIELDS.map((field) => (
            <option key={field} value={field}>
              {fieldText(messages, field)}
            </option>
          ))}
        </select>
      </label>
      {condition.field === 'keyword' ||
      condition.field === 'tag' ||
      condition.field === 'assignee' ? (
        <input
          value={condition.value}
          onChange={(event) => {
            onChange({ ...condition, value: event.target.value });
          }}
        />
      ) : null}
      {condition.field === 'list' ? (
        <select
          className="ui-select"
          value={condition.value}
          onChange={(event) => {
            onChange({ ...condition, value: event.target.value });
          }}
        >
          <option value="">{messages.fieldList}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      ) : null}
      {condition.field === 'date' ? (
        <select
          className="ui-select"
          value={condition.op}
          onChange={(event) => {
            onChange({ ...condition, op: event.target.value });
          }}
        >
          <option value="today">{messages.dateToday}</option>
          <option value="tomorrow">{messages.dateTomorrow}</option>
          <option value="next_7_days">{messages.dateNext7}</option>
          <option value="overdue">{messages.dateOverdue}</option>
          <option value="no_date">{messages.dateNoDate}</option>
          <option value="between">{messages.dateBetween}</option>
        </select>
      ) : null}
      {condition.field === 'date' && condition.op === 'between' ? (
        <>
          <input
            type="date"
            value={condition.value}
            onChange={(event) => {
              onChange({ ...condition, value: event.target.value });
            }}
          />
          <input
            type="date"
            value={condition.valueTo}
            onChange={(event) => {
              onChange({ ...condition, valueTo: event.target.value });
            }}
          />
        </>
      ) : null}
      {condition.field === 'priority' ? (
        <select
          className="ui-select"
          value={condition.value}
          onChange={(event) => {
            onChange({ ...condition, value: event.target.value });
          }}
        >
          {(['none', 'low', 'medium', 'high'] as const).map((priority) => (
            <option key={priority} value={priority}>
              {priorityText(messages, priority)}
            </option>
          ))}
        </select>
      ) : null}
      {condition.field === 'status' ? (
        <select
          className="ui-select"
          value={condition.value}
          onChange={(event) => {
            onChange({ ...condition, value: event.target.value });
          }}
        >
          <option value="active">{messages.statusActive}</option>
          <option value="completed">{messages.statusCompleted}</option>
        </select>
      ) : null}
    </div>
  );
}

function updateGroup(groups: readonly GroupDraft[], index: number, next: GroupDraft): GroupDraft[] {
  return groups.map((group, groupIndex) => (groupIndex === index ? next : group));
}

function asField(value: string): ConditionField {
  return FIELDS.find((field) => field === value) ?? 'keyword';
}

function defaultOp(field: ConditionField): string {
  switch (field) {
    case 'list':
      return 'in';
    case 'tag':
      return 'any_of';
    case 'date':
      return 'today';
    case 'priority':
      return 'gte';
    case 'keyword':
      return 'contains';
    case 'status':
      return 'eq';
    case 'assignee':
      return 'eq';
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

function fieldText(messages: Messages, field: ConditionField): string {
  switch (field) {
    case 'list':
      return messages.fieldList;
    case 'tag':
      return messages.fieldTag;
    case 'date':
      return messages.fieldDate;
    case 'priority':
      return messages.fieldPriority;
    case 'keyword':
      return messages.fieldKeyword;
    case 'status':
      return messages.fieldStatus;
    case 'assignee':
      return messages.fieldAssignee;
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}
