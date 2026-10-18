import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
}) {
  return (
    <button
      {...props}
      className={`ui-button is-${variant} is-${size} ${props.className ?? ''}`}
      disabled={props.disabled === true || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { readonly children: string }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}

export function Badge({ value }: { readonly value: number }) {
  return <span className="ui-badge">{value}</span>;
}

export function TagChip({
  label,
  color,
  onRemove,
}: {
  readonly label: string;
  readonly color?: string | null;
  readonly onRemove?: () => void;
}) {
  return (
    <span className="ui-tag" style={color === undefined || color === null ? undefined : { color }}>
      {label}
      {onRemove !== undefined ? (
        <button type="button" className="ui-tag-x" aria-label={label} onClick={onRemove}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div className="ui-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function ErrorState({
  title,
  onRetry,
  retryLabel,
  detail,
}: {
  readonly title: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
  readonly detail?: string;
}) {
  return (
    <div className="ui-error" role="alert">
      <p>{title}</p>
      {detail !== undefined ? <p className="ui-muted">{detail}</p> : null}
      <Button
        onClick={() => {
          onRetry();
        }}
      >
        {retryLabel}
      </Button>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  danger = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly danger?: boolean;
}) {
  return (
    <div
      className="ui-scrim"
      role="presentation"
      onMouseDown={() => {
        if (!danger) {
          onClose();
        }
      }}
    >
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value }: { readonly value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <span
      className="ui-progress"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      role="progressbar"
    >
      <span style={{ width: `${String(width)}%` }} />
    </span>
  );
}
