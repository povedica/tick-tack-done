import { useEffect, useState } from 'react';
import { useMessages } from '../i18n';

const KEY = 'tick-tack-done.detail-width';
const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
const viewportMax = (): number =>
  Math.max(
    MIN_WIDTH,
    Math.min(
      MAX_WIDTH,
      Math.floor(window.innerWidth * 0.6),
      window.innerWidth < 1100 ? MAX_WIDTH : window.innerWidth - 600,
    ),
  );

export function readDetailWidth(storage: Storage): number {
  const saved = storage.getItem(KEY);
  if (saved === null) return DEFAULT_WIDTH;
  const raw = Number(saved);
  if (!Number.isFinite(raw)) {
    return DEFAULT_WIDTH;
  }
  return clamp(raw);
}

export function DetailResizer({
  width,
  onWidth,
}: {
  readonly width: number;
  readonly onWidth: (next: number) => void;
}) {
  const messages = useMessages();
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 700px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 700px)');
    const sync = (): void => {
      setWide(media.matches);
    };
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);
  if (!wide) {
    return null;
  }
  return (
    <div
      className="detail-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={messages.detailResize}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={viewportMax()}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const start = width;
        function move(next: PointerEvent): void {
          onWidth(Math.min(viewportMax(), clamp(start - (next.clientX - startX))));
        }
        function up(next: PointerEvent): void {
          handle.releasePointerCapture(next.pointerId);
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
        }
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
      }}
      onDoubleClick={() => {
        onWidth(DEFAULT_WIDTH);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onWidth(Math.min(viewportMax(), clamp(width + 16)));
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onWidth(clamp(width - 16));
        }
      }}
    />
  );
}

export function storeDetailWidth(storage: Storage, width: number): void {
  storage.setItem(KEY, String(clamp(width)));
}

function clamp(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}
