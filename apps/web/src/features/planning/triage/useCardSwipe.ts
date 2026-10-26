import { useEffect, useRef, useState, type TouchEventHandler } from 'react';

export function useCardSwipe(input: {
  disabled: boolean;
  distance: () => number;
  canPrevious: boolean;
  canNext: boolean;
  navigate: (delta: number) => void;
}) {
  const latest = useRef(input);
  latest.current = input;
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offset, setOffset] = useState(0);
  const [moving, setMoving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState(1);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (input.disabled) {
      touch.current = null;
      setOffset(0);
      setMoving(false);
    }
  }, [input.disabled]);
  const onTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    if (
      latest.current.disabled ||
      leaving ||
      (event.target as Element).closest('button,a,input,select,textarea,[role="dialog"]')
    )
      return;
    const point = event.touches[0];
    if (point) touch.current = { x: point.clientX, y: point.clientY, at: performance.now() };
  };
  const onTouchMove: TouchEventHandler<HTMLDivElement> = (event) => {
    const point = event.touches[0],
      start = touch.current;
    if (!point || !start || latest.current.disabled) return;
    const dx = point.clientX - start.x,
      dy = point.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      touch.current = null;
      setOffset(0);
      setMoving(false);
      return;
    }
    if (Math.abs(dx) < 8) return;
    const allowed = dx > 0 ? latest.current.canPrevious : latest.current.canNext;
    setMoving(true);
    setOffset(allowed ? dx : dx * 0.15);
  };
  function navigate(delta: number) {
    if (
      latest.current.disabled ||
      leaving ||
      !(delta < 0 ? latest.current.canPrevious : latest.current.canNext)
    )
      return;
    setDirection(delta);
    setLeaving(true);
    setOffset(-delta * latest.current.distance());
    timer.current = setTimeout(() => {
      latest.current.navigate(delta);
      setOffset(0);
      setLeaving(false);
      timer.current = null;
    }, 170);
  }
  const onTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    const point = event.changedTouches[0],
      start = touch.current;
    touch.current = null;
    setMoving(false);
    if (!point || !start || latest.current.disabled) {
      setOffset(0);
      return;
    }
    const dx = point.clientX - start.x,
      dy = point.clientY - start.y;
    const delta = dx > 0 ? -1 : 1;
    const allowed = delta < 0 ? latest.current.canPrevious : latest.current.canNext;
    if (
      !allowed ||
      Math.abs(dy) > 60 ||
      (Math.abs(dx) < 60 &&
        (Math.abs(dx) < 24 || Math.abs(dx) / Math.max(1, performance.now() - start.at) < 0.45))
    ) {
      setOffset(0);
      return;
    }
    navigate(delta);
  };
  return {
    navigate,
    offset,
    moving,
    leaving,
    direction,
    bind: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: () => {
        touch.current = null;
        setOffset(0);
        setMoving(false);
      },
    },
  };
}
