import { useEffect, useRef, useState } from 'react';
import { fill } from '../i18n';
import './toast.css';

const UNDO_MS = 4_000;

export function UndoToastStack({
  items,
  message,
  undoLabel,
  onUndo,
  onExpire,
}: {
  readonly items: readonly { readonly id: string; readonly title: string }[];
  readonly message: string;
  readonly undoLabel: string;
  readonly onUndo: (id: string) => void;
  readonly onExpire: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="toast-stack">
      {items.map((item) => (
        <UndoToast
          key={item.id}
          id={item.id}
          text={fill(message, item.title)}
          undoLabel={undoLabel}
          onUndo={onUndo}
          onExpire={onExpire}
        />
      ))}
    </div>
  );
}

function UndoToast({
  id,
  text,
  undoLabel,
  onUndo,
  onExpire,
}: {
  readonly id: string;
  readonly text: string;
  readonly undoLabel: string;
  readonly onUndo: (id: string) => void;
  readonly onExpire: (id: string) => void;
}) {
  const remaining = useRef(UNDO_MS);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;

  useEffect(() => {
    if (paused) {
      return;
    }
    const started = Date.now();
    const timer = window.setTimeout(() => {
      onExpire(id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [id, onExpire, paused]);

  return (
    <div
      className="toast"
      role="status"
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
      onFocusCapture={() => {
        setFocus(true);
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) {
          return;
        }
        setFocus(false);
      }}
    >
      <p>{text}</p>
      <button
        type="button"
        onClick={() => {
          onUndo(id);
        }}
      >
        {undoLabel}
      </button>
    </div>
  );
}
