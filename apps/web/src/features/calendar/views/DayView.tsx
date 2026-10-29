import { memo } from 'react';
import { HourGrid } from '../../places/HourGrid';

/** Day and multi-day hour board. Week on a wide screen uses the same grid. */
export const DayView = memo(HourGrid);
