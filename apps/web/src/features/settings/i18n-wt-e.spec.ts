import { expect, it } from 'vitest';
import { es, en } from './i18n-wt-e';
it('TTD-AUD-129: translations share keys', () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
});
