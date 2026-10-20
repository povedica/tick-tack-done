import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { bindPopover, dismissPopover } from './popover-stack';

export function Popover({
  open,
  label,
  onClose,
  className,
  children,
  anchor,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly onClose: () => void;
  readonly className?: string;
  readonly children: ReactNode;
  readonly anchor?: RefObject<HTMLElement | null> | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    function place() {
      const target = anchor?.current;
      const node = ref.current;
      if (!target || !node) return;
      const box = target.getBoundingClientRect();
      const width = Math.min(
        node.classList.contains('date-popover') ? 320 : 260,
        window.innerWidth - 24,
      );
      const height = Math.min(node.scrollHeight, window.innerHeight - 24);
      const below = window.innerHeight - box.bottom - 12;
      const above = box.top - 12;
      const top =
        below >= height || below >= above ? box.bottom + 6 : Math.max(12, box.top - height - 6);
      setPosition({
        position: 'fixed',
        top,
        left: Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12)),
        right: 'auto',
        width,
        maxHeight: Math.max(120, Math.min(height, window.innerHeight - top - 12)),
        zIndex: 2000,
      });
    }
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor]);
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
      if (
        node === null ||
        !(event.target instanceof Node) ||
        node.contains(event.target) ||
        anchor?.current?.contains(event.target)
      ) {
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
  }, [onClose, open, anchor]);
  useEffect(() => {
    if (!open || ref.current === null) return;
    const previous = document.activeElement;
    const first = ref.current.querySelector<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
    );
    (first ?? ref.current).focus();
    return () => {
      if (!anchor && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, anchor]);
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
  const content = (
    <div
      style={anchor ? position : undefined}
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
  return anchor ? createPortal(content, document.body) : content;
}
