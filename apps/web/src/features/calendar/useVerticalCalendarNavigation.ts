import { useRef, type PointerEvent, type MouseEvent } from 'react';

export function useVerticalCalendarNavigation(onMove?: (delta: number) => void) {
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(0);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      gesture.current =
        onMove && event.pointerType === 'touch' && event.isPrimary
          ? { x: event.clientX, y: event.clientY }
          : null;
    },
    onPointerCancel() {
      gesture.current = null;
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      gesture.current = null;
      if (!onMove || !start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dy) >= 65 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        suppressClick.current = Date.now() + 400;
        onMove(dy < 0 ? 1 : -1);
      }
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (Date.now() < suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
