import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
import { planPlacement, type OrderedRow, type SortPlan } from './plan-sort-order.js';

export function placementPlan(
  rows: readonly OrderedRow[],
  movingId: string | null,
  beforeId: string | null | undefined,
  moveToEnd: boolean | undefined,
): SortPlan {
  if (beforeId !== undefined && moveToEnd === true) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'before_id and move_to_end cannot both be set',
    );
  }
  const placement =
    beforeId === undefined || moveToEnd === true ? { end: true as const } : { beforeId };
  try {
    return planPlacement(rows, movingId, placement);
  } catch (error) {
    if (error instanceof Error && error.message === 'missing_neighbor') {
      throw new DomainException(HttpStatus.NOT_FOUND, 'not_found', 'Sort neighbor was not found');
    }
    throw error;
  }
}
