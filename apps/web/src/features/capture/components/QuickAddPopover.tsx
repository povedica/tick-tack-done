import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useMessages } from '../../../i18n';
import { bindPopover, dismissPopover } from '../../../components/popover-stack';
import { TaskComposer } from '../../tasks/TaskComposer';
import type { CalendarSlot, SlotAnchor } from '../calendar-slot';
import { openTaskComposer, type CaptureDraft } from '../notice';
import { useComposerCopy } from '../../tasks/composer-text';
import type { CaptureNotice } from '../notice';
import './quick-add-popover.css';

export function QuickAddPopover({
  slot,
  anchor,
  defaultProjectId,
  initialDraft,
  initialText = '',
  onClose,
  onCreated,
}: {
  readonly slot?: CalendarSlot | undefined;
  readonly anchor?: SlotAnchor | undefined;
  readonly defaultProjectId?: string | undefined;
  readonly initialDraft?: CaptureDraft | undefined;
  readonly initialText?: string;
  readonly onClose: () => void;
  readonly onCreated: (notice: CaptureNotice) => void;
}) {
  const messages = useMessages();
  const titleId = useId();
  const labels = useComposerCopy();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: window.visualViewport?.offsetTop ?? 0,
  });
  const previousFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [dirty, setDirty] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);
  const expanding = useRef(false);
  const swipeStart = useRef<number | null>(null);
  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }, [busy, dirty, onClose]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      setViewport({
        height: viewport?.height ?? window.innerHeight,
        top: viewport?.offsetTop ?? 0,
      });
    };
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const { refs, floatingStyles } = useFloating({
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  useLayoutEffect(() => {
    if (!anchor) return;
    const box = anchor.element.getBoundingClientRect();
    const dx = anchor.x - box.left;
    const dy = anchor.y - box.top;
    refs.setPositionReference({
      contextElement: anchor.element,
      getBoundingClientRect: () => {
        const current = anchor.element.getBoundingClientRect();
        return DOMRect.fromRect({ x: current.left + dx, y: current.top + dy, width: 0, height: 0 });
      },
    });
  }, [anchor, refs]);
  useEffect(() => bindPopover(requestClose), [requestClose, confirmDiscard]);
  useEffect(() => {
    const root = node.current;
    let focused = false;
    const focusTitle = () => {
      if (focused || root === null) return;
      const input = root.querySelector<HTMLInputElement>('input[name="title"]');
      if (input === null) return;
      input.focus();
      focused = true;
    };
    focusTitle();
    const observer = new MutationObserver(focusTitle);
    if (root !== null) observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      const target = anchor?.element ?? previousFocus.current;
      if (!expanding.current && target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [anchor]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      // A nested DatePopover/menu owns its keys until it closes.
      if (event.target instanceof Node && !node.current?.contains(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (busy) return;
        if (confirmDiscard) {
          setConfirmDiscard(false);
          node.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
        } else dismissPopover();
      }
      if (event.key === 'Tab' && node.current) {
        const items = [
          ...node.current.querySelectorAll<HTMLElement>(
            'input:not(:disabled), textarea:not(:disabled), button:not(:disabled), select:not(:disabled)',
          ),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    function outside(event: PointerEvent) {
      if (
        !(event.target instanceof Element) ||
        node.current?.contains(event.target) ||
        event.target.closest('[role="dialog"]') ||
        anchor?.element.contains(event.target)
      )
        return;
      if (busy || dirty) {
        event.preventDefault();
        node.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
        return;
      }
      onClose();
    }
    function keepDraft(event: MouseEvent) {
      if (
        dirty &&
        event.target instanceof Element &&
        !node.current?.contains(event.target) &&
        !event.target.closest('[role="dialog"]') &&
        !anchor?.element.contains(event.target)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('click', keepDraft, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('click', keepDraft, true);
    };
  }, [anchor, busy, confirmDiscard, dirty, onClose]);
  return createPortal(
    <>
      <div
        className={
          anchor ? 'calendar-quick-add-backdrop' : 'calendar-quick-add-backdrop is-centered'
        }
        aria-hidden="true"
      />
      <div
        ref={(value) => {
          node.current = value;
          refs.setFloating(value);
        }}
        style={
          {
            ...(anchor ? floatingStyles : {}),
            '--composer-viewport-height': `${String(viewport.height)}px`,
            '--composer-viewport-top': `${String(viewport.top)}px`,
          } as CSSProperties
        }
        className={anchor ? 'calendar-quick-add' : 'calendar-quick-add is-centered'}
        role="dialog"
        aria-modal={!anchor || window.innerWidth <= 700 ? 'true' : 'false'}
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="sr-only">
          {messages.calendarQuickTitle}
        </h2>
        <div
          className="composer-swipe-handle"
          aria-hidden="true"
          onTouchStart={(event) => {
            swipeStart.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(event) => {
            const end = event.changedTouches[0]?.clientY;
            if (swipeStart.current !== null && end !== undefined && end - swipeStart.current > 60)
              requestClose();
            swipeStart.current = null;
          }}
        >
          <span />
        </div>
        <TaskComposer
          calendar
          initialDraft={initialDraft ?? { text: initialText, slot, defaultProjectId }}
          onDraftChange={setDirty}
          onDismiss={requestClose}
          onBusyChange={setBusy}
          onCaptured={onCreated}
          onExpand={
            anchor
              ? (draft) => {
                  expanding.current = true;
                  onClose();
                  openTaskComposer(draft);
                }
              : undefined
          }
        />
        {confirmDiscard ? (
          <div className="composer-discard" role="alertdialog" aria-label={labels.discardTitle}>
            <p>{labels.discardTitle}</p>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmDiscard(false);
                node.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
              }}
            >
              {labels.keepEditing}
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              {labels.discard}
            </button>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
