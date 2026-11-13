import { expect, it } from 'vitest';
import { firstPaintMonths } from './year-paint';

const YEAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

it('paints the focus month and its neighbours inside the year', () => {
  expect(firstPaintMonths(YEAR, 10)).toEqual([9, 10, 11]);
  expect(firstPaintMonths(YEAR, 0)).toEqual([0, 1]);
  expect(firstPaintMonths(YEAR, 11)).toEqual([10, 11]);
});

it('keeps a quarter on the first paint', () => {
  expect(firstPaintMonths([3, 4, 5], 4)).toEqual([3, 4, 5]);
});
