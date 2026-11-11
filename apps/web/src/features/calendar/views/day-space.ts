import type { KeyboardEvent, MouseEvent } from 'react';
import type { SlotAnchor } from '../../capture/calendar-slot';

export function createInDaySpaceWithKey(
  event: KeyboardEvent<HTMLElement>,
  day: string,
  onCreate?: (day: string, anchor: SlotAnchor) => void,
) {
  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  const box = event.currentTarget.getBoundingClientRect();
  onCreate?.(day, { element: event.currentTarget, x: box.left, y: box.top });
}

export function createInDaySpace(
  event: MouseEvent<HTMLElement>,
  day: string,
  onCreate?: (day: string, anchor: SlotAnchor) => void,
) {
  if (
    !(event.target instanceof Element) ||
    event.target.closest('button, a, input, header, .mobile-week-chip, .agenda-row')
  )
    return;
  onCreate?.(day, { element: event.currentTarget, x: event.clientX, y: event.clientY });
}
