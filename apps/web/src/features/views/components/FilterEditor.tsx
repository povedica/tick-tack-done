import { ApiError, type Filter } from '@reflexionia/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronRight,
  CircleCheck,
  Eye,
  Flag,
  Folder,
  Funnel,
  Layers,
  List,
  Plus,
  Tag,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../../api';
import { DatePopover, type DateDraft } from '../../../components/DatePopover';
import { Segmented } from '../../../components/Segmented';
import { Button, Modal } from '../../../components/ui';
import { fill, useMessages, type Messages } from '../../../i18n';
import { LIST_COLORS } from '../../../shell/ListModal';
import { calendarDay, zonedWallTime } from '../../today/groups';
import { rowsFromView } from '../../tasks/model';
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
import { refreshFilters } from '../filter-commands';
import type { FilterEditorRequest } from '../filter-ui';
import { filterFolderLabels, filterTagLabels } from '../summarize';
import { FieldPicker, type FieldOption } from './FieldPicker';
import { MultiPicker, type PickerChoice } from './MultiPicker';

const DATE_OPS = ['today', 'tomorrow', 'next_7_days', 'overdue', 'no_date', 'between'] as const;

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
  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.listFolders() });
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
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'discard' | 'simplify' | null>(null);
  const [openField, setOpenField] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    count: number;
    rows: ReturnType<typeof rowsFromView>;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewOn, setPreviewOn] = useState(true);
  const [live, setLive] = useState('');
  const origin = useRef(fingerprint(initial));
  const hintId = useId();
  const tagLabels = filterTagLabels(
    existing !== undefined && 'tag_labels' in existing ? existing.tag_labels : undefined,
  );
  const folderLabels = filterFolderLabels(
    existing !== undefined && 'folder_labels' in existing ? existing.folder_labels : undefined,
  );
  const issue = saveIssue(draft);
  const missing = incompleteIds(draft);
  const openLists = ((projects.data?.items ?? []) as ListRow[]).filter(
    (project) => !project.closed,
  );
  const folderRows = (folders.data?.items ?? []) as FolderRow[];
  const tagRows = (tags.data?.items ?? []) as TagRow[];

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
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
    function onKey(event: KeyboardEvent): void {
      if (event.defaultPrevented) {
        return;
      }
      const dialog = document.querySelector('.filter-editor');
      if (!(dialog instanceof HTMLElement) || !dialog.contains(document.activeElement)) {
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
      const controls = [...dialog.querySelectorAll<HTMLElement>(selector)].filter(
        (item) => item.getClientRects().length > 0,
      );
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
    const node =
      focusId === 'add'
        ? document.querySelector<HTMLElement>('.filter-add-condition')
        : document.getElementById(`filter-field-${focusId}`);
    node?.focus();
    setFocusId(null);
  }, [focusId]);

  useEffect(() => {
    if (request.kind !== 'edit' || request.focus === undefined) {
      return;
    }
    const node =
      request.focus === 'name'
        ? document.getElementById('filter-name')
        : document.querySelector<HTMLElement>('.filter-field-trigger');
    node?.focus();
    if (typeof node?.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' });
    }
  }, [request]);

  const built = rulesFromDraft(draft);
  const builtRef = useRef(built);
  builtRef.current = built;
  const previewKey = JSON.stringify(built);
  const ready = completeCount(draft) > 0;
  useEffect(() => {
    if (!previewOn) {
      setPreview(null);
      setPreviewing(false);
      setLive('');
      return;
    }
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
  }, [previewKey, previewOn, ready, messages]);

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
    setTried(true);
    if (issue !== null || incompleteIds(draft).length > 0) {
      return;
    }
    save.mutate();
  }

  function seeAll(): void {
    setTried(true);
    if (issue !== null || incompleteIds(draft).length > 0) {
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

  function enterAdvanced(): void {
    const first = draft.groups[0];
    setDraft({
      ...draft,
      advanced: true,
      groups:
        first === undefined
          ? [emptyGroup('AND')]
          : draft.groups.map((group, index) =>
              index === 0 ? { ...group, combinator: draft.match === 'any' ? 'OR' : 'AND' } : group,
            ),
    });
  }

  function addGroup(): void {
    const next = emptyGroup('AND');
    setDraft({ ...draft, groups: [...draft.groups, next] });
    setOpenField(next.conditions[0]?.id ?? null);
    setLive(messages.filterGroupAdded);
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
    <Modal title={title} className="filter-editor" hideTitle onClose={requestClose}>
      <div className="filter-editor-head">
        <button
          type="button"
          className="icon-button filter-editor-close"
          aria-label={messages.close}
          onClick={requestClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <Funnel
          className="filter-editor-mark"
          size={20}
          aria-hidden="true"
          style={{ color: draft.color ?? 'var(--ink-2)' }}
        />
        <h2>{title}</h2>
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
        <label className="filter-field" htmlFor="filter-name">
          {messages.filterName}
          <input
            id="filter-name"
            className="ui-input"
            value={draft.name}
            maxLength={80}
            placeholder={messages.filterNamePlaceholder}
            autoFocus={request.kind === 'create'}
            aria-invalid={issue === 'name' && tried}
            onFocus={centerOnMobile}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
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
            <p className="filter-groups-help">
              {draft.outer === 'OR' ? messages.filterGroupsAny : messages.filterGroupsAll}
            </p>
            {draft.groups.map((group, index) => (
              <div key={group.id}>
                {index > 0 ? (
                  <div className="filter-join">
                    <Segmented
                      variant="pill"
                      label={messages.filterCombineGroups}
                      value={draft.outer}
                      options={[
                        { value: 'AND', label: messages.combinatorAnd },
                        { value: 'OR', label: messages.combinatorOr },
                      ]}
                      onChange={(value) => {
                        setDraft({ ...draft, outer: value === 'OR' ? 'OR' : 'AND' });
                      }}
                    />
                  </div>
                ) : null}
                <section
                  className="filter-group"
                  role="group"
                  aria-label={groupLabel(messages, index)}
                >
                  <header className="filter-group-head">
                    <strong>{groupLabel(messages, index)}</strong>
                    <Segmented
                      label={messages.filterMatchPrompt}
                      value={group.combinator}
                      options={[
                        { value: 'AND', label: messages.filterMatchAll },
                        { value: 'OR', label: messages.filterMatchAny },
                      ]}
                      onChange={(value) => {
                        setDraft(
                          mapGroup(draft, group.id, {
                            ...group,
                            combinator: value === 'OR' ? 'OR' : 'AND',
                          }),
                        );
                      }}
                    />
                    {draft.groups.length > 1 ? (
                      <button
                        type="button"
                        className="icon-button filter-group-remove"
                        aria-label={messages.filterRemoveGroupN.replace(
                          '{count}',
                          String(index + 1),
                        )}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            groups: draft.groups.filter((item) => item.id !== group.id),
                          });
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>
                  <ConditionList
                    group={group}
                    messages={messages}
                    lists={openLists}
                    folders={folderRows}
                    tags={tagRows}
                    tagLabels={tagLabels}
                    folderLabels={folderLabels}
                    missing={missing}
                    tried={tried}
                    touched={touched}
                    openField={openField}
                    onOpenField={setOpenField}
                    onTouch={(id) => {
                      setTouched((current) => new Set(current).add(id));
                    }}
                    onChange={(next) => {
                      setDraft(mapGroup(draft, group.id, next));
                    }}
                    onFocus={setFocusId}
                    onAnnounce={setLive}
                  />
                </section>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="filter-add-group"
              onClick={addGroup}
            >
              <Plus size={16} aria-hidden="true" />
              {messages.filterAddGroup}
            </Button>
          </div>
        ) : (
          <div className="filter-field">
            <span id="filter-match-label">{messages.filterMatchPrompt}</span>
            <Segmented
              labelledBy="filter-match-label"
              value={draft.match}
              options={matchOptions(messages)}
              onChange={(value) => {
                setDraft({ ...draft, match: value === 'any' ? 'any' : 'all' });
              }}
            />
            <p className="filter-match-help">
              {draft.match === 'any' ? messages.filterMatchAnyHelp : messages.filterMatchAllHelp}
            </p>
            <ConditionList
              group={draft.groups[0] ?? emptyGroup('AND')}
              messages={messages}
              lists={openLists}
              folders={folderRows}
              tags={tagRows}
              tagLabels={tagLabels}
              folderLabels={folderLabels}
              missing={missing}
              tried={tried}
              touched={touched}
              openField={openField}
              onOpenField={setOpenField}
              onTouch={(id) => {
                setTouched((current) => new Set(current).add(id));
              }}
              onChange={(next) => {
                setDraft({ ...draft, groups: [next, ...draft.groups.slice(1)] });
              }}
              onFocus={setFocusId}
              onAnnounce={setLive}
            />
          </div>
        )}
        <Preview
          messages={messages}
          enabled={previewOn}
          text={countText}
          rows={previewOn && ready ? (preview?.rows ?? []) : []}
          onToggle={setPreviewOn}
          onSeeAll={seeAll}
        />
        {error !== null ? (
          <p className="filter-save-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="filter-editor-foot">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="filter-editor-mode"
          onClick={draft.advanced ? leaveAdvanced : enterAdvanced}
        >
          <Layers size={16} aria-hidden="true" />
          {draft.advanced ? messages.filterSimpleLink : messages.filterAdvancedLink}
        </Button>
        <p id={hintId} className={tried && hint !== null ? 'filter-hint is-error' : 'filter-hint'}>
          {hint ?? ''}
        </p>
        <div className="filter-editor-actions">
          <Button type="button" variant="secondary" onClick={requestClose}>
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
      <div className="filter-editor-bar">
        <PreviewSwitch label={messages.filterPreview} checked={previewOn} onChange={setPreviewOn} />
        {previewOn ? <span className="filter-editor-count">{countText}</span> : null}
        {previewOn ? (
          <Button type="button" variant="ghost" size="sm" onClick={seeAll}>
            {messages.filterPreviewOpen}
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <p className="filter-live" aria-live="polite">
        {live}
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

interface ListRow {
  readonly id: string;
  readonly name: string;
  readonly folder_id?: string | null;
  readonly is_inbox?: boolean;
  readonly closed?: boolean;
}

interface FolderRow {
  readonly id: string;
  readonly name: string;
}

interface TagRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly parent_id?: string | null;
}

function ConditionList({
  group,
  messages,
  lists,
  folders,
  tags,
  tagLabels,
  folderLabels,
  missing,
  tried,
  touched,
  openField,
  onOpenField,
  onTouch,
  onChange,
  onFocus,
  onAnnounce,
}: {
  readonly group: GroupDraft;
  readonly messages: Messages;
  readonly lists: readonly ListRow[];
  readonly folders: readonly FolderRow[];
  readonly tags: readonly TagRow[];
  readonly tagLabels: ReturnType<typeof filterTagLabels>;
  readonly folderLabels: ReturnType<typeof filterFolderLabels>;
  readonly missing: readonly string[];
  readonly tried: boolean;
  readonly touched: ReadonlySet<string>;
  readonly openField: string | null;
  readonly onOpenField: (id: string | null) => void;
  readonly onTouch: (id: string) => void;
  readonly onChange: (group: GroupDraft) => void;
  readonly onFocus: (id: string) => void;
  readonly onAnnounce: (text: string) => void;
}) {
  return (
    <div role="group" aria-label={messages.filterConditionsGroup} className="filter-conditions">
      {group.conditions.map((condition) => (
        <ConditionRow
          key={condition.id}
          condition={condition}
          messages={messages}
          lists={lists}
          folders={folders}
          tags={tags}
          tagLabels={tagLabels}
          folderLabels={folderLabels}
          invalid={(tried || touched.has(condition.id)) && missing.includes(condition.id)}
          fieldOpen={openField === condition.id}
          onFieldOpen={(open) => {
            onOpenField(open ? condition.id : null);
          }}
          onTouch={() => {
            onTouch(condition.id);
          }}
          onChange={(next) => {
            onChange({
              ...group,
              conditions: group.conditions.map((item) => (item.id === condition.id ? next : item)),
            });
          }}
          onRemove={() => {
            const index = group.conditions.findIndex((item) => item.id === condition.id);
            const neighbor = group.conditions[index + 1] ?? group.conditions[index - 1];
            onChange({
              ...group,
              conditions: group.conditions.filter((item) => item.id !== condition.id),
            });
            onFocus(neighbor === undefined ? 'add' : neighbor.id);
          }}
        />
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="filter-add-condition"
        onClick={() => {
          const next = emptyCondition();
          onChange({ ...group, conditions: [...group.conditions, next] });
          onOpenField(next.id);
          onAnnounce(messages.filterConditionAdded);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        {messages.filterAddCondition}
      </Button>
    </div>
  );
}

function ConditionRow({
  condition,
  messages,
  lists,
  folders,
  tags,
  tagLabels,
  folderLabels,
  invalid,
  fieldOpen,
  onFieldOpen,
  onTouch,
  onChange,
  onRemove,
}: {
  readonly condition: ConditionDraft;
  readonly messages: Messages;
  readonly lists: readonly ListRow[];
  readonly folders: readonly FolderRow[];
  readonly tags: readonly TagRow[];
  readonly tagLabels: ReturnType<typeof filterTagLabels>;
  readonly folderLabels: ReturnType<typeof filterFolderLabels>;
  readonly invalid: boolean;
  readonly fieldOpen: boolean;
  readonly onFieldOpen: (open: boolean) => void;
  readonly onTouch: () => void;
  readonly onChange: (next: ConditionDraft) => void;
  readonly onRemove: () => void;
}) {
  const fieldLabel = fieldName(messages, condition.field);
  const errorId = `filter-error-${condition.id}`;
  const error = invalid ? valueError(condition, messages) : null;
  return (
    <div className="filter-condition" onBlur={onTouch}>
      <FieldPicker
        id={`filter-field-${condition.id}`}
        label={fill(messages.filterFieldNamed, fieldLabel)}
        sheetTitle={messages.filterField}
        value={condition.field}
        options={fieldOptions(messages)}
        open={fieldOpen}
        onOpen={() => {
          onFieldOpen(true);
        }}
        onClose={() => {
          onFieldOpen(false);
        }}
        onChange={(value) => {
          const field = isField(value) ? value : 'keyword';
          onChange({ ...emptyCondition(field), id: condition.id });
          onFieldOpen(false);
        }}
      />
      <div className="filter-value">
        <ValueField
          condition={condition}
          messages={messages}
          lists={lists}
          folders={folders}
          tags={tags}
          tagLabels={tagLabels}
          folderLabels={folderLabels}
          invalid={invalid}
          describedBy={error === null ? undefined : errorId}
          onChange={onChange}
        />
        {error === null ? null : (
          <p id={errorId} className="filter-row-error">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        className="icon-button filter-remove"
        aria-label={fill(messages.filterRemoveCondition, fieldLabel)}
        onClick={onRemove}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function ValueField({
  condition,
  messages,
  lists,
  folders,
  tags,
  tagLabels,
  folderLabels,
  invalid,
  describedBy,
  onChange,
}: {
  readonly condition: ConditionDraft;
  readonly messages: Messages;
  readonly lists: readonly ListRow[];
  readonly folders: readonly FolderRow[];
  readonly tags: readonly TagRow[];
  readonly tagLabels: ReturnType<typeof filterTagLabels>;
  readonly folderLabels: ReturnType<typeof filterFolderLabels>;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
  readonly onChange: (next: ConditionDraft) => void;
}) {
  const valueLabel = fill(messages.filterValueOf, fieldName(messages, condition.field));
  if (condition.field === 'keyword' || condition.field === 'assignee') {
    return (
      <input
        className="ui-input"
        aria-label={valueLabel}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder={
          condition.field === 'keyword'
            ? messages.filterKeywordPlaceholder
            : messages.filterAssigneePlaceholder
        }
        value={condition.value}
        onFocus={centerOnMobile}
        onChange={(event) => {
          onChange({ ...condition, value: event.target.value });
        }}
      />
    );
  }
  if (condition.field === 'list' || condition.field === 'folder' || condition.field === 'tag') {
    return (
      <MultiPicker
        label={valueLabel}
        placeholder={
          condition.field === 'list'
            ? messages.filterAddList
            : condition.field === 'folder'
              ? messages.filterAddFolder
              : messages.filterAddTag
        }
        searchLabel={messages.filterSearch}
        doneLabel={messages.filterPickerDone}
        clearLabel={messages.filterPickerClear}
        selectedLabel={messages.filterPickerSelected}
        selectedOneLabel={messages.filterPickerOne}
        removeLabel={messages.filterRemoveValue}
        choices={
          condition.field === 'list'
            ? listChoices(lists, folders, messages.filterNoFolder)
            : condition.field === 'folder'
              ? folderChoices(folders, lists, condition.values, folderLabels, messages)
              : tagChoices(tags, condition.values, tagLabels, messages)
        }
        selected={condition.values}
        invalid={invalid}
        describedBy={describedBy}
        onChange={(values) => {
          onChange({ ...condition, values });
        }}
      />
    );
  }
  if (condition.field === 'date') {
    return (
      <DateValue
        condition={condition}
        messages={messages}
        label={valueLabel}
        invalid={invalid}
        describedBy={describedBy}
        onChange={onChange}
      />
    );
  }
  if (condition.field === 'priority') {
    return (
      <div className="filter-priority" role="radiogroup" aria-label={valueLabel}>
        {(
          [
            ['high', messages.filterPriorityHigh],
            ['medium', messages.filterPriorityMedium],
            ['low', messages.filterPriorityLow],
            ['none', messages.filterPriorityAny],
          ] as const
        ).map(([value, label]) => {
          const on = condition.value === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'is-checked' : undefined}
              onClick={() => {
                onChange({ ...condition, value });
              }}
            >
              <Flag size={14} className={`is-${value}`} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <Segmented
      label={valueLabel}
      value={condition.value === 'completed' ? 'completed' : 'active'}
      options={[
        { value: 'active', label: messages.filterStatusPending },
        { value: 'completed', label: messages.filterStatusDone },
      ]}
      onChange={(value) => {
        onChange({ ...condition, value });
      }}
    />
  );
}

function DateValue({
  condition,
  messages,
  label,
  invalid,
  describedBy,
  onChange,
}: {
  readonly condition: ConditionDraft;
  readonly messages: Messages;
  readonly label: string;
  readonly invalid: boolean;
  readonly describedBy: string | undefined;
  readonly onChange: (next: ConditionDraft) => void;
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [which, setWhich] = useState<'from' | 'to' | null>(null);
  const fromRef = useRef<HTMLButtonElement>(null);
  const toRef = useRef<HTMLButtonElement>(null);
  const day = which === 'to' ? condition.valueTo : condition.value;
  const draft = dateDraft(day, zone);
  return (
    <div className="filter-date">
      <Segmented
        className="is-wrap"
        variant="pill"
        label={label}
        value={condition.op}
        options={DATE_OPS.map((op) => ({ value: op, label: dateLabel(messages, op) }))}
        onChange={(op) => {
          onChange({ ...condition, op });
        }}
      />
      {condition.op === 'between' ? (
        <div className="filter-date-range">
          <button
            ref={fromRef}
            type="button"
            className="ui-input"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            aria-haspopup="dialog"
            onClick={() => {
              setWhich('from');
            }}
          >
            <Calendar size={16} aria-hidden="true" />
            {condition.value.length > 0 ? condition.value : messages.filterFrom}
          </button>
          <button
            ref={toRef}
            type="button"
            className="ui-input"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            aria-haspopup="dialog"
            onClick={() => {
              setWhich('to');
            }}
          >
            <Calendar size={16} aria-hidden="true" />
            {condition.valueTo.length > 0 ? condition.valueTo : messages.filterTo}
          </button>
          <DatePopover
            mode="date-only"
            open={which !== null}
            anchor={which === 'to' ? toRef : fromRef}
            timeZone={zone}
            value={draft}
            onClose={() => {
              setWhich(null);
              (which === 'to' ? toRef : fromRef).current?.focus();
            }}
            onApply={(next) => {
              const picked = next.dueDate === null ? '' : calendarDay(next.dueDate, zone);
              onChange(
                which === 'to'
                  ? { ...condition, valueTo: picked }
                  : { ...condition, value: picked },
              );
              setWhich(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PreviewSwitch({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  return (
    <label className="filter-preview-switch">
      <span className="filter-switch">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        <span aria-hidden="true" />
      </span>
      {label}
    </label>
  );
}

function Preview({
  messages,
  enabled,
  text,
  rows,
  onToggle,
  onSeeAll,
}: {
  readonly messages: Messages;
  readonly enabled: boolean;
  readonly text: string;
  readonly rows: ReturnType<typeof rowsFromView>;
  readonly onToggle: (next: boolean) => void;
  readonly onSeeAll: () => void;
}) {
  return (
    <section className="filter-preview" aria-label={messages.filterPreview}>
      <header>
        <Eye size={16} aria-hidden="true" />
        <PreviewSwitch label={messages.filterPreview} checked={enabled} onChange={onToggle} />
        {enabled ? (
          <p>
            <strong>{text}</strong>
          </p>
        ) : null}
        {enabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={onSeeAll}>
            {messages.filterSeeAll}
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        ) : null}
      </header>
      {enabled && rows.length > 0 ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <span className={`filter-prio is-${row.priority}`} aria-hidden="true" />
              <span className="filter-preview-title">{row.title}</span>
              <span className="filter-preview-list">{row.projectName}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function listChoices(
  lists: readonly ListRow[],
  folders: readonly FolderRow[],
  noFolder: string,
): PickerChoice[] {
  const order = new Map(folders.map((folder, index) => [folder.id, index]));
  const names = new Map(folders.map((folder) => [folder.id, folder.name]));
  return lists.map((list, index) => {
    const icon = <List size={16} aria-hidden="true" />;
    if (list.is_inbox === true) {
      return { id: list.id, label: list.name, section: '', sectionOrder: -1, rank: index, icon };
    }
    const folderId = list.folder_id ?? null;
    const folderName = folderId === null ? undefined : names.get(folderId);
    if (folderName === undefined) {
      return {
        id: list.id,
        label: list.name,
        section: noFolder,
        sectionOrder: 10_000,
        rank: index,
        icon,
      };
    }
    return {
      id: list.id,
      label: list.name,
      section: folderName,
      sectionOrder: order.get(folderId ?? '') ?? 9_000,
      rank: index,
      icon,
    };
  });
}

function folderChoices(
  folders: readonly FolderRow[],
  lists: readonly ListRow[],
  selected: readonly string[],
  labels: ReturnType<typeof filterFolderLabels>,
  messages: Messages,
): PickerChoice[] {
  const choices = folders.map((folder, index) => {
    const count = lists.filter((list) => list.folder_id === folder.id).length;
    return {
      id: folder.id,
      label: folder.name,
      section: '',
      sectionOrder: 0,
      rank: index,
      detail:
        count === 1
          ? messages.filterListOne
          : messages.filterListCount.replace('{count}', String(count)),
      icon: <Folder size={16} aria-hidden="true" />,
    };
  });
  for (const id of selected) {
    if (choices.some((choice) => choice.id === id)) {
      continue;
    }
    const label = labels[id];
    choices.push({
      id,
      label: label === undefined || label.deleted ? messages.filterDeletedFolder : label.name,
      section: '',
      sectionOrder: 0,
      rank: choices.length,
      deleted: label === undefined || label.deleted,
      icon: <Folder size={16} aria-hidden="true" />,
    });
  }
  return choices;
}

function tagChoices(
  tags: readonly TagRow[],
  selected: readonly string[],
  labels: ReturnType<typeof filterTagLabels>,
  messages: Messages,
): PickerChoice[] {
  const byParent = new Map<string | null, TagRow[]>();
  for (const tag of tags) {
    const parent = tag.parent_id ?? null;
    const bucket = byParent.get(parent) ?? [];
    bucket.push(tag);
    byParent.set(parent, bucket);
  }
  const choices: PickerChoice[] = [];
  let rank = 0;
  const walk = (parent: string | null, indent: number): void => {
    const children = [...(byParent.get(parent) ?? [])].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const tag of children) {
      choices.push({
        id: tag.id,
        label: tag.name,
        section: '',
        sectionOrder: 0,
        indent,
        rank: rank++,
        icon: <Tag size={16} aria-hidden="true" />,
      });
      walk(tag.id, indent + 1);
    }
  };
  walk(null, 0);
  for (const id of selected) {
    if (choices.some((choice) => choice.id === id)) {
      continue;
    }
    const label = labels[id];
    choices.push({
      id,
      label: label === undefined || label.deleted ? messages.filterDeletedTag : label.name,
      section: '',
      sectionOrder: 0,
      rank: rank++,
      deleted: label === undefined || label.deleted,
      icon: <Tag size={16} aria-hidden="true" />,
    });
  }
  return choices;
}

function fieldOptions(messages: Messages): FieldOption[] {
  return [
    { value: 'keyword', label: messages.fieldKeyword, icon: Type },
    { value: 'list', label: messages.fieldList, icon: List },
    { value: 'folder', label: messages.fieldFolder, icon: Folder },
    { value: 'tag', label: messages.fieldTag, icon: Tag },
    { value: 'date', label: messages.fieldDate, icon: Calendar },
    { value: 'priority', label: messages.fieldPriority, icon: Flag },
    { value: 'status', label: messages.fieldStatus, icon: CircleCheck },
    { value: 'assignee', label: messages.fieldAssignee, icon: UserRound },
  ];
}

function matchOptions(messages: Messages): { value: string; label: string }[] {
  return [
    { value: 'all', label: messages.filterMatchAll },
    { value: 'any', label: messages.filterMatchAny },
  ];
}

function dateDraft(day: string, zone: string): DateDraft {
  return {
    dueDate: day.length === 0 ? null : zonedWallTime(day, 12, 0, zone),
    allDay: true,
    durationMinutes: null,
    reminder: null,
    reminderTouched: false,
    repeatRule: null,
  };
}

function dateLabel(messages: Messages, op: (typeof DATE_OPS)[number]): string {
  switch (op) {
    case 'today':
      return messages.dateToday;
    case 'tomorrow':
      return messages.dateTomorrow;
    case 'next_7_days':
      return messages.dateNext7;
    case 'overdue':
      return messages.dateOverdue;
    case 'no_date':
      return messages.dateNoDate;
    case 'between':
      return messages.filterDateBetween;
    default: {
      const unreachable: never = op;
      return unreachable;
    }
  }
}

function valueError(condition: ConditionDraft, messages: Messages): string {
  if (condition.field === 'date' && condition.op === 'between') {
    if (
      condition.value.length > 0 &&
      condition.valueTo.length > 0 &&
      condition.value > condition.valueTo
    ) {
      return messages.filterDateOrder;
    }
    return messages.filterDateMissing;
  }
  switch (condition.field) {
    case 'keyword':
      return messages.filterWriteWord;
    case 'assignee':
      return messages.filterWriteAssignee;
    case 'list':
      return messages.filterChooseList;
    case 'folder':
      return messages.filterChooseFolder;
    case 'tag':
      return messages.filterChooseTag;
    default:
      return messages.filterIncompleteRow;
  }
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

function groupLabel(messages: Messages, index: number): string {
  return messages.filterGroupLabel.replace('{count}', String(index + 1));
}

function fieldName(messages: Messages, field: ConditionField): string {
  switch (field) {
    case 'keyword':
      return messages.fieldKeyword;
    case 'list':
      return messages.fieldList;
    case 'folder':
      return messages.fieldFolder;
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
    if (reason === 'unknown_folder') {
      return messages.filterUnknownFolder;
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
    value === 'folder' ||
    value === 'tag' ||
    value === 'date' ||
    value === 'priority' ||
    value === 'keyword' ||
    value === 'status' ||
    value === 'assignee'
  );
}
