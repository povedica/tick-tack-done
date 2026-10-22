import { useLayoutEffect, useRef, useState } from 'react';
import { AlarmClock } from 'lucide-react';

/** Preserve the complete value in title; reduce to the largest duration unit only if space runs out. */
export function CompactTaskTime({
  value,
  date,
  reminder,
}: {
  readonly value: string;
  readonly date: string | null;
  readonly reminder: boolean;
}) {
  const ref = useRef<HTMLTimeElement>(null);
  const [compact, setCompact] = useState(false);
  const largest =
    value
      .split('·')
      .at(-1)
      ?.trim()
      .match(/^\d+\s+(?:d|h|min)\b/)?.[0] ?? value;
  useLayoutEffect(() => {
    const node = ref.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const measure = () => {
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = getComputedStyle(node).font;
      const siblings = [...parent.children].filter((child) => child !== node);
      const gap = Number.parseFloat(getComputedStyle(parent).columnGap) || 0;
      const used =
        siblings.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) +
        gap * siblings.length;
      setCompact(
        context.measureText(value).width + (reminder ? 16 : 0) > parent.clientWidth - used,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => { observer.disconnect(); };
  }, [value, reminder]);
  return (
    <time ref={ref} className="task-time" title={value} dateTime={date ?? undefined}>
      {compact ? largest : value}
      {reminder ? <AlarmClock size={12} aria-hidden="true" /> : null}
    </time>
  );
}
