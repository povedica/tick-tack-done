import { useEffect, useRef, type ReactNode } from 'react';
import { bindPopover, dismissPopover } from './popover-stack';

export function Popover({
  open,
  label,
  onClose,
  className,
  children,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly onClose: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) {
      return;
    }
    return bindPopover(() => {
      closeRef.current();
    });
  }, [open]);
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      const node = ref.current;
      if (event.key === 'Tab' && node !== null) {
        const items = [
          ...node.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (first === undefined) {
          event.preventDefault();
          node.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || !node.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !node.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissPopover();
    }
    function onPointer(event: MouseEvent): void {
      const node = ref.current;
      if (node === null || !(event.target instanceof Node) || node.contains(event.target)) {
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose, open]);
  useEffect(() => {
    if (!open || ref.current === null) return;
    const previous = document.activeElement;
    const first = ref.current.querySelector<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
    );
    (first ?? ref.current).focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  useEffect(() => {
    const node = ref.current;
    if (!open || node === null) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const limit = window.innerHeight - 12;
    if (rect.bottom > limit) {
      node.style.maxHeight = `${String(Math.max(160, rect.height - (rect.bottom - limit)))}px`;
    }
  }, [open, children]);
  if (!open) {
    return null;
  }
  return (
    <div
      ref={ref}
      className={className ?? 'popover'}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
