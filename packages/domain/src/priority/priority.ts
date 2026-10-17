import type { Priority } from '../types';

/** TickTick Open API values. Used by the compatibility layer, not by /api/v1. */
export type TickTickPriority = 0 | 1 | 3 | 5;

const TO_TICKTICK: Readonly<Record<Priority, TickTickPriority>> = {
  none: 0,
  low: 1,
  medium: 3,
  high: 5,
};

const FROM_TICKTICK: Readonly<Record<TickTickPriority, Priority>> = {
  0: 'none',
  1: 'low',
  3: 'medium',
  5: 'high',
};

/** Lower rank sorts first: high, medium, low, none. */
const RANK: Readonly<Record<Priority, number>> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export const PRIORITIES: readonly Priority[] = ['none', 'low', 'medium', 'high'];

export function isPriority(value: string): value is Priority {
  return value === 'none' || value === 'low' || value === 'medium' || value === 'high';
}

export function comparePriority(left: Priority, right: Priority): number {
  return RANK[left] - RANK[right];
}

export function priorityToTickTick(priority: Priority): TickTickPriority {
  return TO_TICKTICK[priority];
}

export function priorityFromTickTick(value: number): Priority {
  if (value === 0 || value === 1 || value === 3 || value === 5) {
    return FROM_TICKTICK[value];
  }
  throw new Error(`unsupported TickTick priority: ${String(value)}`);
}
