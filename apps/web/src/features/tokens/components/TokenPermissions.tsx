import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Button } from '../../../components/ui';
import { useMessages } from '../../../i18n';
import {
  PERMISSION_ROWS,
  cellOn,
  columnState,
  describePermissions,
  matchingPreset,
  permissionCountLabel,
  presetScopes,
  setColumn,
  toggleRow,
  type PermissionPreset,
  type PermissionRow,
  type SwitchValue,
} from '../permission-matrix';
import { isSensitiveScope, type Scope } from '../scopes';

export function TokenPermissionSummary({ scopes }: { readonly scopes: readonly Scope[] }) {
  const messages = useMessages();
  const summary = describePermissions(scopes, messages);
  if (summary.empty !== null) {
    return <p className="token-perm-summary">{summary.empty}</p>;
  }
  return (
    <p className="token-perm-summary">
      {summary.lead}{' '}
      {summary.clauses.map((clause, index) => (
        <span key={clause}>
          {index > 0 ? ', ' : null}
          {index === 0 ? <strong>{clause}</strong> : clause}
        </span>
      ))}
      .
    </p>
  );
}

export function TokenPermissions({
  scopes,
  onChange,
}: {
  readonly scopes: readonly Scope[];
  readonly onChange: (scopes: Scope[]) => void;
}) {
  const messages = useMessages();
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const preset = matchingPreset(scopes);
  const count = permissionCountLabel(scopes, messages);

  useEffect(() => {
    if (!confirmFull) return;
    cancelRef.current?.focus();
  }, [confirmFull]);

  function askFull(event: MouseEvent<HTMLButtonElement>): void {
    if (preset === 'full') return;
    openerRef.current = event.currentTarget;
    setConfirmFull(true);
  }

  function closeFull(): void {
    setConfirmFull(false);
    openerRef.current?.focus();
  }

  function confirm(): void {
    onChange(presetScopes('full'));
    setConfirmFull(false);
    openerRef.current?.focus();
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFull();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = dialogRef.current;
    if (root === null) return;
    const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function applyPreset(next: Exclude<PermissionPreset, 'full'>): void {
    onChange(presetScopes(next));
  }

  function onAll(column: 'read' | 'write', event: MouseEvent<HTMLButtonElement>): void {
    const state = columnState(scopes, column);
    if (column === 'write' && state !== true) {
      askFull(event);
      return;
    }
    onChange(setColumn(scopes, column, state !== true));
  }

  return (
    <div className="token-perms">
      <p className="token-label" id="token-perms-label">
        {messages.tokenScopes}
      </p>
      <div className="token-presets" role="group" aria-labelledby="token-perms-label">
        <Preset
          pressed={preset === 'none'}
          onClick={() => {
            applyPreset('none');
          }}
        >
          {messages.tokenPermNone}
        </Preset>
        <Preset
          pressed={preset === 'tasks'}
          onClick={() => {
            applyPreset('tasks');
          }}
        >
          {messages.tokenPermTasks}
        </Preset>
        <Preset
          pressed={preset === 'read'}
          onClick={() => {
            applyPreset('read');
          }}
        >
          {messages.tokenPermReadAll}
        </Preset>
        <Preset pressed={preset === 'full'} warn onClick={askFull}>
          {messages.tokenPermFull}
        </Preset>
      </div>
      <p className="token-perm-count" role="status">
        {count}
      </p>
      <div className="token-perm-scroll">
        <table className="token-perm-table">
          <thead>
            <tr>
              <th scope="col">{messages.tokenPermSection}</th>
              <th scope="col">{messages.scopeRead}</th>
              <th scope="col" aria-label={messages.tokenPermWriteColumn}>
                <span>{messages.scopeWrite}</span>
                <small className="token-perm-colhint">{messages.tokenPermWriteHint}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-all">
              <th scope="row">{messages.tokenPermAll}</th>
              <td>
                <PermSwitch
                  label={`${messages.tokenPermAll}, ${messages.scopeRead}`}
                  value={columnState(scopes, 'read')}
                  onClick={(event) => {
                    onAll('read', event);
                  }}
                />
              </td>
              <td>
                <PermSwitch
                  label={`${messages.tokenPermAll}, ${messages.scopeWrite}`}
                  value={columnState(scopes, 'write')}
                  onClick={(event) => {
                    onAll('write', event);
                  }}
                />
              </td>
            </tr>
            {PERMISSION_ROWS.map((row) => (
              <AreaRow key={row.id} row={row} scopes={scopes} onChange={onChange} />
            ))}
          </tbody>
        </table>
      </div>
      {confirmFull ? (
        <div
          className="token-perm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFull();
          }}
        >
          <div
            ref={dialogRef}
            className="token-perm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            onKeyDown={onDialogKeyDown}
          >
            <h3 id={titleId}>{messages.tokenPermFullTitle}</h3>
            <p id={bodyId}>
              {messages.tokenPermFullBodyLead} <strong>{messages.tokenPermFullDelete}</strong>{' '}
              {messages.tokenPermFullBodyTail}
            </p>
            <p>{messages.tokenPermFullWarning}</p>
            <div className="token-perm-actions">
              <Button type="button" ref={cancelRef} onClick={closeFull}>
                {messages.cancel}
              </Button>
              <Button type="button" variant="danger" onClick={confirm}>
                {messages.tokenPermFullAction}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AreaRow({
  row,
  scopes,
  onChange,
}: {
  readonly row: PermissionRow;
  readonly scopes: readonly Scope[];
  readonly onChange: (scopes: Scope[]) => void;
}) {
  const messages = useMessages();
  const area = messages[row.label];
  const sensitive = row.write !== null && isSensitiveScope(row.write);
  return (
    <tr>
      <th scope="row">
        {area}
        {sensitive ? (
          <span className="token-perm-warn" title={messages.scopeSensitive}>
            {' '}
            <span aria-hidden="true">⚠</span>
            <span className="sr-only">{messages.scopeSensitive}</span>
          </span>
        ) : null}
      </th>
      <td>
        <PermSwitch
          label={`${area}, ${messages.scopeRead}`}
          value={cellOn(scopes, row.read)}
          disabled={row.read === null}
          onClick={() => {
            onChange(toggleRow(scopes, row, 'read'));
          }}
        />
      </td>
      <td>
        <PermSwitch
          label={
            row.write?.endsWith(':manage') === true
              ? `${area}, ${messages.scopeManage}`
              : `${area}, ${messages.scopeWrite}`
          }
          value={cellOn(scopes, row.write)}
          disabled={row.write === null}
          {...(row.write?.endsWith(':manage') === true ? { title: messages.scopeManage } : {})}
          onClick={() => {
            onChange(toggleRow(scopes, row, 'write'));
          }}
        />
      </td>
    </tr>
  );
}

function PermSwitch({
  label,
  value,
  disabled = false,
  title,
  onClick,
}: {
  readonly label: string;
  readonly value: SwitchValue;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="token-switch"
      aria-checked={value === 'mixed' ? 'mixed' : value}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <span aria-hidden="true" />
    </button>
  );
}

function Preset({
  pressed,
  warn = false,
  onClick,
  children,
}: {
  readonly pressed: boolean;
  readonly warn?: boolean;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly children: string;
}) {
  return (
    <button
      type="button"
      className={warn ? 'token-preset is-warn' : 'token-preset'}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
