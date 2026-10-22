import type { ReactNode } from 'react';
export function TodayMark({
  today,
  children,
  className = '',
}: {
  readonly today: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={`${className} ${today ? 'today-mark' : ''}`.trim()}
      data-today={today ? 'true' : undefined}
      aria-current={today ? 'date' : undefined}
    >
      {children}
    </span>
  );
}
