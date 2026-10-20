import { useChartTheme } from './chart-theme';

export interface TimelineBlock {
  readonly id: string;
  readonly start: string;
  readonly end: string | null;
  readonly minutes: number;
  readonly task_title: string | null;
}

export function DayTimeline({
  day,
  blocks,
}: {
  readonly day: string;
  readonly blocks: readonly TimelineBlock[];
}) {
  const theme = useChartTheme();
  return (
    <div className="stats-timeline" role="img" aria-label={`Línea temporal del ${day}`}>
      <div className="stats-timeline-track">
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className="stats-timeline-mark"
            style={{ left: `${String(((index * 3) / 24) * 100)}%` }}
          >
            {String(index * 3).padStart(2, '0')}
          </span>
        ))}
        {blocks.map((block) => {
          const start = wallMinutes(block.start);
          const end = block.end === null ? start + block.minutes : wallMinutes(block.end);
          const left = (start / (24 * 60)) * 100;
          const width = Math.max(0.4, ((end - start) / (24 * 60)) * 100);
          return (
            <button
              key={block.id}
              type="button"
              className="stats-timeline-block"
              style={{ left: `${String(left)}%`, width: `${String(width)}%`, background: theme.accent }}
              title={`${block.task_title ?? 'Sin tarea'} · ${String(block.minutes)} min`}
            />
          );
        })}
      </div>
    </div>
  );
}

function wallMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}
