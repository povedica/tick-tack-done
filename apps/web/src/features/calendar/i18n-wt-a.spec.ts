import { expect, it } from 'vitest';
import { es, en } from './i18n-wt-a';
it('RF-1101: calendar messages have matching keys', () =>
  expect(Object.keys(es)).toEqual(Object.keys(en)));
