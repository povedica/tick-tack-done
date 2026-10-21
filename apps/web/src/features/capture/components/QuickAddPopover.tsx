import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useMessages } from '../../../i18n';
import { bindPopover, dismissPopover } from '../../../components/popover-stack';
import { TaskComposer } from '../../tasks/TaskComposer';
import type { CalendarSlot, SlotAnchor } from '../calendar-slot';
import { openTaskComposer } from '../notice';
import type { CaptureNotice } from '../notice';
import './quick-add-popover.css';

export function QuickAddPopover({
  slot,
  anchor,
  defaultProjectId,
  onClose,
  onCreated,
}: {
  readonly slot: CalendarSlot;
  readonly anchor: SlotAnchor;
  readonly defaultProjectId?: string | undefined;
  readonly onClose: () => void;
  readonly onCreated: (notice: CaptureNotice) => void;
}) {
  const messages = useMessages();
  const titleId = useId();
  const [dirty, setDirty] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);
  const expanding = useRef(false);
  const { refs, floatingStyles } = useFloating({
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  useLayoutEffect(() => {
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
  useEffect(() => bindPopover(onClose), [onClose]);
  useEffect(() => {
    node.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => {
      if (!expanding.current && anchor.element.isConnected)
        anchor.element.focus({ preventScroll: true });
    };
  }, [anchor]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      // A nested DatePopover/menu owns its keys until it closes.
      if (event.target instanceof Node && !node.current?.contains(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        dismissPopover();
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
        dirty ||
        !(event.target instanceof Element) ||
        node.current?.contains(event.target) ||
        event.target.closest('[role="dialog"]') ||
        anchor.element.contains(event.target)
      )
        return;
      onClose();
    }
    function keepDraft(event: MouseEvent) {
      if (
        dirty &&
        event.target instanceof Element &&
        !node.current?.contains(event.target) &&
        !event.target.closest('[role="dialog"]') &&
        !anchor.element.contains(event.target)
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
  }, [anchor, dirty, onClose]);
  return createPortal(
    <div
      ref={(value) => {
        node.current = value;
        refs.setFloating(value);
      }}
      style={floatingStyles}
      className="calendar-quick-add"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">
        {messages.calendarQuickTitle}
      </h2>
      <TaskComposer
        calendar
        initialDraft={{ text: '', slot, defaultProjectId }}
        onDraftChange={setDirty}
        onDismiss={onClose}
        onCaptured={onCreated}
        onExpand={(draft) => {
          expanding.current = true;
          onClose();
          openTaskComposer(draft);
        }}
      />
    </div>,
    document.body,
  );
}
