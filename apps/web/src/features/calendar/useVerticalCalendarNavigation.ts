import { useRef, type PointerEvent, type MouseEvent } from 'react';

export function useVerticalCalendarNavigation(onMove?: (delta: number) => void) {
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(0);
  const finish = (event: PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!onMove || !start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) >= 65 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      suppressClick.current = Date.now() + 400;
      onMove(dy < 0 ? 1 : -1);
    }
  };
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!(onMove && event.pointerType === 'touch' && event.isPrimary)) {
        gesture.current = null;
        return;
      }
      gesture.current = { x: event.clientX, y: event.clientY };
      // Keep pointerup when the finger leaves the board. A cancelled touch still
      // reports its last point, and that point is enough to accept the swipe.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is optional. pointerup or pointercancel still carries the distance.
      }
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      finish(event);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      finish(event);
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (Date.now() < suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
