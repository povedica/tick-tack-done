import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

const DELAY_MS = 500;
const MOVE_PX = 8;

/**
 * Touch-and-hold (and the context-menu shortcut) for rows that have no hover
 * button. A move past 8 px or a pointerup cancels the timer.
 */
export function useLongPress(onLongPress: () => void): {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
} {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const fire = useRef(onLongPress);
  fire.current = onLongPress;

  function clear(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    timer.current = null;
    origin.current = null;
  }

  useEffect(() => clear, []);

  return {
    onPointerDown(event) {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        timer.current = null;
        fire.current();
      }, DELAY_MS);
    },
    onPointerMove(event) {
      const start = origin.current;
      if (start === null) {
        return;
      }
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance > MOVE_PX) {
        clear();
      }
    },
    onPointerUp() {
      clear();
    },
    onPointerCancel() {
      clear();
    },
    onContextMenu(event) {
      event.preventDefault();
      fire.current();
    },
    onClickCapture(event) {
      if (!fired.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      fired.current = false;
    },
  };
}
