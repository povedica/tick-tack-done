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
  mobileSheet = false,
  sheetHeader,
  sheetFooter,
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
  readonly mobileSheet?: boolean;
  readonly sheetHeader?: ReactNode;
  readonly sheetFooter?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    if (!anchor && !mobileSheet) return;
    function place() {
      const target = anchor?.current;
      const node = ref.current;
      if (!node) return;
      const viewport = window.visualViewport;
      const viewWidth = viewport?.width ?? window.innerWidth;
      const viewHeight = viewport?.height ?? window.innerHeight;
      const viewLeft = viewport?.offsetLeft ?? 0;
      const viewTop = viewport?.offsetTop ?? 0;
      const isSheet = mobileSheet && window.matchMedia('(max-width: 768px)').matches;
      setSheet(isSheet);
      if (isSheet) {
        setPosition({
          position: 'fixed',
          left: viewLeft,
          top: 'auto',
          bottom: Math.max(0, window.innerHeight - viewTop - viewHeight),
          width: viewWidth,
          maxWidth: viewWidth,
          maxHeight: `min(var(--sheet-max-h-mobile), ${String(viewHeight)}px)`,
          zIndex: 2000,
          overflow: sheetHeader || sheetFooter ? 'hidden' : 'auto',
          ...(sheetHeader || sheetFooter
            ? { display: 'flex', flexDirection: 'column' as const }
            : {}),
        });
        return;
      }
      if (!target) return;
      const box = target.getBoundingClientRect();
      const preferred =
        widthProp ??
        (node.classList.contains('calendar-popover')
          ? node.getBoundingClientRect().width
          : node.classList.contains('date-popover')
            ? 320
            : Math.min(320, Math.max(220, node.scrollWidth || 260)));
      const width = Math.min(preferred, viewWidth - 24);
      const maxHeight = Math.min(viewHeight * 0.7, viewHeight - 24);
      const below = viewTop + viewHeight - box.bottom - 12;
      const above = box.top - viewTop - 12;
      const preferredTop =
        below >= Math.min(node.scrollHeight, maxHeight) || below >= above
          ? box.bottom + 6
          : Math.max(viewTop + 12, box.top - Math.min(node.scrollHeight, maxHeight) - 6);
      const top = Math.max(viewTop + 12, preferredTop + offsetY);
      setPosition({
        position: 'fixed',
        top,
        left: Math.max(
          viewLeft + 12,
          Math.min(box.left + offsetX, viewLeft + viewWidth - width - 12),
        ),
        right: 'auto',
        width,
        maxHeight: Math.max(120, Math.min(maxHeight, viewTop + viewHeight - top - 12)),
        zIndex: 2000,
        overflow: 'auto',
      });
    }
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, widthProp, offsetX, offsetY, mobileSheet, sheetHeader, sheetFooter]);
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
    if (mobileSheet && window.matchMedia('(max-width: 768px)').matches) return;
    const limit =
      (window.visualViewport?.height ?? window.innerHeight) +
      (window.visualViewport?.offsetTop ?? 0) -
      12;
    if (rect.bottom > limit) {
      node.style.maxHeight = `${String(Math.max(160, rect.height - (rect.bottom - limit)))}px`;
    }
  }, [open, children, mobileSheet]);
  if (!open) {
    return null;
  }
  const content = (
    <div
      style={
        anchor || sheet
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
      className={`${className ?? 'popover'}${sheet ? ' is-bottom-sheet' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      {sheet ? (
        <div
          className="sheet-handle"
          aria-hidden="true"
          onPointerDown={(event) => {
            touchStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (touchStart.current !== null && event.clientY - touchStart.current > 64) onClose();
            touchStart.current = null;
          }}
        />
      ) : null}
      {sheet && (sheetHeader || sheetFooter) ? (
        <>
          {sheetHeader ? <div className="sheet-header">{sheetHeader}</div> : null}
          <div className="sheet-body">{children}</div>
          {sheetFooter ? <div className="sheet-footer">{sheetFooter}</div> : null}
        </>
      ) : (
        children
      )}
    </div>
  );
  const result = sheet ? (
    <>
      <div className="date-sheet-backdrop" aria-hidden="true" onClick={onClose} />
      {content}
    </>
  ) : (
    content
  );
  return anchor || sheet ? createPortal(result, document.body) : result;
}
