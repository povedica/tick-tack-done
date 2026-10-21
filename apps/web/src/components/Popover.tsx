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
  width: widthProp,
  offsetX = 0,
  offsetY = 0,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly onClose: () => void;
  readonly className?: string;
  readonly children: ReactNode;
  readonly anchor?: RefObject<HTMLElement | null> | undefined;
  /** Preferred width; omit for content-sized between 220 and 320 (TTD-AUD-64). */
  readonly width?: number | undefined;
  readonly offsetX?: number;
  readonly offsetY?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    if (!anchor) return;
    function place() {
      const target = anchor?.current;
      const node = ref.current;
      if (!target || !node) return;
      const box = target.getBoundingClientRect();
      const preferred =
        widthProp ??
        (node.classList.contains('calendar-popover')
          ? node.getBoundingClientRect().width
          : node.classList.contains('date-popover')
            ? 320
            : Math.min(320, Math.max(220, node.scrollWidth || 260)));
      const width = Math.min(preferred, window.innerWidth - 24);
      const maxHeight = Math.min(window.innerHeight * 0.7, window.innerHeight - 24);
      const below = window.innerHeight - box.bottom - 12;
      const above = box.top - 12;
      const preferredTop =
        below >= Math.min(node.scrollHeight, maxHeight) || below >= above
          ? box.bottom + 6
          : Math.max(12, box.top - Math.min(node.scrollHeight, maxHeight) - 6);
      const top = Math.max(12, preferredTop + offsetY);
      setPosition({
        position: 'fixed',
        top,
        left: Math.max(12, Math.min(box.left + offsetX, window.innerWidth - width - 12)),
        right: 'auto',
        width,
        maxHeight: Math.max(120, Math.min(maxHeight, window.innerHeight - top - 12)),
        zIndex: 2000,
        overflow: 'auto',
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
  }, [open, anchor, widthProp, offsetX, offsetY]);
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
      if (
        node?.contains(document.activeElement) &&
        document.activeElement?.matches('button[role="menuitem"]') &&
        ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      ) {
        const items = [
          ...node.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)'),
        ];
        if (items.length > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const current = items.findIndex((item) => item === document.activeElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
          return;
        }
      }
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
      if (anchor?.current?.isConnected) anchor.current.focus();
      else if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
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
      style={
        anchor
          ? (position ?? {
              position: 'fixed',
              top: 0,
              left: 0,
              visibility: 'hidden',
              width:
                widthProp ??
                (className?.includes('calendar-popover')
                  ? 'var(--calendar-views-width)'
                  : className?.includes('date-popover')
                    ? 320
                    : 260),
              maxWidth: 'calc(100vw - 24px)',
            })
          : undefined
      }
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
