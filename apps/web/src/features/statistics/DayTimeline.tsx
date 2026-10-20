import { useState } from 'react';
import { dayKey } from '@reflexionia/domain';
import { useChartTheme } from './chart-theme';
import { useStatisticsText } from './text';
import { DataTable } from './DataTable';
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
  tz = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
  readonly day: string;
  readonly blocks: readonly TimelineBlock[];
  readonly tz?: string;
}) {
  const theme = useChartTheme();
  const { t, day: humanDay, duration, locale } = useStatisticsText();
  const [selected, setSelected] = useState<TimelineBlock | null>(null);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const wall = (iso: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    return (
      Number(parts.find((part) => part.type === 'hour')?.value) * 60 +
      Number(parts.find((part) => part.type === 'minute')?.value)
    );
  };
  const date = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  return (
    <>
      <div className="stats-timeline-scroll">
        <svg
          viewBox="0 0 960 64"
          className="stats-timeline"
          role="group"
          aria-label={`${t('timeline')} ${humanDay(day)}`}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <text
              key={index}
              x={Math.min(937, index * 120 + 3)}
              y={14}
              fill={theme.inkFaint}
              fontSize="var(--fs-xs)"
            >
              {index * 3}:00
            </text>
          ))}
          {dayKey(new Date().toISOString(), tz) === day ? (
            <line
              x1={wall(new Date().toISOString()) / 1.5}
              x2={wall(new Date().toISOString()) / 1.5}
              y1={20}
              y2={58}
              stroke={theme.danger}
              strokeWidth={2}
            >
              <title>{t('today')}</title>
            </line>
          ) : null}
          {blocks.map((block) => {
            const start = date(block.start) < day ? 0 : wall(block.start);
            const end =
              block.end === null
                ? Math.min(1440, start + block.minutes)
                : date(block.end) > day
                  ? 1440
                  : wall(block.end);
            return (
              <rect
                key={block.id}
                x={start / 1.5}
                y={26}
                width={Math.max(2, (end - start) / 1.5)}
                height={24}
                rx={3}
                fill={theme.accent}
                role="button"
                tabIndex={0}
                aria-label={`${time(block.start)} · ${block.task_title ?? t('noTask')} · ${duration(block.minutes)}`}
                onClick={() => {
                  setSelected(block);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(block);
                  }
                }}
              >
                <title>
                  {block.task_title ?? t('noTask')} · {duration(block.minutes)}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>
      {selected ? (
        <div
          className="stats-day-detail"
          role="dialog"
          aria-label={t('sessions')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSelected(null);
          }}
        >
          <p>
            {time(selected.start)} · {selected.task_title ?? t('noTask')} ·{' '}
            {duration(selected.minutes)}
          </p>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
            }}
          >
            {t('close')}
          </button>
        </div>
      ) : null}
      <DataTable
        caption={t('timeline')}
        headers={[t('hour'), t('tasks'), t('focusTime')]}
        rows={blocks.map((block) => [
          time(block.start),
          block.task_title ?? t('noTask'),
          duration(block.minutes),
        ])}
      />
    </>
  );
}
