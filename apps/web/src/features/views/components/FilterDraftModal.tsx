import type { Filter, FilterRules } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Modal } from '../../../components/ui';
import { useMessages, type Messages } from '../../../i18n';
import { viewsApi } from '../api';
import {
  EMPTY_CONDITION,
  rulesWithOuter,
  type ConditionDraft,
  type ConditionField,
  type GroupDraft,
} from '../draft';
import type { FilterEditorRequest, FilterPreset } from '../filter-ui';
import { refreshFilters } from '../filter-commands';

const FIELDS: readonly ConditionField[] = [
  'keyword',
  'list',
  'tag',
  'date',
  'priority',
  'status',
  'assignee',
];

/** Provisional editor until the redesigned one replaces it. It stays in a modal. */
export function FilterDraftModal({
  request,
  onClose,
}: {
  readonly request: FilterEditorRequest;
  readonly onClose: () => void;
}) {
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => viewsApi.listFilters() });
  const existing =
    request.kind === 'edit'
      ? filters.data?.items.find((item) => item.id === request.id)
      : undefined;
  if (request.kind === 'edit' && existing === undefined) {
    return null;
  }
  const key = request.kind === 'edit' ? request.id : (request.preset ?? 'new');
  return <DraftForm key={key} request={request} existing={existing} onClose={onClose} />;
}

function DraftForm({
  request,
  existing,
  onClose,
}: {
  readonly request: FilterEditorRequest;
  readonly existing: Filter | undefined;
  readonly onClose: () => void;
}) {
  const messages = useMessages();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => viewsApi.listProjects() });
  const initial =
    existing === undefined
      ? blankDraft(request.kind === 'create' ? request.preset : undefined)
      : draftFromFilter(existing);
  const [name, setName] = useState(initial.name);
  const [mode, setMode] = useState<'normal' | 'advanced'>(initial.mode);
  const [outer, setOuter] = useState<'AND' | 'OR'>(initial.outer);
  const [groups, setGroups] = useState<GroupDraft[]>(initial.groups);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const rules = rulesWithOuter(mode, outer, groups);
      if (request.kind === 'edit') {
        return viewsApi.updateFilter(request.id, { name: name.trim(), mode, rules });
      }
      return viewsApi.createFilter({ name: name.trim(), mode, rules }, crypto.randomUUID());
    },
    onSuccess: async (saved) => {
      setError(null);
      await refreshFilters(queryClient, saved.id);
      onClose();
      if (request.kind === 'create') {
        void Promise.resolve(navigate(`/filter/${saved.id}`)).catch(() => undefined);
      }
    },
    onError: () => {
      setError(messages.filterFailed);
    },
  });

  return (
    <Modal
      title={request.kind === 'edit' ? messages.filterEdit : messages.newFilter}
      onClose={onClose}
    >
      {error !== null ? <p className="error">{error}</p> : null}
      <form
        className="habit-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          {messages.filterName}
          <input
            value={name}
            autoFocus={request.kind === 'create'}
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
          </fieldset>
        ))}
        <div className="actions">
          <Button type="button" onClick={onClose}>
            {messages.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={name.trim().length === 0 || save.isPending}
            loading={save.isPending}
          >
            {save.isPending ? messages.filterSaving : messages.filterSave}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function blankDraft(preset: FilterPreset | undefined): {
  name: string;
  mode: 'normal';
  outer: 'AND';
  groups: GroupDraft[];
} {
  const condition: ConditionDraft =
    preset === 'high'
      ? { field: 'priority', op: 'gte', value: 'high', valueTo: '' }
      : preset === 'no_date'
        ? { field: 'date', op: 'no_date', value: '', valueTo: '' }
        : preset === 'overdue'
          ? { field: 'date', op: 'overdue', value: '', valueTo: '' }
          : EMPTY_CONDITION;
  return {
    name: '',
    mode: 'normal',
    outer: 'AND',
    groups: [{ combinator: 'AND', conditions: [condition] }],
  };
}

function draftFromFilter(filter: Filter): {
  name: string;
  mode: 'normal' | 'advanced';
  outer: 'AND' | 'OR';
  groups: GroupDraft[];
} {
  const groups = filter.rules.groups.map((group) => ({
    combinator: group.combinator,
    conditions:
      group.conditions.length === 0
        ? [EMPTY_CONDITION]
        : group.conditions.map((condition) => conditionToDraft(condition)),
  }));
  return {
    name: filter.name,
    mode: filter.mode,
    outer: filter.rules.combinator,
    groups: groups.length === 0 ? [{ combinator: 'AND', conditions: [EMPTY_CONDITION] }] : groups,
  };
}

function conditionToDraft(
  condition: FilterRules['groups'][number]['conditions'][number],
): ConditionDraft {
  const values = Array.isArray(condition.value)
    ? condition.value
    : typeof condition.value === 'string'
      ? [condition.value]
      : [];
  const first = values[0] ?? '';
  switch (condition.field) {
    case 'list':
      return { field: 'list', op: 'in', value: first, valueTo: '' };
    case 'tag':
      return { field: 'tag', op: 'any_of', value: first, valueTo: '' };
    case 'date':
      return condition.op === 'between'
        ? { field: 'date', op: 'between', value: first, valueTo: values[1] ?? '' }
        : { field: 'date', op: condition.op, value: '', valueTo: '' };
    case 'priority':
      return { field: 'priority', op: 'gte', value: first, valueTo: '' };
    case 'keyword':
      return { field: 'keyword', op: 'contains', value: first, valueTo: '' };
    case 'status':
      return { field: 'status', op: 'eq', value: first, valueTo: '' };
    case 'assignee':
      return { field: 'assignee', op: 'eq', value: first, valueTo: '' };
    default:
      return EMPTY_CONDITION;
  }
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
      {condition.field === 'priority' ? (
        <select
          className="ui-select"
          value={condition.value}
          onChange={(event) => {
            onChange({ ...condition, value: event.target.value });
          }}
        >
          <option value="high">{messages.filterPriorityHigh}</option>
          <option value="medium">{messages.filterPriorityMedium}</option>
          <option value="low">{messages.filterPriorityLow}</option>
          <option value="none">{messages.filterPriorityAny}</option>
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
