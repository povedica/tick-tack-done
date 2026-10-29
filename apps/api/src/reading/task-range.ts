import type { Prisma } from '@prisma/client';

export type TaskRangeField = 'due' | 'start' | 'any';

/**
 * [from, to) on due, start, or any of those plus an interval that overlaps the window.
 * The overlap branch is start < to AND due >= from, the same predicate GET /tasks uses.
 */
export function taskRangeWhere(
  lower: Date | undefined,
  upper: Date | undefined,
  rangeField: TaskRangeField,
): Prisma.TaskWhereInput | null {
  if (lower === undefined && upper === undefined) {
    return null;
  }
  const bounds = {
    ...(lower === undefined ? {} : { gte: lower }),
    ...(upper === undefined ? {} : { lt: upper }),
  };
  if (rangeField === 'due') {
    return { dueDate: bounds };
  }
  if (rangeField === 'start') {
    return { startDate: bounds };
  }
  return {
    OR: [
      { dueDate: bounds },
      { startDate: bounds },
      {
        startDate: { not: null, ...(upper === undefined ? {} : { lt: upper }) },
        dueDate: { not: null, ...(lower === undefined ? {} : { gte: lower }) },
      },
    ],
  };
}
