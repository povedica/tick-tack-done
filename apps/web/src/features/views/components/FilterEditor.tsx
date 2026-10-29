import { ApiError, type Filter } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Funnel, Layers, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../../api';
import { Select } from '../../../components/Select';
import { TagPicker, type TagOption } from '../../../components/TagPicker';
import { Button, Modal } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { rowsFromView } from '../../tasks/model';
import { LIST_COLORS } from '../../../shell/ListModal';
import { viewsApi } from '../api';
import {
  blankDraft,
  completeCount,
  draftFromSaved,
  emptyCondition,
  emptyGroup,
  groupsToDrop,
  incompleteIds,
  rulesFromDraft,
  saveIssue,
  simplifyDraft,
  type ConditionDraft,
  type ConditionField,
  type FilterDraft,
  type GroupDraft,
} from '../draft';
import type { FilterEditorRequest } from '../filter-ui';
import { refreshFilters } from '../filter-commands';
import { filterTagLabels } from '../summarize';

const FIELDS: readonly ConditionField[] = [
  'keyword',
  'list',
  'tag',
  'date',
  'priority',
  'status',
  'assignee',
];

export function FilterEditor({
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
  return <EditorForm key={key} request={request} existing={existing} onClose={onClose} />;
}

function EditorForm({
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
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.listTags({ limit: 100 }) });
  const initial =
    existing === undefined
      ? blankDraft(request.kind === 'create' ? request.preset : undefined)
      : draftFromSaved({
          name: existing.name,
          color: existing.color,
          mode: existing.mode,
          rules: existing.rules,
        });
  const [draft, setDraft] = useState<FilterDraft>(initial);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'discard' | 'simplify' | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    count: number;
    rows: ReturnType<typeof rowsFromView>;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [live, setLive] = useState('');
  const origin = useRef(fingerprint(initial));
  const hintId = useId();
  const labels = filterTagLabels(
    existing !== undefined && 'tag_labels' in existing ? existing.tag_labels : undefined,
  );
  const issue = saveIssue(draft);
  const missing = new Set(tried ? incompleteIds(draft) : []);
  const openLists = (projects.data?.items ?? []).filter((project) => !project.closed);
  const tagOptions: TagOption[] = (tags.data?.items ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
  }));

  useEffect(() => {
    const closeRef: { current: () => undefined } = { current: () => undefined };
    closeRef.current = () => {
      if (fingerprint(draft) !== origin.current) {
        setConfirm('discard');
        return;
      }
      onClose();
    };
    const selector =
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]';
    function onKey(event: KeyboardEvent): void {
      const dialog = document.querySelector('.filter-editor');
      if (!(dialog instanceof HTMLElement)) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
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
    };
  }, [draft, onClose]);

  useEffect(() => {
    if (focusId === null) {
      return;
    }
    document.getElementById(`filter-field-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId]);

  const built = rulesFromDraft(draft);
  const builtRef = useRef(built);
  builtRef.current = built;
  const previewKey = JSON.stringify(built);
  const ready = completeCount(draft) > 0;
  useEffect(() => {
    if (!ready) {
      setPreview(null);
      setPreviewing(false);
      setLive(messages.filterPreviewNeed);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      void api
        .previewFilter(builtRef.current, { limit: 5 }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) {
            return;
          }
          const rows = rowsFromView(page).slice(0, 4);
          const count = typeof page.count === 'number' ? page.count : rows.length;
          setPreview({ count, rows });
          setPreviewing(false);
          setLive(countLabel(messages, count));
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted || isAbort(caught)) {
            return;
          }
          setPreviewing(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [previewKey, ready, messages]);

  const save = useMutation({
    mutationFn: () => {
      const next = rulesFromDraft(draft);
      const body = {
        name: draft.name.trim(),
        color: draft.color,
        mode: next.mode,
        rules: next.rules,
      };
      if (request.kind === 'edit') {
        return viewsApi.updateFilter(request.id, body);
      }
      return viewsApi.createFilter(body, crypto.randomUUID());
    },
    onSuccess: async (saved) => {
      setError(null);
      await Promise.all([
        refreshFilters(queryClient, saved.id),
        queryClient.invalidateQueries({ queryKey: ['filter-tasks', saved.id] }),
      ]);
      onClose();
      if (request.kind === 'create') {
        void Promise.resolve(navigate(`/filter/${saved.id}`)).catch(() => undefined);
      }
    },
    onError: (caught: unknown) => {
      setError(saveError(caught, messages));
    },
  });

  function requestClose(): void {
    if (fingerprint(draft) !== origin.current) {
      setConfirm('discard');
      return;
    }
    onClose();
  }

  function submit(): void {
    if (issue !== null) {
      return;
    }
    if (incompleteIds(draft).length > 0) {
      setTried(true);
      return;
    }
    save.mutate();
  }

  function seeAll(): void {
    if (issue !== null || incompleteIds(draft).length > 0) {
      setTried(true);
      return;
    }
    save.mutate(undefined, {
      onSuccess: (saved) => {
        void Promise.resolve(navigate(`/filter/${saved.id}`)).catch(() => undefined);
      },
    });
  }

  function leaveAdvanced(): void {
    if (groupsToDrop(draft) > 0) {
      setConfirm('simplify');
      return;
    }
    setDraft(simplifyDraft(draft));
  }

  const title = request.kind === 'edit' ? messages.filterEdit : messages.newFilter;
  const hint =
    issue === 'name'
      ? messages.filterNameMissing
      : issue === 'empty'
        ? messages.filterConditionMissing
        : null;
  const countText = !ready
    ? messages.filterPreviewNeed
    : previewing || preview === null
      ? '…'
      : countLabel(messages, preview.count);

  return (
    <Modal title={title} className="filter-editor" onClose={requestClose}>
      <div className="filter-editor-head">
        <Funnel size={20} aria-hidden="true" style={{ color: draft.color ?? 'var(--ink-2)' }} />
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button filter-editor-close"
          aria-label={messages.close}
          onClick={requestClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <Button
          type="button"
          variant="primary"
          className="filter-editor-save-header"
          disabled={issue !== null || save.isPending}
          loading={save.isPending}
          aria-describedby={hintId}
          onClick={submit}
        >
          {messages.filterSave}
        </Button>
      </div>
      <div className="filter-editor-body">
        <label className="filter-field">
          {messages.filterName}
          <input
            value={draft.name}
            maxLength={80}
            autoFocus={request.kind === 'create'}
            aria-invalid={issue === 'name' && tried}
            onFocus={centerOnMobile}
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />
        </label>
        <div className="filter-field">
          <span>{messages.listColor}</span>
          <div className="list-colors" role="radiogroup" aria-label={messages.listColor}>
            <button
              type="button"
              role="radio"
              className="list-color is-none"
              aria-checked={draft.color === null}
              aria-label={messages.filterNoColor}
              onClick={() => {
                setDraft({ ...draft, color: null });
              }}
            />
            {LIST_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                className="list-color"
                style={{ '--swatch': swatch } as CSSProperties}
                aria-checked={draft.color?.toLowerCase() === swatch.toLowerCase()}
                aria-label={colorLabel(messages, swatch)}
                onClick={() => {
                  setDraft({ ...draft, color: swatch });
                }}
              />
            ))}
          </div>
        </div>
        {draft.advanced ? (
          <div className="filter-groups">
            {draft.groups.map((group, index) => (
              <section
                key={group.id}
                className="filter-group"
                aria-label={messages.filterGroupLabel.replace('{count}', String(index + 1))}
              >
                {index > 0 ? (
                  <div className="segmented" role="radiogroup" aria-label={messages.filterCombine}>
                    <MatchButton
                      pressed={draft.outer === 'AND'}
                      label={messages.combinatorAnd}
                      onClick={() => {
                        setDraft({ ...draft, outer: 'AND' });
                      }}
                    />
                    <MatchButton
                      pressed={draft.outer === 'OR'}
                      label={messages.combinatorOr}
                      onClick={() => {
                        setDraft({ ...draft, outer: 'OR' });
                      }}
                    />
                  </div>
                ) : null}
                <div
                  className="segmented"
                  role="radiogroup"
                  aria-label={messages.filterMatchPrompt}
                >
                  <MatchButton
                    pressed={group.combinator === 'AND'}
                    label={messages.filterMatchAll}
                    onClick={() => {
                      setDraft(mapGroup(draft, group.id, { ...group, combinator: 'AND' }));
                    }}
                  />
                  <MatchButton
                    pressed={group.combinator === 'OR'}
                    label={messages.filterMatchAny}
                    onClick={() => {
                      setDraft(mapGroup(draft, group.id, { ...group, combinator: 'OR' }));
                    }}
                  />
                </div>
                <ConditionList
                  group={group}
                  messages={messages}
                  lists={openLists}
                  tags={tagOptions}
                  labels={labels}
                  missing={missing}
                  picker={picker}
                  onPicker={setPicker}
                  onChange={(next) => {
                    setDraft(mapGroup(draft, group.id, next));
                  }}
                  onFocusNew={setFocusId}
                />
                {draft.groups.length > 1 ? (
                  <button
                    type="button"
                    className="filter-text-button"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        groups: draft.groups.filter((item) => item.id !== group.id),
                      });
                    }}
                  >
                    {messages.filterRemoveGroup}
                  </button>
                ) : null}
              </section>
            ))}
            <button
              type="button"
              className="filter-text-button"
              onClick={() => {
                setDraft({ ...draft, groups: [...draft.groups, emptyGroup('AND')] });
              }}
            >
              {messages.filterAddGroup}
            </button>
          </div>
        ) : (
          <div className="filter-field">
            <span id="filter-match-label">{messages.filterMatchPrompt}</span>
            <div className="segmented" role="radiogroup" aria-labelledby="filter-match-label">
              <MatchButton
                pressed={draft.match === 'all'}
                label={messages.filterMatchAll}
                onClick={() => {
                  setDraft({ ...draft, match: 'all' });
                }}
              />
              <MatchButton
                pressed={draft.match === 'any'}
                label={messages.filterMatchAny}
                onClick={() => {
                  setDraft({ ...draft, match: 'any' });
                }}
              />
            </div>
            <ConditionList
              group={draft.groups[0] ?? emptyGroup('AND')}
              messages={messages}
              lists={openLists}
              tags={tagOptions}
              labels={labels}
              missing={missing}
              picker={picker}
              onPicker={setPicker}
              onChange={(next) => {
                setDraft({ ...draft, groups: [next, ...draft.groups.slice(1)] });
              }}
              onFocusNew={setFocusId}
            />
          </div>
        )}
        <Preview
          messages={messages}
          text={countText}
          live={live}
          rows={ready ? (preview?.rows ?? []) : []}
          onSeeAll={seeAll}
        />
        {error !== null ? (
          <p className="filter-save-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="filter-editor-foot">
          {draft.advanced ? (
            <button type="button" className="filter-text-button" onClick={leaveAdvanced}>
              <Layers size={16} aria-hidden="true" />
              {messages.filterSimpleLink}
            </button>
          ) : (
            <button
              type="button"
              className="filter-text-button"
              onClick={() => {
                const first = draft.groups[0];
                setDraft({
                  ...draft,
                  advanced: true,
                  groups: draft.groups.map((group, index) =>
                    index === 0
                      ? { ...group, combinator: draft.match === 'any' ? 'OR' : 'AND' }
                      : group,
                  ),
                  ...(first === undefined ? { groups: [emptyGroup('AND')] } : {}),
                });
              }}
            >
              <Layers size={16} aria-hidden="true" />
              {messages.filterAdvancedLink}
            </button>
          )}
          <p id={hintId} className="filter-hint">
            {hint ?? ''}
          </p>
          <div className="actions">
            <Button type="button" onClick={requestClose}>
              {messages.cancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="filter-editor-save"
              disabled={issue !== null || save.isPending}
              loading={save.isPending}
              aria-describedby={hintId}
              onClick={submit}
            >
              {messages.filterSave}
            </Button>
          </div>
        </div>
      </div>
      <p className="filter-editor-bar">
        <span aria-live="polite">{countText}</span>
        <button type="button" className="filter-text-button" onClick={seeAll}>
          {messages.filterPreviewOpen}
        </button>
      </p>
      {confirm === 'discard' ? (
        <Modal
          role="alertdialog"
          title={messages.filterDiscardTitle}
          onClose={() => {
            setConfirm(null);
          }}
        >
          <p>{messages.filterDiscardBody}</p>
          <div className="actions">
            <Button
              autoFocus
              onClick={() => {
                setConfirm(null);
              }}
            >
              {messages.filterKeepEditing}
            </Button>
            <Button variant="danger" onClick={onClose}>
              {messages.filterDiscardConfirm}
            </Button>
          </div>
        </Modal>
      ) : null}
      {confirm === 'simplify' ? (
        <Modal
          role="alertdialog"
          title={messages.filterDropGroups.replace('{count}', String(groupsToDrop(draft)))}
          onClose={() => {
            setConfirm(null);
          }}
        >
          <div className="actions">
            <Button
              autoFocus
              onClick={() => {
                setConfirm(null);
              }}
            >
              {messages.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDraft(simplifyDraft(draft));
                setConfirm(null);
              }}
            >
              {messages.filterSimpleLink}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}

function ConditionList({
  group,
  messages,
  lists,
  tags,
  labels,
  missing,
  picker,
  onPicker,
  onChange,
  onFocusNew,
}: {
  readonly group: GroupDraft;
  readonly messages: Messages;
  readonly lists: readonly { id: string; name: string }[];
  readonly tags: readonly TagOption[];
  readonly labels: ReturnType<typeof filterTagLabels>;
  readonly missing: ReadonlySet<string>;
  readonly picker: string | null;
  readonly onPicker: (id: string | null) => void;
  readonly onChange: (group: GroupDraft) => void;
  readonly onFocusNew: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={messages.filterConditionsGroup} className="filter-conditions">
      {group.conditions.map((condition) => (
        <ConditionRow
          key={condition.id}
          condition={condition}
          messages={messages}
          lists={lists}
          tags={tags}
          labels={labels}
          invalid={missing.has(condition.id)}
          pickerOpen={picker === condition.id}
          onPicker={(open) => {
            onPicker(open ? condition.id : null);
          }}
          onChange={(next) => {
            onChange({
              ...group,
              conditions: group.conditions.map((item) => (item.id === condition.id ? next : item)),
            });
          }}
          onRemove={() => {
            onChange({
              ...group,
              conditions: group.conditions.filter((item) => item.id !== condition.id),
            });
          }}
        />
      ))}
      <button
        type="button"
        className="filter-text-button"
        onClick={() => {
          const next = emptyCondition();
          onChange({ ...group, conditions: [...group.conditions, next] });
          onFocusNew(next.id);
        }}
      >
        + {messages.filterAddCondition}
      </button>
    </div>
  );
}

function ConditionRow({
  condition,
  messages,
  lists,
  tags,
  labels,
  invalid,
  pickerOpen,
  onPicker,
  onChange,
  onRemove,
}: {
  readonly condition: ConditionDraft;
  readonly messages: Messages;
  readonly lists: readonly { id: string; name: string }[];
  readonly tags: readonly TagOption[];
  readonly labels: ReturnType<typeof filterTagLabels>;
  readonly invalid: boolean;
  readonly pickerOpen: boolean;
  readonly onPicker: (open: boolean) => void;
  readonly onChange: (next: ConditionDraft) => void;
  readonly onRemove: () => void;
}) {
  const fieldLabel = fieldName(messages, condition.field);
  return (
    <div className={invalid ? 'filter-condition is-invalid' : 'filter-condition'}>
      <div className="filter-condition-line">
        <Select
          id={`filter-field-${condition.id}`}
          aria-label={messages.filterField}
          value={condition.field}
          onFocus={centerOnMobile}
          onChange={(event) => {
            const field = isField(event.target.value) ? event.target.value : 'keyword';
            onChange({ ...emptyCondition(field), id: condition.id });
          }}
        >
          {FIELDS.map((field) => (
            <option key={field} value={field}>
              {fieldName(messages, field)}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className="icon-button filter-remove"
          aria-label={fill(messages.filterRemoveCondition, fieldLabel)}
          onClick={onRemove}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ValueField
        condition={condition}
        messages={messages}
        lists={lists}
        tags={tags}
        labels={labels}
        pickerOpen={pickerOpen}
        onPicker={onPicker}
        onChange={onChange}
      />
      {invalid ? <p className="filter-row-error">{messages.filterIncompleteRow}</p> : null}
    </div>
  );
}

function ValueField({
  condition,
  messages,
  lists,
  tags,
  labels,
  pickerOpen,
  onPicker,
  onChange,
}: {
  readonly condition: ConditionDraft;
  readonly messages: Messages;
  readonly lists: readonly { id: string; name: string }[];
  readonly tags: readonly TagOption[];
  readonly labels: ReturnType<typeof filterTagLabels>;
  readonly pickerOpen: boolean;
  readonly onPicker: (open: boolean) => void;
  readonly onChange: (next: ConditionDraft) => void;
}) {
  const valueLabel = fill(messages.filterValueOf, fieldName(messages, condition.field));
  if (condition.field === 'keyword' || condition.field === 'assignee') {
    return (
      <input
        aria-label={valueLabel}
        value={condition.value}
        onFocus={centerOnMobile}
        onChange={(event) => {
          onChange({ ...condition, value: event.target.value });
        }}
      />
    );
  }
  if (condition.field === 'list') {
    return (
      <div className="filter-chips" role="group" aria-label={valueLabel}>
        {lists.map((list) => {
          const on = condition.values.includes(list.id);
          return (
            <button
              key={list.id}
              type="button"
              className={on ? 'filter-chip is-on' : 'filter-chip'}
              aria-pressed={on}
              onClick={() => {
                onChange({
                  ...condition,
                  values: on
                    ? condition.values.filter((id) => id !== list.id)
                    : [...condition.values, list.id],
                });
              }}
            >
              {list.name}
            </button>
          );
        })}
      </div>
    );
  }
  if (condition.field === 'tag') {
    return (
      <div className="filter-chips" role="group" aria-label={valueLabel}>
        {condition.values.map((id) => {
          const known = tags.find((tag) => tag.id === id);
          const label = labels[id];
          const deleted = known === undefined && (label === undefined || label.deleted);
          return (
            <button
              key={id}
              type="button"
              className={deleted ? 'filter-chip is-deleted' : 'filter-chip is-on'}
              onClick={() => {
                onChange({ ...condition, values: condition.values.filter((item) => item !== id) });
              }}
            >
              {deleted
                ? messages.filterDeletedTag
                : (known?.name ?? label?.name ?? messages.filterDeletedTag)}
              <X size={12} aria-hidden="true" />
            </button>
          );
        })}
        <button
          type="button"
          className="filter-text-button"
          onClick={() => {
            onPicker(true);
          }}
        >
          {messages.filterAddTag}
        </button>
        <TagPicker
          open={pickerOpen}
          tags={tags}
          selected={condition.values}
          onClose={() => {
            onPicker(false);
          }}
          onToggle={(id) => {
            const on = condition.values.includes(id);
            onChange({
              ...condition,
              values: on
                ? condition.values.filter((item) => item !== id)
                : [...condition.values, id],
            });
          }}
        />
      </div>
    );
  }
  if (condition.field === 'date') {
    return (
      <div className="filter-date">
        <Select
          aria-label={valueLabel}
          value={condition.op}
          onFocus={centerOnMobile}
          onChange={(event) => {
            onChange({ ...condition, op: event.target.value });
          }}
        >
          <option value="today">{messages.dateToday}</option>
          <option value="tomorrow">{messages.dateTomorrow}</option>
          <option value="next_7_days">{messages.dateNext7}</option>
          <option value="overdue">{messages.dateOverdue}</option>
          <option value="no_date">{messages.dateNoDate}</option>
          <option value="between">{messages.filterDateBetween}</option>
        </Select>
        {condition.op === 'between' ? (
          <>
            <input
              type="date"
              aria-label={messages.filterFrom}
              value={condition.value}
              onFocus={centerOnMobile}
              onChange={(event) => {
                onChange({ ...condition, value: event.target.value });
              }}
            />
            <input
              type="date"
              aria-label={messages.filterTo}
              value={condition.valueTo}
              onFocus={centerOnMobile}
              onChange={(event) => {
                onChange({ ...condition, valueTo: event.target.value });
              }}
            />
          </>
        ) : null}
      </div>
    );
  }
  if (condition.field === 'priority') {
    return (
      <Select
        aria-label={valueLabel}
        value={condition.value}
        onFocus={centerOnMobile}
        onChange={(event) => {
          onChange({ ...condition, value: event.target.value });
        }}
      >
        <option value="high">{messages.filterPriorityHigh}</option>
        <option value="medium">{messages.filterPriorityMedium}</option>
        <option value="low">{messages.filterPriorityLow}</option>
        <option value="none">{messages.filterPriorityAny}</option>
      </Select>
    );
  }
  return (
    <Select
      aria-label={valueLabel}
      value={condition.value}
      onFocus={centerOnMobile}
      onChange={(event) => {
        onChange({ ...condition, value: event.target.value });
      }}
    >
      <option value="active">{messages.statusActive}</option>
      <option value="completed">{messages.statusCompleted}</option>
    </Select>
  );
}

function Preview({
  messages,
  text,
  live,
  rows,
  onSeeAll,
}: {
  readonly messages: Messages;
  readonly text: string;
  readonly live: string;
  readonly rows: ReturnType<typeof rowsFromView>;
  readonly onSeeAll: () => void;
}) {
  return (
    <section className="filter-preview" aria-label={messages.filterPreview}>
      <p>
        {messages.filterPreview} · <strong>{text}</strong>
      </p>
      <p className="filter-live" aria-live="polite">
        {live}
      </p>
      {rows.length > 0 ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <span className={`filter-prio is-${row.priority}`} aria-hidden="true" />
              <span>{row.title}</span>
              <small>{row.projectName}</small>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="filter-text-button" onClick={onSeeAll}>
        {messages.filterSeeAll} ›
      </button>
    </section>
  );
}

function MatchButton({
  pressed,
  label,
  onClick,
}: {
  readonly pressed: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={pressed ? 'is-active' : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function mapGroup(draft: FilterDraft, id: string, next: GroupDraft): FilterDraft {
  return { ...draft, groups: draft.groups.map((group) => (group.id === id ? next : group)) };
}

function fingerprint(draft: FilterDraft): string {
  return JSON.stringify({
    name: draft.name,
    color: draft.color,
    match: draft.match,
    advanced: draft.advanced,
    outer: draft.outer,
    groups: draft.groups.map((group) => ({
      combinator: group.combinator,
      conditions: group.conditions.map((condition) => ({
        field: condition.field,
        op: condition.op,
        value: condition.value,
        valueTo: condition.valueTo,
        values: condition.values,
      })),
    })),
  });
}

function countLabel(messages: Messages, count: number): string {
  return count === 1
    ? messages.filterPreviewOne
    : messages.filterPreviewCount.replace('{count}', String(count));
}

function fieldName(messages: Messages, field: ConditionField): string {
  switch (field) {
    case 'keyword':
      return messages.fieldKeyword;
    case 'list':
      return messages.fieldList;
    case 'tag':
      return messages.fieldTag;
    case 'date':
      return messages.fieldDate;
    case 'priority':
      return messages.fieldPriority;
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

function colorLabel(messages: Messages, swatch: (typeof LIST_COLORS)[number]): string {
  switch (swatch) {
    case '#4772FA':
      return messages.filterColorBlue;
    case '#E13E39':
      return messages.filterColorRed;
    case '#FAA80C':
      return messages.filterColorAmber;
    case '#1F9D55':
      return messages.filterColorGreen;
    case '#7C5CFF':
      return messages.filterColorViolet;
    case '#F06595':
      return messages.filterColorPink;
    default: {
      const unreachable: never = swatch;
      return unreachable;
    }
  }
}

function saveError(error: unknown, messages: Messages): string {
  if (error instanceof ApiError) {
    const reason = reasonOf(error.details);
    if (reason === 'unknown_tag') {
      return messages.filterUnknownTag;
    }
    if (reason === 'empty_filter' || reason === 'empty_group') {
      return messages.filterConditionMissing;
    }
  }
  return messages.filterSaveRetry;
}

function reasonOf(details: unknown): string | null {
  if (typeof details !== 'object' || details === null) {
    return null;
  }
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function centerOnMobile(event: { currentTarget: HTMLElement }): void {
  if (window.matchMedia('(max-width: 1023px)').matches) {
    event.currentTarget.scrollIntoView({ block: 'center' });
  }
}

function isField(value: string): value is ConditionField {
  return (
    value === 'list' ||
    value === 'tag' ||
    value === 'date' ||
    value === 'priority' ||
    value === 'keyword' ||
    value === 'status' ||
    value === 'assignee'
  );
}
